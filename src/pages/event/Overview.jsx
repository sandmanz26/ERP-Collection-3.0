import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, KeyValue, Modal, Field, Alert, Money, StatusBadge, ConfirmButton, Button, useDialog, Icon, Stepper, Callout, ProgressBar, Avatar, EmptyState } from '../../design-system/index.js';
import { AvailabilityCheck } from '../../components/Availability.jsx';
import { stageLabel, transitionBlockers, nextStage, isExit, stageIndex } from '../../lib/lifecycle.js';
import { eventContext, clientOf, eventFinancials, headcount, closingChecklist } from '../../lib/derived.js';
import { calcCancellation } from '../../lib/contracts.js';
import { fmtDate, fmtDateTime, diffDays } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { LOST_REASONS } from '../../data/config.js';
import { STAGE_INFO, stepperSteps, stageRequirements, nextActions, readiness, keyDates, stageDates } from '../../lib/eventGuide.js';
import { staffingSummary } from '../../lib/workforce.js';

const READY_TONE = { done: 'ok', ok: 'info', attention: 'danger', blocked: 'warn', na: '' };
const READY_LABEL = { done: 'Ready', ok: 'On track', attention: 'Needs attention', blocked: 'Blocked', na: 'Not used' };
const shortDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Event cockpit: where the event stands (lifecycle), what to do next, how ready each area is,
 * the key dates, and every operational detail (functions, venue, contacts) — each linking to where work happens.
 */
export default function Overview({ ev, et, open }) {
  const { state, act, today, user } = useStore();
  const dialog = useDialog();
  const [modal, setModal] = useState(null);
  const [step, setStep] = useState(ev.stage);
  const closed = ['archived', 'lost', 'cancelled_client', 'cancelled_eo'].includes(ev.stage);
  const ctx = eventContext(state, ev, today);
  const next = nextStage(ev.stage);
  const blockers = next && !isExit(ev.stage) ? transitionBlockers(ev, next, ctx) : [];
  const actions = nextActions(state, ev, today);
  const areas = readiness(state, ev, today);
  const dates = keyDates(state, ev, today);
  const client = clientOf(state, ev);
  const f = eventFinancials(state, ev);
  const days = ev.date ? diffDays(today, ev.date) : null;
  const steps = stepperSteps(state, ev, today);
  const sel = steps.find((s) => s.id === step) ?? steps.find((s) => s.status === 'current') ?? steps.at(-1);
  const selReqs = sel.status === 'todo' ? stageRequirements(state, ev, sel.id, today) : [];
  const enteredBy = (ev.stageHistory || []).find((h) => h.stage === sel.id);
  const go = (tab) => (tab === 'overview' ? null : open?.(tab));
  const runAction = (a) => {
    if (a.tab !== 'overview') return open?.(a.tab);
    if (a.cta === 'Edit details') return setModal('edit');
    if (a.cta === 'Advance' && next) return act('STAGE_CHANGE', { eventId: ev.id, to: next });
    document.getElementById('holds-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* 1. Lifecycle */}
      <Card title="Lifecycle" actions={!closed && next && (
        <div className="row">
          {blockers.length === 0
            ? <Button variant="primary" onClick={() => act('STAGE_CHANGE', { eventId: ev.id, to: next })}>Move to {stageLabel(next)}</Button>
            : <span className="faint text-sm"><Icon name="lock" size={13} /> {blockers.length} requirement{blockers.length > 1 ? 's' : ''} before {stageLabel(next)}</span>}
          {blockers.length > 0 && user.role === 'admin' && <ConfirmButton size="sm" variant="ghost" message="Admin override: move the stage anyway? This is logged." onConfirm={() => act('STAGE_CHANGE', { eventId: ev.id, to: next, force: true })}>Override</ConfirmButton>}
        </div>
      )}>
        <Stepper steps={steps} selectedId={sel.id} onSelect={setStep} formatDate={shortDate} />
        <div className="stage-detail">
          <div>
            <div className="row" style={{ gap: 8 }}><b>{stageLabel(sel.id)}</b><StatusBadge status={sel.status === 'current' ? 'in_progress' : sel.status === 'done' ? 'done' : sel.status === 'exit' ? 'cancelled' : 'pending'} /></div>
            <div className="muted text-sm" style={{ marginTop: 4 }}>{STAGE_INFO[sel.id]}</div>
            {sel.date && <div className="faint text-xs" style={{ marginTop: 4 }}>Entered {fmtDate(sel.date)}{enteredBy ? ` · ${state.users.find((u) => u.id === enteredBy.by)?.name ?? 'system'}` : ''}</div>}
          </div>
          {sel.status === 'todo' && (
            <div className="text-sm">
              <div className="faint text-xs" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>To get here</div>
              {selReqs.length ? selReqs.map((r) => <div key={r}><Icon name="square" size={12} /> {r}</div>) : <div><Icon name="check" size={12} /> No extra requirements</div>}
            </div>
          )}
        </div>
        {ev.cancellation && <Alert tone="danger">Cancelled by {ev.cancellation.by === 'eo' ? 'us' : 'the client'} {ev.cancellation.daysBefore} days out ({ev.cancellation.reason}). Fee {fmtMoney(ev.cancellation.fee, ev.currency)}, refund {fmtMoney(ev.cancellation.refund, ev.currency)}, balance owed {fmtMoney(ev.cancellation.balanceDue, ev.currency)}.</Alert>}
        {ev.stage === 'lost' && <Alert tone="danger">Lost: {ev.lostReason}</Alert>}
      </Card>

      {/* 2. What to do next + countdown/key dates */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 1fr)' }}>
        {closed ? <ClosedSummary ev={ev} f={f} /> : (
          <Card title="Next steps" actions={<Badge tone={actions.some((a) => a.severity === 'danger') ? 'danger' : 'info'}>{actions.length}</Badge>}>
            <div className="stack">
              {actions.slice(0, 7).map((a, i) => <Callout key={i} compact tone={a.severity} icon={a.icon} title={a.title} action={{ label: a.cta, onClick: () => runAction(a) }}>{a.detail}</Callout>)}
              {actions.length === 0 && <EmptyState>Nothing outstanding for this stage.</EmptyState>}
              {actions.length > 7 && <div className="faint text-sm">+{actions.length - 7} more in the tabs above.</div>}
            </div>
          </Card>
        )}
        <Card title="Key dates">
          {days !== null && !closed && (
            <div className="countdown mb">
              <b>{days >= 0 ? days : Math.abs(days)}</b>
              <span className="muted">{days > 0 ? `days to go · ${fmtDate(ev.date, { weekday: 'long' })}` : days === 0 ? 'Event day is today' : `days since the event`}</span>
            </div>
          )}
          <ul className="dates">
            {dates.map((d, i) => (
              <li key={i} className={`${d.past ? 'past' : ''} ${d.event ? 'is-event' : ''} ${d.today ? 'today-row' : ''}`}>
                <button type="button" onClick={() => go(d.tab)}>
                  <time>{fmtDate(d.date, { year: undefined })}</time>
                  <span>{d.label}{d.done && <> <Icon name="check" size={11} /></>}</span>
                  <span className="faint text-xs">{d.money ?? (d.past ? '' : `in ${diffDays(today, d.date)}d`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 3. Readiness by area */}
      <Card title="Readiness" actions={<span className="faint text-sm">Click an area to work on it</span>}>
        <div className="ready-grid">
          {areas.map((a) => (
            <button key={a.id} type="button" className="ready" onClick={() => go(a.tab)}>
              <span className="ready-head"><Icon name={a.icon} size={16} />{a.label}<Badge tone={READY_TONE[a.status]}>{READY_LABEL[a.status]}</Badge></span>
              {a.status !== 'na' && <ProgressBar value={a.pct} tone={a.status === 'attention' ? 'danger' : a.status === 'done' ? 'ok' : undefined} />}
              <span className="ready-sum">{a.summary}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* 4. Event details, functions, venue */}
      <div className="grid g3">
        <Card title="Event details" actions={!closed && <Button size="sm" onClick={() => setModal('edit')}><Icon name="edit" size={13} /> Edit</Button>}>
          <KeyValue rows={[
            ['Type', `${et.name} · ${et.segment}`],
            ['Date', ev.date ? fmtDate(ev.date, { weekday: 'long' }) : 'Not set'],
            ['Date status', ev.dateStatus === 'locked' ? <Badge tone="ok"><Icon name="lock" size={11} /> locked</Badge> : ev.dateStatus === 'hold' ? <Badge tone="warn">on hold</Badge> : <Badge>none</Badge>],
            ['Guests', `${ev.guestCount ?? '—'} planned${ev.finalHeadcount ? ` · final ${ev.finalHeadcount}` : ''}`],
            ['Budget', ev.budget ? fmtMoney(ev.budget, ev.currency, { whole: true }) : '—'],
            ['Contract value', ev.contract ? <Money value={f.contractTotal} currency={ev.currency} /> : '—'],
            ['Lead source', ev.source],
            ['Tax', state.settings.jurisdictions.find((j) => j.id === ev.jurisdictionId)?.name],
            et.features.poRequired && ['PO number', ev.poNumber || <Badge tone="warn">missing</Badge>],
          ]} />
          {ev.postponements.length > 0 && <div className="faint text-xs mt">Postponed {ev.postponements.map((p) => `${fmtDate(p.from)} → ${fmtDate(p.to)}`).join(', ')}</div>}
        </Card>
        <Card title={`Functions (${ev.subEvents.length})`} actions={<Button size="sm" variant="ghost" onClick={() => go('planning')}>Manage</Button>}>
          {ev.subEvents.length === 0 && <EmptyState>Functions are created from the event type when the contract is signed.</EmptyState>}
          <ul className="dates">
            {[...ev.subEvents].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)).map((s) => (
              <li key={s.id}><button type="button" onClick={() => go('timeline')}>
                <time>{s.date ? fmtDate(s.date, { year: undefined }) : '—'}</time>
                <span><b>{s.name}</b><div className="faint text-xs">{s.start}–{s.end} · {s.room || s.venue}</div></span>
                <span className="faint text-xs">{s.guestCount ?? '—'} pax</span>
              </button></li>
            ))}
          </ul>
        </Card>
        <Card title="Venue & logistics" actions={!closed && <Button size="sm" variant="ghost" onClick={() => setModal('edit')}>Edit</Button>}>
          <KeyValue rows={[
            ['Venue', ev.venue?.name],
            ['Address', ev.venue?.address || '—'],
            ['Parking / dock', ev.venue?.parking || '—'],
            ['Access', ev.venue?.accessCode || '—'],
            ['Curfew', ev.venue?.curfew || '—'],
            ['Venue contact', ev.venue?.emergencyContact || '—'],
            ['Nearest hospital', ev.venue?.nearestHospital || '—'],
          ]} />
          <div className="row mt">
            <Button size="sm" onClick={() => go('site')}><Icon name="pin" size={13} /> Site plan</Button>
            <Button size="sm" onClick={() => go('ros')}><Icon name="list" size={13} /> Call sheet</Button>
          </div>
        </Card>
      </div>

      {/* 5. People */}
      <div className="grid g2">
        <Card title="Who's who">
          <div className="stack" style={{ gap: 6 }}>
            <Person name={client?.name} role={`Client · ${client?.type}`} contact={`${client?.email} · ${client?.phone}`} />
            {(client?.decisionMakers || []).map((d) => <Person key={d} name={d.split(' (')[0]} role={d.includes('(') ? d.slice(d.indexOf('(') + 1, -1) : 'Decision maker'} />)}
            {[['Sales', ev.salesId], ['Lead planner', ev.plannerId]].map(([r, id]) => { const u = state.users.find((x) => x.id === id); return u ? <Person key={r} name={u.name} role={`${r} · ${state.settings.company.name}`} contact={`${u.email}${u.phone ? ` · ${u.phone}` : ''}`} /> : null; })}
          </div>
        </Card>
        <Card title={`Vendors on site (${ev.vendorBookings.length})`} actions={<Button size="sm" variant="ghost" onClick={() => go('vendors')}>Open vendors</Button>}>
          {ev.vendorBookings.length === 0 && <EmptyState>No vendors booked yet.</EmptyState>}
          <div className="stack" style={{ gap: 6 }}>
            {ev.vendorBookings.map((b) => {
              const v = state.vendors.find((x) => x.id === b.vendorId);
              return <Person key={b.id} name={v?.name} role={`${b.category} · ${b.model === 'pass_through' ? 'pass-through' : 'direct'}`} contact={b.onsiteContact} badge={<StatusBadge status={b.status} />} />;
            })}
            {staffingSummary(ev).required > 0 && <button type="button" className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => go('people')}><Icon name="hardhat" size={13} /> {staffingSummary(ev).required} crew across {new Set((ev.positions || []).map((p) => p.department)).size} departments</button>}
          </div>
        </Card>
      </div>

      {/* 6. Holds & approvals (only while they matter) */}
      {!closed && (stageIndex(ev.stage) < stageIndex('planning') || et.features.clientApprovalLayers) && <HoldsAndApprovals ev={ev} et={et} />}

      {/* 7. Interactions */}
      <Interactions ev={ev} />

      {!closed && ev.contract?.immutable && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setModal('postpone')}>Postpone…</Button>
          <Button variant="danger" onClick={() => setModal('cancel')}>Cancel event…</Button>
        </div>
      )}
      {!closed && !ev.contract?.immutable && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="danger" onClick={async () => { const r = await dialog.form({ title: 'Mark as lost', fields: [{ name: 'reason', label: 'Reason (used in conversion analytics)', type: 'select', options: LOST_REASONS, defaultValue: LOST_REASONS[0] }] }); r && act('MARK_LOST', { eventId: ev.id, reason: r.reason }); }}>Mark as lost</Button>
        </div>
      )}
      {modal === 'edit' && <EditModal ev={ev} onClose={() => setModal(null)} />}
      {modal === 'postpone' && <PostponeModal ev={ev} onClose={() => setModal(null)} />}
      {modal === 'cancel' && <CancelModal ev={ev} onClose={() => setModal(null)} />}
    </div>
  );
}

function Person({ name, role, contact, badge }) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <Avatar name={name ?? '?'} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div><b>{name}</b> <span className="faint text-xs">{role}</span></div>
        {contact && <div className="faint text-xs" style={{ overflowWrap: 'anywhere' }}>{contact}</div>}
      </div>
      {badge}
    </div>
  );
}

function ClosedSummary({ ev, f }) {
  const { state, today } = useStore();
  const hc = headcount(ev);
  const open = closingChecklist(state, ev, today).filter((c) => !c.done);
  return (
    <Card title={ev.stage === 'archived' ? 'Event summary (archived, read-only)' : 'Outcome'}>
      {ev.stage === 'archived' && <Alert tone="info"><Icon name="lock" size={13} /> Archived {fmtDate(stageDates(ev).archived ?? ev.date)}. Records are kept for reporting and audit.</Alert>}
      <div className="grid g3 mt">
        <Metric label="Revenue (excl. tax)" value={<Money value={f.revenueNet} currency={ev.currency} />} />
        <Metric label="Profit" value={<><Money value={f.profit} currency={ev.currency} /> <span className="faint text-sm">{f.marginPct}%</span></>} />
        <Metric label="Collected" value={<Money value={f.paid} currency={ev.currency} />} />
        <Metric label="Guests checked in" value={hc.checkedIn || '—'} />
        <Metric label="Client rating" value={ev.closing.survey ? <><Icon name="star" size={14} /> {ev.closing.survey.rating}/5</> : '—'} />
        <Metric label="Incidents" value={ev.incidents.length} />
      </div>
      {ev.closing.survey?.comment && <blockquote className="quote">“{ev.closing.survey.comment}”</blockquote>}
      {open.length > 0 && <Alert tone="warning">Open close-out items: {open.map((o) => o.label).join(', ')}</Alert>}
    </Card>
  );
}

function Metric({ label, value }) {
  return <div><div className="faint text-xs">{label}</div><div style={{ fontWeight: 600, fontSize: 16 }}>{value}</div></div>;
}

function HoldsAndApprovals({ ev, et }) {
  const { state, act, today } = useStore();
  const dialog = useDialog();
  const [holdDate, setHoldDate] = useState(ev.date || '');
  const holds = state.holds.filter((h) => h.eventId === ev.id);
  return (
    <div className="grid g2">
      <Card title="Date holds" className="" style={{ scrollMarginTop: 80 }}>
        <div id="holds-card" />
        {holds.length === 0 && <div className="faint">No holds yet.</div>}
        {holds.map((h) => (
          <div key={h.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span>#{h.priority} · {fmtDate(h.date)} · expires {fmtDate(h.expiresAt)} {h.status === 'active' && <span className="faint">({diffDays(today, h.expiresAt)}d)</span>}</span>
            <span className="row"><StatusBadge status={h.status} />
              {h.status === 'active' && <><Button size="sm" onClick={() => act('HOLD_EXTEND', { holdId: h.id, days: 7 })}>+7 days</Button><Button size="sm" variant="danger" onClick={() => act('HOLD_RELEASE', { holdId: h.id })}>Release</Button></>}
            </span>
          </div>
        ))}
        {!ev.contract?.immutable && (
          <div className="mt stack">
            <div className="row"><input type="date" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} aria-label="Date to hold" /><Button variant="primary" disabled={!holdDate} onClick={() => act('HOLD_CREATE', { eventId: ev.id, date: holdDate })}>Place hold</Button></div>
            <AvailabilityCheck date={holdDate} excludeEventId={ev.id} />
          </div>
        )}
      </Card>
      {et.features.clientApprovalLayers ? (
        <Card title="Client approval chain">
          {ev.approvals.length === 0 && <div className="faint">No approval steps recorded.</div>}
          {ev.approvals.map((a) => (
            <div key={a.id} className="row between" style={{ padding: '4px 0' }}>
              <span>{a.step} <span className="faint">{a.by} {a.at ? fmtDateTime(a.at) : ''}</span></span>
              <span className="row"><StatusBadge status={a.status} />{a.status === 'pending' && <Button size="sm" onClick={() => act('APPROVAL_STEP', { eventId: ev.id, stepId: a.id, status: 'approved' })}>Mark approved</Button>}</span>
            </div>
          ))}
          <Button size="sm" className="mt" onClick={async () => { const s = await dialog.prompt({ title: 'Add client approval step', label: 'Step (e.g. Legal review)' }); s && act('APPROVAL_ADD', { eventId: ev.id, step: s }); }}>+ Add step</Button>
        </Card>
      ) : <div />}
    </div>
  );
}

function Interactions({ ev }) {
  const { state, act } = useStore();
  const [note, setNote] = useState({ type: 'call', summary: '' });
  return (
    <Card title="Interactions" actions={<span className="faint text-sm">Calls, emails, meetings and notes</span>}>
      <div className="row mb">
        <select value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })} aria-label="Interaction type">{['call', 'email', 'meeting', 'note'].map((t) => <option key={t}>{t}</option>)}</select>
        <input style={{ flex: 1 }} placeholder="What happened?" value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} aria-label="Summary" />
        <Button variant="primary" disabled={!note.summary} onClick={() => { act('INTERACTION_ADD', { eventId: ev.id, ...note }); setNote({ ...note, summary: '' }); }}>Log</Button>
      </div>
      <table className="t">
        <tbody>
          {ev.interactions.slice(0, 8).map((i) => <tr key={i.id}><td style={{ width: 150 }} className="text-sm">{fmtDateTime(i.at)}</td><td style={{ width: 80 }}><Badge>{i.type}</Badge></td><td>{i.summary}</td><td className="faint text-sm">{state.users.find((u) => u.id === i.by)?.name}</td></tr>)}
        </tbody>
      </table>
    </Card>
  );
}

function EditModal({ ev, onClose }) {
  const { state, act } = useStore();
  const [v, setV] = useState({ name: ev.name, date: ev.date || '', guestCount: ev.guestCount || '', budget: ev.budget || '', probability: ev.probability, plannerId: ev.plannerId || '', salesId: ev.salesId || '', poNumber: ev.poNumber || '', jurisdictionId: ev.jurisdictionId, currency: ev.currency, venue: { ...ev.venue } });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const setVen = (k) => (e) => setV({ ...v, venue: { ...v.venue, [k]: e.target.value } });
  const save = () => {
    const patch = { name: v.name, guestCount: Number(v.guestCount) || null, budget: Number(v.budget) || null, probability: Number(v.probability), plannerId: v.plannerId || null, salesId: v.salesId, poNumber: v.poNumber, venue: v.venue };
    if (!ev.contract?.immutable) Object.assign(patch, { date: v.date || null, jurisdictionId: v.jurisdictionId, currency: v.currency });
    act('EVENT_UPDATE', { eventId: ev.id, patch });
    onClose();
  };
  return (
    <Modal title="Edit event details" onClose={onClose} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      {ev.contract?.immutable && <Alert tone="info">Contract signed: date, currency and tax jurisdiction are locked. Use Postpone or a Change Order.</Alert>}
      <div className="grid g3 mt">
        <Field label="Name"><input value={v.name} onChange={set('name')} /></Field>
        <Field label="Date"><input type="date" value={v.date} onChange={set('date')} disabled={ev.contract?.immutable} /></Field>
        <Field label="Est. guests"><input type="number" value={v.guestCount} onChange={set('guestCount')} /></Field>
        <Field label="Budget"><input type="number" value={v.budget} onChange={set('budget')} /></Field>
        <Field label="Probability %"><input type="number" value={v.probability} onChange={set('probability')} /></Field>
        <Field label="PO number"><input value={v.poNumber} onChange={set('poNumber')} /></Field>
        <Field label="Planner"><select value={v.plannerId} onChange={set('plannerId')}><option value="">—</option>{state.users.filter((u) => u.role === 'planner').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Sales"><select value={v.salesId} onChange={set('salesId')}>{state.users.filter((u) => u.role === 'sales').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Currency"><select value={v.currency} onChange={set('currency')} disabled={ev.contract?.immutable}>{['USD', 'EUR', 'GBP', 'CHF'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Tax jurisdiction"><select value={v.jurisdictionId} onChange={set('jurisdictionId')} disabled={ev.contract?.immutable}>{state.settings.jurisdictions.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></Field>
      </div>
      <h4 className="mt2">Venue & call-sheet info</h4>
      <div className="grid g3">
        {[['name', 'Venue name'], ['address', 'Address'], ['parking', 'Parking'], ['accessCode', 'Access code'], ['emergencyContact', 'Emergency contact'], ['nearestHospital', 'Nearest hospital'], ['curfew', 'Curfew']].map(([k, l]) => <Field key={k} label={l}><input value={v.venue[k] || ''} onChange={setVen(k)} /></Field>)}
      </div>
    </Modal>
  );
}

function PostponeModal({ ev, onClose }) {
  const { act } = useStore();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('Client request');
  const [fee, setFee] = useState(Math.round((ev.contract?.total || 0) * 0.1));
  return (
    <Modal title="Postpone event" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!date} onClick={() => { act('EVENT_POSTPONE', { eventId: ev.id, newDate: date, reason, fee }); onClose(); }}>Postpone</Button></>}>
      <Alert tone="info">All relative task deadlines, sub-event dates, crew shifts, non-deposit payment due dates and the Decor Inventory reservation will move automatically.</Alert>
      <div className="grid g3 mt">
        <Field label="New date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label={`Rescheduling fee (${ev.currency})`}><input type="number" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      </div>
      <div className="mt"><AvailabilityCheck date={date} excludeEventId={ev.id} /></div>
    </Modal>
  );
}

function CancelModal({ ev, onClose }) {
  const { state, act, today } = useStore();
  const [by, setBy] = useState('client');
  const [reason, setReason] = useState('');
  const policy = state.settings.cancellationPolicies.find((p) => p.id === ev.contract.cancellationPolicyId);
  const paid = ev.payments.reduce((a, p) => a + p.amount, 0);
  const calc = { ...calcCancellation({ policy, contractTotal: ev.contract.total, paid, eventDate: ev.date, cancelDate: today, byEO: by === 'eo' }), paid, contractTotal: ev.contract.total };
  return (
    <Modal title="Cancel event" onClose={onClose} footer={<><Button onClick={onClose}>Back</Button><Button variant="danger-solid" disabled={!reason} onClick={() => { act('EVENT_CANCEL', { eventId: ev.id, by, reason, calc }); onClose(); }}>Confirm cancellation</Button></>}>
      <div className="grid g2">
        <Field label="Cancelled by"><select value={by} onChange={(e) => setBy(e.target.value)}><option value="client">Client</option><option value="eo">EO (us)</option></select></Field>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <h4 className="mt2">Policy: {policy.name}</h4>
      <table className="t"><tbody>{policy.rows.map((r) => <tr key={r.minDaysBefore} style={calc.daysBefore >= r.minDaysBefore && by === 'client' && policy.rows.filter((x) => calc.daysBefore >= x.minDaysBefore).sort((a, b) => b.minDaysBefore - a.minDaysBefore)[0] === r ? { background: 'var(--warn-soft)' } : undefined}><td>{r.minDaysBefore}+ days before</td><td className="num">{r.forfeitPct}% forfeited</td></tr>)}</tbody></table>
      <div className="mt">
        <KeyValue rows={[['Days before event', calc.daysBefore], ['Contract total', fmtMoney(ev.contract.total, ev.currency)], ['Forfeit', `${calc.forfeitPct}% = ${fmtMoney(calc.fee, ev.currency)}`], ['Paid to date', fmtMoney(paid, ev.currency)], ['Refund (credit note)', fmtMoney(calc.refund, ev.currency)], ['Balance invoice to client', fmtMoney(calc.balanceDue, ev.currency)]]} />
      </div>
    </Modal>
  );
}
