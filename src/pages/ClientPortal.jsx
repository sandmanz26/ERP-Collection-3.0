import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, Alert, Tabs, EmptyState, Field, StatusBadge, Button, printDocument, Icon } from '../design-system/index.js';
import { proposalHtml } from '../lib/documents.js';
import { proposalTotals } from '../lib/derived.js';
import { proposalExpired } from '../lib/pricing.js';
import { clientPrep } from '../lib/clientView.js';
import { ClientHome, ClientTimelinePanel, ClientAgenda, ClientPrep, ClientPayments, ClientTeamPanel } from './client/ClientPanels.jsx';
import { clientCan } from '../lib/permissions.js';
import { fmtDate, diffDays } from '../lib/dates.js';
import { ProposalTable, Moodboard } from './event/ProposalTab.jsx';
import { SignaturePanel } from './event/ContractTab.jsx';
import { CoCard } from './event/ChangeOrdersTab.jsx';
import { GuestTable, AddHouseholdModal } from './event/GuestsTab.jsx';
import { SeatingBoard } from './event/SeatingTab.jsx';
import { Chat } from './event/MessagesTab.jsx';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard', tabs: ['home'] },
  { id: 'timeline', label: 'Timeline', icon: 'calendar', tabs: ['timeline', 'agenda'] },
  { id: 'prep', label: 'To prepare', icon: 'checkSquare', tabs: ['prep', 'forms'] },
  { id: 'money', label: 'Payments', icon: 'wallet', tabs: ['payments', 'co', 'proposal', 'contract'] },
  { id: 'team', label: 'Team', icon: 'users', tabs: ['team'] },
  { id: 'guests', label: 'Guests', icon: 'heart', tabs: ['guests', 'seating'] },
  { id: 'messages', label: 'Messages', icon: 'mail', tabs: ['messages', 'survey'] },
];

export default function ClientPortal() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, user, today } = useStore();
  const mine = state.events.filter((e) => e.clientId === user.clientId);
  const ev = mine.find((e) => e.id === id) ?? mine.find((e) => e.contract) ?? mine[0];
  const [tab, setTabState] = useState('home');
  if (!ev) return <EmptyState>No events linked to your account.</EmptyState>;
  const et = state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
  const can = (p) => clientCan(user, p);
  const viewAll = can('view_all');
  const money = viewAll || can('pay');
  const prepCount = clientPrep(state, ev, user, today).open;
  const TABS = {
    home: { label: 'Overview', Comp: ClientHome },
    timeline: { label: 'Road map', Comp: ClientTimelinePanel },
    agenda: { label: 'Event day', Comp: ClientAgenda },
    prep: { label: 'Checklist', Comp: ClientPrep, count: prepCount },
    forms: can('forms') || viewAll ? { label: 'Planning forms', Comp: PortalForms, count: ev.forms.filter((f) => !f.submittedAt).length } : null,
    payments: money ? { label: 'Payments', Comp: ClientPayments } : null,
    co: viewAll || can('approve_costs') ? { label: 'Change orders', Comp: PortalCO, count: ev.changeOrders.filter((c) => c.status === 'sent').length } : null,
    proposal: viewAll ? { label: 'Proposal', Comp: PortalProposal } : null,
    contract: viewAll || can('sign') ? { label: 'Contract', Comp: PortalContract } : null,
    team: { label: 'Team', Comp: ClientTeamPanel },
    guests: viewAll || can('manage_guests') ? { label: et.features.registration ? 'Attendees' : 'Guest list', Comp: PortalGuests } : null,
    seating: (viewAll || can('manage_guests')) && et.features.seating ? { label: 'Seating', Comp: PortalSeating } : null,
    messages: can('message') ? { label: 'Messages', Comp: PortalMessages } : null,
    survey: ev.closing.surveySent ? { label: 'Feedback', Comp: PortalSurvey } : null,
  };
  const sections = SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => TABS[t]) })).filter((s) => s.tabs.length);
  const current = TABS[tab] ? tab : 'home';
  const section = sections.find((s) => s.tabs.includes(current)) ?? sections[0];
  const setTab = (t) => { setTabState(TABS[t] ? t : 'home'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const { Comp } = TABS[current];
  const daysToGo = ev.date ? diffDays(today, ev.date) : null;
  return (
    <div>
      <div className="portal-hero">
        <div className="row between">
          <div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>{state.settings.company.name} · Client portal</div>
            <h1>{ev.name}</h1>
            <div>{ev.date ? fmtDate(ev.date, { weekday: 'long' }) : 'Date TBD'} · {ev.venue?.name}{daysToGo !== null && daysToGo >= 0 && ` · ${daysToGo} days to go`}</div>
          </div>
          {mine.length > 1 && <select value={ev.id} onChange={(e) => { setTabState('home'); nav(`/portal/${e.target.value}`); }} aria-label="Switch event">{mine.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
        </div>
        {state.settings.company.portalWelcome && <div style={{ marginTop: 8, fontSize: 14 }}>{state.settings.company.portalWelcome}</div>}
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>Signed in as {user.name}{user.payerScope ? ` · paying for ${user.payerScope.join(', ')}` : ''}</div>
      </div>
      <nav className="phase-nav" aria-label="Client portal">
        <div className="phase-row" role="tablist" aria-label="Section">
          {sections.map((s) => {
            const badge = s.tabs.reduce((a, t) => a + (TABS[t].count || 0), 0);
            return (
              <button key={s.id} role="tab" aria-selected={s.id === section.id} className={`phase ${s.id === section.id ? 'on' : ''}`} onClick={() => setTab(s.tabs[0])}>
                <Icon name={s.icon} size={13} /> {s.label}{badge > 0 && <span className="phase-count">{badge}</span>}
              </button>
            );
          })}
        </div>
        {section.tabs.length > 1 && <Tabs tabs={section.tabs.map((t) => ({ id: t, label: TABS[t].label, count: TABS[t].count }))} value={current} onChange={setTab} />}
      </nav>
      <Comp key={ev.id} ev={ev} et={et} setTab={setTab} />
    </div>
  );
}

function PortalProposal({ ev }) {
  const { state, act, user, today } = useStore();
  const v = ev.proposals.find((p) => p.status === 'active') ?? ev.proposals.find((p) => p.status === 'accepted');
  if (!v) return <EmptyState>No proposal shared yet.</EmptyState>;
  const t = proposalTotals(state, ev, v);
  const expired = proposalExpired(v, today);
  const canApprove = clientCan(user, 'approve_costs');
  return (
    <div>
      <Card title={`Proposal v${v.version}`} actions={<StatusBadge status={expired ? 'expired' : v.status} />}>
        {expired ? <Alert tone="danger">This proposal expired on {fmtDate(v.validUntil)}. Please ask your planner for an updated version.</Alert> : v.status === 'active' && <Alert tone="info">Valid until {fmtDate(v.validUntil)}. Tick optional extras to add them — the total updates instantly.</Alert>}
        <div className="mt"><ProposalTable ev={ev} version={v} totals={t} internal={false} editable={false} onToggleOptional={v.status === 'active' && canApprove && !expired ? (l) => act('PROPOSAL_TOGGLE_OPTIONAL', { eventId: ev.id, versionId: v.id, lineId: l.id }) : null} /></div>
        <Button className="mt" onClick={() => { printDocument(`Proposal v${v.version}`, proposalHtml(state, ev, v)); act('DOCUMENT_GENERATED', { eventId: ev.id, kind: 'Proposal (client download)', ref: `v${v.version}` }); }}>Download PDF</Button>{' '}
        {v.status === 'active' && canApprove && <Button variant="primary" className="mt" disabled={expired} onClick={() => act('PROPOSAL_ACCEPT', { eventId: ev.id, versionId: v.id })}>Accept proposal</Button>}
        {!canApprove && <div className="faint mt">You don't have permission to approve costs.</div>}
      </Card>
      <Card title="Moodboard"><Moodboard itemIds={v.moodboard} /></Card>
    </div>
  );
}

function PortalContract({ ev }) {
  const { user } = useStore();
  if (!ev.contract || ev.contract.status === 'draft') return <EmptyState>Your contract is being prepared.</EmptyState>;
  // Signers are matched to the logged-in portal user strictly by email address.
  const allowed = ev.contract.signers.filter((s) => s.email?.toLowerCase() === user.email?.toLowerCase()).map((s) => s.id);
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

function PortalCO({ ev }) {
  const { user } = useStore();
  const list = ev.changeOrders.filter((c) => c.status !== 'draft');
  if (!list.length) return <EmptyState>No change orders.</EmptyState>;
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
            <Button onClick={() => act('FORM_SAVE', { eventId: ev.id, formId: f.id, answers: answers[f.id] || {}, submit: false })}>Save draft</Button>
            <Button variant="primary" onClick={() => act('FORM_SAVE', { eventId: ev.id, formId: f.id, answers: answers[f.id] || {}, submit: true })}>Submit</Button>
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
    <Card title="Guest list (shared with your planner)" actions={can && <Button variant="primary" onClick={() => setAdd(true)}>{et.features.registration ? '+ Register attendee' : '+ Household'}</Button>}>
      <GuestTable ev={ev} readOnly={!can} />
      {add && <AddHouseholdModal ev={ev} et={et} onClose={() => setAdd(false)} />}
    </Card>
  );
}

function PortalSeating({ ev }) {
  const { user } = useStore();
  return <Card title="Seating chart (drag & drop with your planner)"><SeatingBoard ev={ev} readOnly={!clientCan(user, 'manage_guests')} /></Card>;
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
      <div className="row">{[1, 2, 3, 4, 5].map((n) => <Button key={n} variant={rating >= n ? 'primary' : 'secondary'} onClick={() => setRating(n)} aria-label={`${n} stars`}><Icon name="star" /></Button>)}</div>
      <textarea className="mt" placeholder="Tell us more…" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button variant="primary" className="mt" onClick={() => act('SURVEY_SUBMIT', { eventId: ev.id, rating, comment })}>Submit</Button>
    </Card>
  );
}
