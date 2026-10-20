import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, Money, Alert, Tabs, Empty, Field, Progress, StatusBadge } from '../components/ui.jsx';
import { proposalTotals, eventFinancials, clientOf, headcount } from '../lib/derived.js';
import { proposalExpired } from '../lib/pricing.js';
import { clientCan } from '../lib/permissions.js';
import { fmtDate, diffDays } from '../lib/dates.js';
import { ProposalTable, Moodboard } from './event/ProposalTab.jsx';
import { SignaturePanel } from './event/ContractTab.jsx';
import { InvoiceTable } from './event/FinanceTab.jsx';
import { CoCard } from './event/ChangeOrdersTab.jsx';
import { GuestTable, AddHouseholdModal } from './event/GuestsTab.jsx';
import { SeatingBoard } from './event/SeatingTab.jsx';
import { Chat } from './event/MessagesTab.jsx';

export default function ClientPortal() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, user, today } = useStore();
  const mine = state.events.filter((e) => e.clientId === user.clientId);
  const ev = mine.find((e) => e.id === id) ?? mine.find((e) => e.contract) ?? mine[0];
  const [tab, setTab] = useState('home');
  if (!ev) return <Empty>No events linked to your account.</Empty>;
  const et = state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
  const can = (p) => clientCan(user, p);
  const viewAll = can('view_all');
  const tabs = [
    { id: 'home', label: 'Overview' },
    viewAll && { id: 'proposal', label: 'Proposal' },
    (viewAll || can('sign')) && { id: 'contract', label: 'Contract' },
    (viewAll || can('pay')) && { id: 'payments', label: 'Payments' },
    (viewAll || can('approve_costs')) && { id: 'co', label: 'Change Orders', count: ev.changeOrders.filter((c) => c.status === 'sent').length },
    (viewAll || can('forms')) && { id: 'forms', label: 'Planning forms' },
    (viewAll || can('manage_guests')) && { id: 'guests', label: et.features.registration ? 'Attendees' : 'Guests' },
    (viewAll || can('manage_guests')) && et.features.seating && { id: 'seating', label: 'Seating' },
    viewAll && { id: 'tasks', label: 'My checklist' },
    can('message') && { id: 'messages', label: 'Messages' },
    ev.closing.surveySent && { id: 'survey', label: 'Feedback' },
  ].filter(Boolean);
  const Comp = { home: Home, proposal: PortalProposal, contract: PortalContract, payments: PortalPayments, co: PortalCO, forms: PortalForms, guests: PortalGuests, seating: PortalSeating, tasks: PortalTasks, messages: PortalMessages, survey: PortalSurvey }[tab] ?? Home;
  return (
    <div>
      <div className="portal-hero">
        <div className="row between">
          <div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>{state.settings.company.name} · Client portal</div>
            <h1>{ev.name}</h1>
            <div>{ev.date ? fmtDate(ev.date, { weekday: 'long' }) : 'Date TBD'} · {ev.venue?.name}{ev.date >= today && ` · ${diffDays(today, ev.date)} days to go`}</div>
          </div>
          {mine.length > 1 && <select value={ev.id} onChange={(e) => nav(`/portal/${e.target.value}`)}>{mine.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>Signed in as {user.name} · access: {(user.permissions || []).join(', ')}{user.payerScope ? ` · paying for ${user.payerScope.join(', ')}` : ''}</div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <Comp ev={ev} et={et} />
    </div>
  );
}

function Home({ ev, et }) {
  const { state, user, today } = useStore();
  const f = eventFinancials(state, ev);
  const tasks = ev.tasks.filter((t) => t.assigneeType === 'client');
  const done = tasks.filter((t) => t.status === 'done').length;
  const pendingCO = ev.changeOrders.filter((c) => c.status === 'sent');
  const unsigned = ev.contract && !ev.contract.immutable && ev.contract.status !== 'draft';
  const hc = headcount(ev);
  const myPayer = ev.payers.find((p) => p.userId === user.id);
  return (
    <div>
      {unsigned && <Alert tone="warning">Your contract is ready to sign.</Alert>}
      {ev.dateStatus === 'hold' && ev.contract?.immutable && <Alert tone="warning">Your date is on HOLD until the deposit is received. Pay the deposit to lock {fmtDate(ev.date)}.</Alert>}
      {pendingCO.map((c) => <Alert key={c.id} tone="info">Change Order {c.number} “{c.title}” awaits your approval.</Alert>)}
      <div className="grid g3 mt">
        {clientCan(user, 'view_all') && <Card title="Payments"><div className="row between"><span>Paid</span><b><Money value={f.paid} currency={ev.currency} /></b></div><div className="row between"><span>Contract total</span><b><Money value={f.contractTotal} currency={ev.currency} /></b></div><Progress value={f.contractTotal ? (f.paid / f.contractTotal) * 100 : 0} tone="ok" /></Card>}
        {myPayer && !clientCan(user, 'view_all') && <Card title="Your share">You are paying for: <b>{myPayer.categories.join(', ') || 'all'}</b><div className="faint mt">Only the invoices assigned to you are shown.</div></Card>}
        {clientCan(user, 'view_all') && <Card title="My checklist"><div>{done}/{tasks.length} done</div><Progress value={tasks.length ? (done / tasks.length) * 100 : 0} /><div className="mt">{tasks.filter((t) => t.status !== 'done').slice(0, 4).map((t) => <div key={t.id} style={{ fontSize: 13 }}>☐ {t.title} <span className="faint">{fmtDate(t.dueDate)}</span></div>)}</div></Card>}
        {ev.households.length > 0 && <Card title="RSVPs"><div className="row between"><span>Confirmed</span><b>{hc.confirmed}</b></div><div className="row between"><span>Pending</span><b>{hc.pending}</b></div><div className="row between"><span>Declined</span><b>{hc.declined}</b></div></Card>}
      </div>
      {clientCan(user, 'view_all') && ev.design.palette.length > 0 && (
        <Card title="Your design" className="mt"><div className="row mb">{ev.design.palette.map((c) => <span key={c} className="swatch" style={{ background: c }} />)}</div><div className="muted">{ev.design.notes}</div><div className="mt"><Moodboard itemIds={ev.design.decorItemIds} /></div></Card>
      )}
    </div>
  );
}

function PortalProposal({ ev }) {
  const { state, act, user, today } = useStore();
  const v = ev.proposals.find((p) => p.status === 'active') ?? ev.proposals.find((p) => p.status === 'accepted');
  if (!v) return <Empty>No proposal shared yet.</Empty>;
  const t = proposalTotals(state, ev, v);
  const expired = proposalExpired(v, today);
  const canApprove = clientCan(user, 'approve_costs');
  return (
    <div>
      <Card title={`Proposal v${v.version}`} actions={<StatusBadge status={expired ? 'expired' : v.status} />}>
        {expired ? <Alert tone="danger">This proposal expired on {fmtDate(v.validUntil)}. Please ask your planner for an updated version.</Alert> : v.status === 'active' && <Alert tone="info">Valid until {fmtDate(v.validUntil)}. Tick optional extras to add them — the total updates instantly.</Alert>}
        <div className="mt"><ProposalTable ev={ev} version={v} totals={t} internal={false} editable={false} onToggleOptional={v.status === 'active' && canApprove && !expired ? (l) => act('PROPOSAL_TOGGLE_OPTIONAL', { eventId: ev.id, versionId: v.id, lineId: l.id }) : null} /></div>
        {v.status === 'active' && canApprove && <button className="btn primary mt" disabled={expired} onClick={() => act('PROPOSAL_ACCEPT', { eventId: ev.id, versionId: v.id })}>Accept proposal</button>}
        {!canApprove && <div className="faint mt">You don't have permission to approve costs.</div>}
      </Card>
      <Card title="Moodboard"><Moodboard itemIds={v.moodboard} /></Card>
    </div>
  );
}

function PortalContract({ ev }) {
  const { user } = useStore();
  if (!ev.contract || ev.contract.status === 'draft') return <Empty>Your contract is being prepared.</Empty>;
  const allowed = ev.contract.signers.filter((s) => s.email === user.email || s.name.split(' ')[0] === user.name.split(' ')[0]).map((s) => s.id);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(280px,2fr)' }}>
      <Card title="Agreement"><div className="contract-body">{ev.contract.body}</div></Card>
      <Card title="Signatures">
        {clientCan(user, 'sign') ? <SignaturePanel ev={ev} allowSignerIds={allowed} /> : <div className="faint">You don't have signing rights.</div>}
        {ev.contract.immutable && <Alert tone="success">Fully signed — thank you!</Alert>}
      </Card>
    </div>
  );
}

function PortalPayments({ ev }) {
  const { user } = useStore();
  const myPayer = ev.payers.find((p) => p.userId === user.id);
  const filter = clientCan(user, 'view_all') ? null : myPayer ? [myPayer.id] : [];
  if (!clientCan(user, 'pay') && !clientCan(user, 'view_all')) return <Empty>No access.</Empty>;
  return (
    <div>
      <Card title="Payment schedule">
        <table className="t"><tbody>{ev.paymentSchedule.map((p) => <tr key={p.id}><td>{p.label}</td><td>{fmtDate(p.dueDate)}</td><td className="num"><Money value={p.amount} currency={ev.currency} /></td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table>
      </Card>
      <Card title="Invoices">{clientCan(user, 'pay') ? <InvoiceTable ev={ev} portal payerFilter={filter} /> : <div className="faint">View only.</div>}</Card>
    </div>
  );
}

function PortalCO({ ev }) {
  const { user } = useStore();
  const list = ev.changeOrders.filter((c) => c.status !== 'draft');
  if (!list.length) return <Empty>No change orders.</Empty>;
  return <div className="stack">{!clientCan(user, 'approve_costs') && <Alert tone="info">You can view but not approve change orders.</Alert>}{list.slice().reverse().map((c) => clientCan(user, 'approve_costs') ? <CoCard key={c.id} ev={ev} co={c} portal /> : <CoCard key={c.id} ev={ev} co={{ ...c, status: c.status === 'sent' ? 'awaiting approval' : c.status }} portal />)}</div>;
}

function PortalForms({ ev }) {
  const { act } = useStore();
  const [answers, setAnswers] = useState({});
  return (
    <div className="grid g2">
      {ev.forms.map((f) => (
        <Card key={f.id} title={f.name} actions={f.submittedAt ? <Badge tone="ok">submitted</Badge> : <Badge tone="warn">to do</Badge>}>
          {f.fields.map((fd) => (
            <Field key={fd.key} label={fd.label} style={{ marginBottom: 8 }}>
              {fd.type === 'textarea'
                ? <textarea defaultValue={f.answers[fd.key] || ''} onChange={(e) => setAnswers({ ...answers, [f.id]: { ...answers[f.id], [fd.key]: e.target.value } })} />
                : <input defaultValue={f.answers[fd.key] || ''} onChange={(e) => setAnswers({ ...answers, [f.id]: { ...answers[f.id], [fd.key]: e.target.value } })} />}
            </Field>
          ))}
          <div className="row">
            <button className="btn" onClick={() => act('FORM_SAVE', { eventId: ev.id, formId: f.id, answers: answers[f.id] || {}, submit: false })}>Save draft</button>
            <button className="btn primary" onClick={() => act('FORM_SAVE', { eventId: ev.id, formId: f.id, answers: answers[f.id] || {}, submit: true })}>Submit</button>
          </div>
        </Card>
      ))}
      <Card title="Upload inspiration">
        <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && act('DOCUMENT_ADD', { eventId: ev.id, name: e.target.files[0].name, type: 'Inspiration' })} />
      </Card>
    </div>
  );
}

function PortalGuests({ ev, et }) {
  const { user } = useStore();
  const [add, setAdd] = useState(false);
  const can = clientCan(user, 'manage_guests');
  return (
    <Card title="Guest list (shared with your planner)" actions={can && <button className="btn primary" onClick={() => setAdd(true)}>{et.features.registration ? '+ Register attendee' : '+ Household'}</button>}>
      <GuestTable ev={ev} readOnly={!can} />
      {add && <AddHouseholdModal ev={ev} et={et} onClose={() => setAdd(false)} />}
    </Card>
  );
}

function PortalSeating({ ev }) {
  const { user } = useStore();
  return <Card title="Seating chart (drag & drop with your planner)"><SeatingBoard ev={ev} readOnly={!clientCan(user, 'manage_guests')} /></Card>;
}

function PortalTasks({ ev }) {
  const { act } = useStore();
  const tasks = ev.tasks.filter((t) => t.assigneeType === 'client').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <Card title="Your checklist">
      {tasks.map((t) => (
        <label key={t.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
          <input type="checkbox" checked={t.status === 'done'} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { status: e.target.checked ? 'done' : 'todo' } })} />
          <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
          <span className="faint">{fmtDate(t.dueDate)}</span>
        </label>
      ))}
    </Card>
  );
}

function PortalMessages({ ev }) {
  return <Card title="Messages with your planner"><Chat ev={ev} /></Card>;
}

function PortalSurvey({ ev }) {
  const { act } = useStore();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  if (ev.closing.survey) return <Alert tone="success">Thank you for your feedback ({ev.closing.survey.rating}/5)!</Alert>;
  return (
    <Card title="How did we do?">
      <div className="row">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`btn ${rating >= n ? 'primary' : ''}`} onClick={() => setRating(n)}>★</button>)}</div>
      <textarea className="mt" placeholder="Tell us more…" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn primary mt" onClick={() => act('SURVEY_SUBMIT', { eventId: ev.id, rating, comment })}>Submit</button>
    </Card>
  );
}
