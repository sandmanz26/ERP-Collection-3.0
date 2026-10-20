import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, KeyValue, Modal, Field, Alert, Money, StatusBadge, ConfirmButton, Button, useDialog, Icon } from '../../design-system/index.js';
import { AvailabilityCheck } from '../../components/Availability.jsx';
import { STAGES, stageIndex, stageLabel, transitionBlockers, nextStage, isExit } from '../../lib/lifecycle.js';
import { eventContext, clientOf, eventFinancials, headcount } from '../../lib/derived.js';
import { calcCancellation } from '../../lib/contracts.js';
import { fmtDate, fmtDateTime, diffDays } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { LOST_REASONS } from '../../data/config.js';

export default function Overview({ ev, et }) {
  const dialog = useDialog();
  const { state, act, today, user } = useStore();
  const [postpone, setPostpone] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState({ type: 'call', summary: '' });
  const [holdDate, setHoldDate] = useState(ev.date || '');
  const ctx = eventContext(state, ev, today);
  const next = nextStage(ev.stage);
  const blockers = next ? transitionBlockers(ev, next, ctx) : [];
  const client = clientOf(state, ev);
  const f = eventFinancials(state, ev);
  const hc = headcount(ev);
  const holds = state.holds.filter((h) => h.eventId === ev.id);
  const idx = stageIndex(ev.stage);

  return (
    <div>
      <div className="lifecycle">
        {STAGES.map((s, i) => <div key={s.id} className={`st ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}`}>{s.label}</div>)}
      </div>
      {isExit(ev.stage) && <Alert tone="danger">This event is <b>{stageLabel(ev.stage)}</b>{ev.prevStage ? ` (was ${stageLabel(ev.prevStage)})` : ''}. {ev.lostReason || ev.cancellation?.reason}</Alert>}
      {ev.cancellation && (
        <Card title="Cancellation settlement" className="mt">
          <KeyValue rows={[['Cancelled by', ev.cancellation.by], ['Days before event', ev.cancellation.daysBefore], ['Forfeit %', `${ev.cancellation.forfeitPct}%`], ['Cancellation fee', fmtMoney(ev.cancellation.fee, ev.currency)], ['Paid to date', fmtMoney(ev.cancellation.paid, ev.currency)], ['Refund due to client', fmtMoney(ev.cancellation.refund, ev.currency)], ['Balance owed by client', fmtMoney(ev.cancellation.balanceDue, ev.currency)]]} />
        </Card>
      )}
      <div className="grid g3 mt">
        <Card title="Lifecycle">
          <div className="stack">
            <div>Current: <b>{stageLabel(ev.stage)}</b></div>
            {next && !isExit(ev.stage) && (
              <>
                <Button variant="primary" disabled={blockers.length > 0} onClick={() => act('STAGE_CHANGE', { eventId: ev.id, to: next })}>Advance to {stageLabel(next)}</Button>
                {blockers.map((b) => <div key={b} className="faint" style={{ fontSize: 12 }}><Icon name="ban" size={12} /> {b}</div>)}
                {blockers.length > 0 && user.role === 'admin' && <ConfirmButton variant="danger" size="sm" message="Admin override: force the stage change? This is logged." onConfirm={() => act('STAGE_CHANGE', { eventId: ev.id, to: next, force: true })}>Force (admin)</ConfirmButton>}
              </>
            )}
            {!isExit(ev.stage) && (
              <div className="row mt">
                {ev.contract?.immutable && <Button onClick={() => setPostpone(true)}>Postpone…</Button>}
                {ev.contract?.immutable ? <Button variant="danger" onClick={() => setCancel(true)}>Cancel event…</Button> : <Button variant="danger" onClick={async () => { const r = await dialog.form({ title: 'Mark as lost', fields: [{ name: 'reason', label: 'Reason (used in conversion analytics)', type: 'select', options: LOST_REASONS, defaultValue: LOST_REASONS[0] }] }); r && act('MARK_LOST', { eventId: ev.id, reason: r.reason }); }}>Mark lost</Button>}
              </div>
            )}
          </div>
        </Card>
        <Card title="Key figures">
          <KeyValue rows={[
            ['Contract total', <Money value={f.contractTotal} currency={ev.currency} />],
            ['Paid', <Money value={f.paid} currency={ev.currency} />],
            ['Balance', <Money value={f.balance} currency={ev.currency} />],
            ['Deferred revenue', <Money value={f.deferred} currency={ev.currency} />],
            ['Est. profit', <span><Money value={f.profit} currency={ev.currency} /> ({f.marginPct}%)</span>],
            ['Guests (est. / RSVP yes)', `${ev.guestCount ?? '—'} / ${hc.confirmed}`],
            ['Final headcount', ev.finalHeadcount ?? 'not set'],
          ]} />
        </Card>
        <Card title="Client" actions={<Badge>{client?.type}</Badge>}>
          <KeyValue rows={[['Name', client?.name], ['Email', client?.email], ['Phone', client?.phone], ['Country', client?.country], client?.vatId && ['VAT ID', client.vatId], ['Decision makers', <div>{(client?.decisionMakers || []).map((d) => <div key={d}>• {d}</div>)}</div>]]} />
        </Card>
      </div>

      <div className="grid g2 mt">
        <Card title="Event details" actions={<Button size="sm" onClick={() => setEdit(true)}>Edit</Button>}>
          <KeyValue rows={[
            ['Event type', `${et.name} (${et.segment})`],
            ['Date', ev.date ? fmtDate(ev.date, { weekday: 'long' }) : 'TBD'],
            ['Date status', ev.dateStatus],
            ['Venue', ev.venue?.name],
            ['Address', ev.venue?.address],
            ['Lead source', ev.source],
            ['Sales', state.users.find((u) => u.id === ev.salesId)?.name],
            ['Planner', state.users.find((u) => u.id === ev.plannerId)?.name ?? 'unassigned'],
            ['Probability', `${ev.probability}%`],
            ['Budget', ev.budget ? fmtMoney(ev.budget, ev.currency) : '—'],
            ['Tax jurisdiction', state.settings.jurisdictions.find((j) => j.id === ev.jurisdictionId)?.name],
            et.features.poRequired && ['PO number', ev.poNumber || <Badge tone="warn">missing</Badge>],
          ]} />
          {ev.postponements.length > 0 && (
            <div className="mt">
              <h4>Postponement history</h4>
              {ev.postponements.map((p, i) => <div key={i} className="faint">{fmtDate(p.from)} → {fmtDate(p.to)} · {p.reason} · fee {p.fee}</div>)}
            </div>
          )}
        </Card>
        <Card title="Date holds">
          {holds.length === 0 && <div className="faint">No holds yet.</div>}
          {holds.map((h) => (
            <div key={h.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
              <span>#{h.priority} · {fmtDate(h.date)} · expires {fmtDate(h.expiresAt)} {h.status === 'active' && <span className="faint">({diffDays(today, h.expiresAt)}d)</span>}</span>
              <span className="row"><StatusBadge status={h.status} />
                {h.status === 'active' && <><Button size="sm" onClick={() => act('HOLD_EXTEND', { holdId: h.id, days: 7 })}>+7d</Button><Button variant="danger" size="sm" onClick={() => act('HOLD_RELEASE', { holdId: h.id })}>Release</Button></>}
              </span>
            </div>
          ))}
          {!ev.contract?.immutable && !isExit(ev.stage) && (
            <div className="mt stack">
              <div className="row"><input type="date" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} /><Button variant="primary" disabled={!holdDate} onClick={() => act('HOLD_CREATE', { eventId: ev.id, date: holdDate })}>Place hold</Button></div>
              <AvailabilityCheck date={holdDate} excludeEventId={ev.id} />
            </div>
          )}
          {et.features.clientApprovalLayers && (
            <div className="mt">
              <h4>Client approval chain</h4>
              {ev.approvals.map((a) => (
                <div key={a.id} className="row between" style={{ padding: '4px 0' }}>
                  <span>{a.step} <span className="faint">{a.by} {a.at ? fmtDateTime(a.at) : ''}</span></span>
                  <span className="row"><StatusBadge status={a.status} />{a.status === 'pending' && <Button size="sm" onClick={() => act('APPROVAL_STEP', { eventId: ev.id, stepId: a.id, status: 'approved' })}>Mark approved</Button>}</span>
                </div>
              ))}
              <Button size="sm" className="mt" onClick={async () => { const s = await dialog.prompt({ title: 'Add client approval step', label: 'Step (e.g. Legal review)' }); s && act('APPROVAL_ADD', { eventId: ev.id, step: s }); }}>+ Add step</Button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Interactions (emails, calls, meetings, notes)" className="mt">
        <div className="row mb">
          <select value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })}>{['call', 'email', 'meeting', 'note'].map((t) => <option key={t}>{t}</option>)}</select>
          <input style={{ flex: 1 }} placeholder="Summary…" value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} />
          <Button variant="primary" disabled={!note.summary} onClick={() => { act('INTERACTION_ADD', { eventId: ev.id, ...note }); setNote({ ...note, summary: '' }); }}>Log</Button>
        </div>
        <table className="t">
          <tbody>
            {ev.interactions.map((i) => <tr key={i.id}><td style={{ width: 160 }}>{fmtDateTime(i.at)}</td><td style={{ width: 80 }}><Badge>{i.type}</Badge></td><td>{i.summary}</td><td className="faint">{state.users.find((u) => u.id === i.by)?.name}</td></tr>)}
          </tbody>
        </table>
      </Card>
      {edit && <EditModal ev={ev} onClose={() => setEdit(false)} />}
      {postpone && <PostponeModal ev={ev} onClose={() => setPostpone(false)} />}
      {cancel && <CancelModal ev={ev} onClose={() => setCancel(false)} />}
    </div>
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
