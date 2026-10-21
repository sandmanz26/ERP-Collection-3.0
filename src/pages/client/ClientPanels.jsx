// Client panel — project visibility for the end client: progress, timeline, what to prepare, payments, people.
// All data comes from lib/clientView.js (client-safe selectors); permissions via clientCan.
import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Money, Alert, EmptyState, ProgressBar, ProgressRing, StatusBadge, Button, Icon, Callout, Avatar, Stepper, Timeline, Gantt, dayTicks, KeyValue } from '../../design-system/index.js';
import { weatherCall } from '../../lib/risk.js';
import { clientJourney, clientProgress, clientTimeline, clientRoadmap, clientAgenda, clientPrep, clientPayments, clientTeam, clientUpdates } from '../../lib/clientView.js';
import { invoiceStatus, invoiceBalance, payerSummary } from '../../lib/derived.js';
import { fmtMoney } from '../../lib/money.js';
import { clientCan } from '../../lib/permissions.js';
import { fmtDate, fmtDateTime, diffDays, addMinutes } from '../../lib/dates.js';
import { Moodboard } from '../event/ProposalTab.jsx';
import { InvoiceTable } from '../event/FinanceTab.jsx';

const short = (d) => fmtDate(d, { year: undefined });
export const relDays = (today, date) => {
  if (!date) return '';
  const d = diffDays(today, date);
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 0 ? `in ${d} days` : d === -1 ? 'yesterday' : `${-d} days ago`;
};
const monthLabel = (iso) => new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const KIND_ICON = { milestone: 'flag', todo: 'checkSquare', deadline: 'hourglass', payment: 'money', event: 'star', decision: 'edit', task: 'checkSquare', form: 'file', guests: 'users' };

/* ---------------------------------------------------------------- Overview */

export function ClientHome({ ev, setTab }) {
  const { state, user, today } = useStore();
  const p = clientProgress(state, ev, user, today);
  const tl = clientTimeline(state, ev, user, today);
  const upcoming = tl.filter((r) => !r.done && (r.date >= today || r.overdue)).slice(0, 6);
  const updates = clientUpdates(state, ev, user, 6);
  const team = clientTeam(state, ev);
  const money = clientPayments(ev, user, today);
  return (
    <div className="stack">
      <ClientCallouts ev={ev} setTab={setTab} />
      <JourneyCard ev={ev} journey={p.journey} daysToGo={p.daysToGo} />
      <WeatherNote ev={ev} />

      <div className="ready-grid">
        {p.areas.map((a) => (
          <button key={a.id} type="button" className="ready" onClick={() => setTab(a.tab)}>
            <span className="ready-head"><Icon name={a.icon} size={15} /> {a.label} {a.warn && <Badge tone="danger">attention</Badge>}</span>
            <span className="cp-area-value">{a.value}</span>
            <ProgressBar value={a.pct} tone={a.warn ? 'danger' : a.pct >= 100 ? 'ok' : undefined} />
            {a.sub && <span className="ready-sum">{a.sub}</span>}
          </button>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Coming up" actions={<Button size="sm" variant="ghost" onClick={() => setTab('timeline')}>Full timeline</Button>}>
          {upcoming.length ? <Timeline formatDate={short} groups={[{ id: 'up', label: 'Next on the road to your event', items: upcoming.map((r) => timelineItem(r, ev, today, setTab)) }]} /> : <EmptyState>Nothing scheduled ahead.</EmptyState>}
        </Card>
        <Card title="Latest updates">
          {updates.length ? (
            <ul className="cp-feed">
              {updates.map((u, i) => (
                <li key={i} className={u.tone ? `cp-feed-${u.tone}` : ''}><span className="cp-feed-icon"><Icon name={u.icon} size={13} /></span><span>{u.text}{u.money ? <> · <Money value={u.money} currency={ev.currency} /></> : null}</span><time>{fmtDateTime(u.at)}</time></li>
              ))}
            </ul>
          ) : <EmptyState>No updates yet.</EmptyState>}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Your contacts" actions={<Button size="sm" variant="ghost" onClick={() => setTab('team')}>Whole team</Button>}>
          <div className="stack" style={{ gap: 10 }}>{team.core.filter((c) => c.primary || c.dayOf).map((c) => <PersonCard key={c.name} person={c} />)}</div>
          {clientCan(user, 'message') && <Button className="mt" onClick={() => setTab('messages')}><Icon name="mail" size={14} /> Message your planner</Button>}
        </Card>
        {money ? (
          <Card title={money.scoped ? 'Your share' : 'Payments at a glance'} actions={<Button size="sm" variant="ghost" onClick={() => setTab('payments')}>Payments</Button>}>
            <PaymentSummary money={money} ev={ev} compact />
          </Card>
        ) : (
          <Card title="Venue"><VenueFacts ev={ev} /></Card>
        )}
      </div>

      {clientCan(user, 'view_all') && ev.design.palette.length > 0 && (
        <Card title="Your design"><div className="row mb">{ev.design.palette.map((c) => <span key={c} className="swatch" style={{ background: c }} />)}</div><div className="muted">{ev.design.notes}</div><div className="mt"><Moodboard itemIds={ev.design.decorItemIds} /></div></Card>
      )}
    </div>
  );
}

/** Outdoor function? Tell the client the plan and when the call is made — before they ask. */
function WeatherNote({ ev }) {
  const { state } = useStore();
  const w = weatherCall(state, ev);
  if (!w || ['post_event', 'financial_close', 'archived'].includes(ev.stage)) return null;
  return w.decided
    ? <Callout tone={w.decision === 'B' ? 'warning' : 'success'} icon="sun" title={`${w.function}: we go with Plan ${w.decision} — ${w.decision === 'A' ? w.planA : w.planB}`}>{w.note || 'Decided with the latest forecast.'}</Callout>
    : <Callout tone="info" icon="sun" title={`Weather plan for ${w.function}`}>Plan A: {w.planA}. If rain or wind is forecast we switch to Plan B: {w.planB}. Your planner makes the call by {fmtDateTime(w.due)} and lets you know here.</Callout>;
}

function JourneyCard({ ev, journey, daysToGo }) {
  const [sel, setSel] = useState(null);
  const step = journey.steps.find((s) => s.id === sel) ?? journey.current;
  const n = journey.steps.indexOf(step) + 1;
  return (
    <Card title="Where we are">
      <div className="cp-journey-head">
        <ProgressRing value={journey.pct} label="Journey progress" tone={journey.pct >= 100 ? 'ok' : 'brand'} />
        <div style={{ minWidth: 0 }}>
          <div className="faint text-xs">Step {Math.min(n, journey.steps.length)} of {journey.steps.length}</div>
          <div className="cp-journey-title">{step.label} <StatusBadge status={step.status === 'current' ? 'in_progress' : step.status === 'done' ? 'done' : step.status === 'exit' ? 'cancelled' : 'pending'} /></div>
          <div className="muted">{step.about}</div>
        </div>
        {daysToGo !== null && daysToGo >= 0 && <div className="countdown"><b>{daysToGo}</b><span>{daysToGo === 1 ? 'day' : 'days'} to go</span></div>}
      </div>
      <Stepper steps={journey.steps} selectedId={step.id} onSelect={setSel} formatDate={short} />
      <div className="stage-detail">
        {step.status === 'done' && <div><Icon name="check" size={14} /> Completed{step.date ? ` on ${fmtDate(step.date)}` : ''}.</div>}
        {step.status !== 'done' && step.status !== 'exit' && <div><b>What we need from you:</b> {step.you}</div>}
        {step.target && <div className="faint text-xs">Target date: {fmtDate(step.date)}</div>}
        {step.status === 'exit' && <div>{step.you}</div>}
      </div>
    </Card>
  );
}

function timelineItem(r, ev, today, setTab) {
  return {
    id: r.id, date: r.date, title: r.title, icon: KIND_ICON[r.kind], done: r.done || (r.kind === 'milestone' && r.past), past: r.past,
    tone: r.kind === 'event' ? 'danger' : r.overdue ? 'danger' : r.kind === 'milestone' ? 'brand' : r.kind === 'deadline' ? 'warn' : 'neutral',
    detail: [r.detail, r.overdue ? 'overdue' : !r.done && r.date >= today ? relDays(today, r.date) : null].filter(Boolean).join(' · '),
    aside: r.amount ? fmtMoney(r.amount, ev.currency, { whole: true }) : null,
    onClick: r.tab && r.tab !== 'timeline' ? () => setTab(r.tab) : undefined,
  };
}

/* ---------------------------------------------------------------- Timeline */

export function ClientTimelinePanel({ ev, setTab }) {
  const { state, user, today } = useStore();
  const tl = clientTimeline(state, ev, user, today);
  const road = clientRoadmap(state, ev, user, today);
  const months = [...new Set(tl.map((r) => r.date.slice(0, 7)))];
  const overdue = tl.filter((r) => r.overdue).length;
  return (
    <div className="stack">
      {road ? (
        <Card title="Road map" actions={overdue > 0 && <Badge tone="danger">{overdue} overdue</Badge>}>
          <Gantt range={road.range} lanes={road.lanes} ticks={dayTicks(road.range, road.toDate)} markers={road.markers} pxPerUnit={3} fit labelWidth={130} onItemClick={(it) => it.href && it.href !== 'timeline' && setTab(it.href)} />
          <div className="legend mt"><span><i className="tone-ok" />Done / paid</span><span><i className="tone-brand" />Milestone</span><span><i className="tone-warn" />Deadline</span><span><i className="tone-danger" />Overdue · event</span><span className="muted">Click a marker to open it.</span></div>
        </Card>
      ) : <Alert tone="info">Your timeline appears once the event date is set.</Alert>}
      <Card title="Everything, month by month">
        {tl.length ? <Timeline formatDate={short} marker={{ date: today, label: `Today · ${short(today)}` }} groups={months.map((m) => ({ id: m, label: monthLabel(m), items: tl.filter((r) => r.date.startsWith(m)).map((r) => timelineItem(r, ev, today, setTab)) }))} /> : <EmptyState>No dates yet.</EmptyState>}
      </Card>
    </div>
  );
}

export function ClientAgenda({ ev }) {
  const ag = clientAgenda(ev);
  if (!ag.days.length) return <EmptyState>The event-day schedule will appear here once your planner shares it.</EmptyState>;
  return (
    <div className="stack">
      {ag.draft && <Alert tone="info">This schedule is still a draft — times can move until your planner finalizes the run of show.</Alert>}
      {ag.days.map((d) => (
        <Card key={d.date} title={fmtDate(d.date, { weekday: 'long' })}>
          <ol className="agenda">
            {d.items.map((i) => (
              <li key={i.id} className={i.status === 'done' ? 'done' : i.status === 'live' ? 'live' : ''}>
                <time>{i.start}{i.duration ? <span>–{addMinutes(i.start, i.duration)}</span> : null}</time>
                <div><b>{i.activity}</b><div className="faint text-xs">{[i.session !== i.activity && i.session, i.location].filter(Boolean).join(' · ')}</div></div>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- To prepare */

export function ClientPrep({ ev, setTab }) {
  const { state, act, user, today } = useStore();
  const prep = clientPrep(state, ev, user, today);
  const [showDone, setShowDone] = useState(false);
  if (!prep.total) return <EmptyState>Nothing to prepare right now — your planner will add items here.</EmptyState>;
  return (
    <div className="stack">
      <Card>
        <div className="cp-journey-head">
          <ProgressRing value={prep.pct} label="Preparation progress" tone={prep.overdue ? 'warn' : 'ok'} />
          <div>
            <div className="cp-journey-title">{prep.done} of {prep.total} done</div>
            <div className="muted">{prep.overdue ? `${prep.overdue} item${prep.overdue > 1 ? 's are' : ' is'} overdue — start there.` : prep.open ? `${prep.open} item${prep.open > 1 ? 's' : ''} left. Everything you need to prepare, in one list.` : 'All done — thank you!'}</div>
          </div>
        </div>
      </Card>
      {prep.groups.filter((g) => g.id !== 'done' || showDone).map((g) => (
        <Card key={g.id} title={<span className="row" style={{ gap: 8 }}>{g.label} <Badge tone={{ danger: 'danger', warning: 'warn', success: 'ok' }[g.tone]}>{g.items.length}</Badge></span>}>
          <ul className="prep-list">
            {g.items.map((i) => (
              <li key={i.id} className={i.done ? 'done' : ''}>
                {i.kind === 'task'
                  ? <input type="checkbox" aria-label={i.title} checked={i.done} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: i.taskId, patch: { status: e.target.checked ? 'done' : 'todo' } })} />
                  : <span className="prep-icon"><Icon name={i.done ? 'check' : KIND_ICON[i.kind]} size={14} /></span>}
                <div style={{ minWidth: 0 }}>
                  <div className="prep-title">{i.title}</div>
                  <div className="faint text-xs">{[i.category, i.due && `${fmtDate(i.due)} (${relDays(today, i.due)})`, i.amount ? fmtMoney(i.amount, ev.currency) : null].filter(Boolean).join(' · ')}</div>
                </div>
                {!i.done && i.cta && <Button size="sm" onClick={() => setTab(i.tab)}>{i.cta}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {prep.groups.some((g) => g.id === 'done') && <Button variant="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} completed items</Button>}
    </div>
  );
}

/* ---------------------------------------------------------------- Payments */

function PaymentSummary({ money, ev, compact }) {
  const { today } = useStore();
  return (
    <div>
      <div className="cp-pay-tiles">
        <div><span>{money.scoped ? 'Your total' : 'Total agreed'}</span><b><Money value={money.total} currency={ev.currency} /></b></div>
        <div><span>Paid</span><b className="text-success"><Money value={money.paid} currency={ev.currency} /></b></div>
        <div><span>Remaining</span><b><Money value={money.remaining} currency={ev.currency} /></b></div>
        {!compact && <div><span>Next payment</span><b>{money.next ? fmtDate(money.next.dueDate) : '—'}</b>{money.next && <small className={money.next.status === 'overdue' ? 'text-danger' : 'faint'}>{money.next.status === 'overdue' ? 'overdue' : relDays(today, money.next.dueDate)}</small>}</div>}
      </div>
      <ProgressBar value={money.pct} tone="ok" />
      <div className="faint text-xs mt">{money.pct}% paid{money.next ? ` · next: ${money.next.label} ${fmtMoney(money.next.balance, ev.currency)} due ${fmtDate(money.next.dueDate)}` : ' · all settled'}</div>
    </div>
  );
}

export function ClientPayments({ ev, setTab }) {
  const { user, today } = useStore();
  const money = clientPayments(ev, user, today);
  if (!money) return <EmptyState>You don't have access to payments for this event.</EmptyState>;
  const payers = clientCan(user, 'view_all') && ev.payers.length > 1 ? payerSummary(ev, today) : [];
  return (
    <div className="stack">
      {money.scoped && <Alert tone="info">You are paying for <b>{money.payer.categories.join(', ')}</b>. Only your invoices are shown.</Alert>}
      {money.overdue.length > 0 && <Callout tone="danger" icon="alert" title={`${money.overdue.length} payment${money.overdue.length > 1 ? 's are' : ' is'} overdue`} action={{ label: 'Pay now', onClick: () => document.getElementById('cp-invoices')?.scrollIntoView({ behavior: 'smooth' }) }}>{money.overdue.map((r) => `${r.label}: ${fmtMoney(r.balance, ev.currency)}`).join(' · ')}</Callout>}
      <Card title="Summary"><PaymentSummary money={money} ev={ev} /></Card>
      <Card title="Payment plan">
        <Timeline formatDate={short} marker={{ date: today, label: 'Today' }} groups={[{ id: 'plan', label: `${money.rows.length} payments`, items: money.rows.map((r) => ({
          id: r.id, date: r.dueDate, title: r.label, icon: 'money', done: r.status === 'paid',
          tone: r.status === 'overdue' ? 'danger' : r.status === 'paid' ? 'ok' : 'neutral',
          detail: [r.isDeposit && 'secures your date', r.fromChangeOrder && 'from an approved change order', r.status === 'paid' ? 'paid' : r.status === 'overdue' ? 'overdue' : relDays(today, r.dueDate)].filter(Boolean).join(' · '),
          aside: fmtMoney(r.amount, ev.currency),
        })) }]} />
      </Card>
      {payers.length > 0 && (
        <Card title="Who pays what">
          <table className="t"><thead><tr><th>Payer</th><th>Covers</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{payers.map((p) => <tr key={p.id}><td>{p.name}</td><td className="faint">{p.categories.join(', ') || 'everything'}</td><td className="num"><Money value={p.billed} currency={ev.currency} /></td><td className="num"><Money value={p.paid} currency={ev.currency} /></td><td className="num">{p.overdue ? <Badge tone="danger">{fmtMoney(p.outstanding, ev.currency)}</Badge> : <Money value={p.outstanding} currency={ev.currency} />}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
      <div id="cp-invoices">
        <Card title="Invoices & receipts">{clientCan(user, 'pay') ? <InvoiceTable ev={ev} portal payerFilter={money.scoped ? [money.payer.id] : null} /> : <div className="faint">View only — ask the account holder to pay.</div>}</Card>
      </div>
      {money.changeOrders.length > 0 && <div className="faint text-xs">Includes {money.changeOrders.length} approved change order payment{money.changeOrders.length > 1 ? 's' : ''}. <button type="button" className="link-btn" onClick={() => setTab('co')}>See change orders</button></div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Team */

function PersonCard({ person }) {
  return (
    <div className={`cp-person ${person.primary ? 'primary' : ''}`}>
      <Avatar name={person.name} />
      <div style={{ minWidth: 0 }}>
        <div><b>{person.name}</b> {person.primary && <Badge tone="info">main contact</Badge>}{person.dayOf && <Badge tone="warn">on the day</Badge>}</div>
        <div className="faint text-xs">{person.role}{person.note ? ` · ${person.note}` : ''}</div>
        <div className="cp-contact">
          {person.email && <a href={`mailto:${person.email}`}><Icon name="mail" size={12} /> {person.email}</a>}
          {person.phone && <a href={`tel:${person.phone.replace(/\s/g, '')}`}><Icon name="phone" size={12} /> {person.phone}</a>}
        </div>
      </div>
    </div>
  );
}

function VenueFacts({ ev }) {
  const v = ev.venue || {};
  return <KeyValue rows={[['Venue', v.name], ['Address', v.address], v.parking && ['Parking', v.parking], v.curfew && ['Music curfew', v.curfew], v.emergencyContact && ['On-site emergency', v.emergencyContact], v.nearestHospital && ['Nearest hospital', v.nearestHospital]]} />;
}

export function ClientTeamPanel({ ev }) {
  const { state } = useStore();
  const t = clientTeam(state, ev);
  return (
    <div className="stack">
      <div className="grid g2">
        <Card title="Your planning team">
          <div className="stack" style={{ gap: 12 }}>{t.core.length ? t.core.map((c) => <PersonCard key={c.name} person={c} />) : <EmptyState>Your team will be introduced here.</EmptyState>}</div>
        </Card>
        <Card title="Venue"><VenueFacts ev={ev} /></Card>
      </div>
      <Card title={`Vendors (${t.vendors.length})`} actions={t.vendors.length > 0 && <Badge tone={t.vendors.every((v) => v.confirmed) ? 'ok' : 'warn'}>{t.vendors.filter((v) => v.confirmed).length}/{t.vendors.length} confirmed</Badge>}>
        {t.vendors.length ? (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Service</th><th>Vendor</th><th>What they deliver</th><th>Arrives</th><th>On-site contact</th><th>Status</th></tr></thead>
              <tbody>{t.vendors.map((v) => (
                <tr key={v.id}><td><b>{v.category}</b></td><td>{v.name}</td><td className="faint">{v.service}</td><td className="nowrap">{v.arrival ? `${short(v.arrival.slice(0, 10))} ${v.arrival.slice(11, 16)}` : '—'}</td><td className="faint">{v.contact ?? 'shared once confirmed'}</td><td>{v.confirmed ? <Badge tone="ok">confirmed</Badge> : v.replacing ? <Badge tone="danger">being replaced</Badge> : <Badge tone="warn">being confirmed</Badge>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState>Vendors appear here as they are booked.</EmptyState>}
      </Card>
      {t.crewTotal > 0 && (
        <Card title={`Event crew (${t.crewTotal} people)`} actions={<Badge tone={t.crewConfirmed >= t.crewTotal ? 'ok' : 'info'}>{t.crewConfirmed}/{t.crewTotal} confirmed</Badge>}>
          <div className="cp-crew">
            {t.crew.map((d) => (
              <div key={d.department} className="cp-crew-dept">
                <div className="row between"><b>{d.department}</b><span className="faint text-xs">{d.confirmed}/{d.people}</span></div>
                <ProgressBar value={(d.confirmed / d.people) * 100} tone={d.confirmed >= d.people ? 'ok' : undefined} />
                <ul>{d.roles.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="faint text-xs mt">Crew is staffed by your planner and partner agencies; your day-of coordinator is the one person to talk to on site.</div>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Callouts */

/** What this client user should do next — only actions their permissions allow. */
export function ClientCallouts({ ev, setTab }) {
  const { user, today } = useStore();
  const can = (p) => clientCan(user, p);
  const items = [];
  const mySigner = ev.contract?.signers.find((s) => s.email?.toLowerCase() === user.email.toLowerCase() && !s.signedAt);
  if (mySigner && ev.contract.status !== 'draft' && can('sign')) items.push({ tone: 'warning', icon: 'edit', title: 'Your signature is needed on the contract', text: 'Review the agreement and sign online.', tab: 'contract', cta: 'Review & sign' });
  const myPayer = ev.payers.find((p) => p.userId === user.id);
  const dueInvoices = ev.invoices.filter((i) => ['sent', 'partial', 'overdue'].includes(invoiceStatus(ev, i, today)) && (can('view_all') || i.payerId === myPayer?.id));
  if (can('pay') && dueInvoices.length) {
    const od = dueInvoices.filter((i) => invoiceStatus(ev, i, today) === 'overdue');
    items.push({ tone: od.length ? 'danger' : 'info', icon: 'money', title: od.length ? `${od.length} payment${od.length > 1 ? 's are' : ' is'} overdue` : `Next payment due ${fmtDate(dueInvoices[0].dueDate)}`, text: dueInvoices.map((i) => `${i.label}: ${fmtMoney(invoiceBalance(ev, i), i.currency)}`).join(' · '), tab: 'payments', cta: 'Pay now' });
  }
  if (ev.dateStatus === 'hold' && ev.contract?.immutable) items.push({ tone: 'warning', icon: 'lock', title: 'Your date is held, not yet secured', text: `Paying the deposit locks ${fmtDate(ev.date)} for you.`, tab: 'payments', cta: 'Pay deposit' });
  const cos = ev.changeOrders.filter((c) => c.status === 'sent');
  if (cos.length && can('approve_costs')) items.push({ tone: 'info', icon: 'edit', title: `${cos.length} change order${cos.length > 1 ? 's' : ''} to approve`, text: cos.map((c) => c.title).join(', '), tab: 'co', cta: 'Review' });
  const forms = ev.forms.filter((f) => !f.submittedAt);
  if (forms.length && can('forms')) items.push({ tone: 'info', icon: 'file', title: `${forms.length} planning form${forms.length > 1 ? 's' : ''} to complete`, text: forms.map((f) => f.name).join(', '), tab: 'forms', cta: 'Fill in' });
  const tasks = ev.tasks.filter((t) => t.assigneeType === 'client' && t.status !== 'done');
  if (tasks.length && can('view_all')) items.push({ tone: tasks.some((t) => t.dueDate < today) ? 'warning' : 'info', icon: 'checkSquare', title: `${tasks.length} item${tasks.length > 1 ? 's' : ''} on your checklist`, text: tasks.slice(0, 3).map((t) => `${t.title} (${fmtDate(t.dueDate)})`).join(' · '), tab: 'prep', cta: 'Open checklist' });
  const pending = ev.households.reduce((a, h) => a + h.guests.filter((g) => Object.values(g.rsvp).every((v) => v === 'pending')).length, 0);
  if (pending && can('manage_guests')) items.push({ tone: 'info', icon: 'users', title: `${pending} guests have not replied yet`, text: 'Send a reminder or update their RSVP.', tab: 'guests', cta: 'Open guests' });
  if (!items.length) return <Callout tone="success" icon="check" title="You're all set for now">Your planner will let you know when something needs you.</Callout>;
  return <div className="grid g2">{items.map((i, n) => <Callout key={n} tone={i.tone} icon={i.icon} title={i.title} action={{ label: i.cta, onClick: () => setTab(i.tab) }}>{i.text}</Callout>)}</div>;
}
