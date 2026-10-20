import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Money, Modal, Field, useForm, Alert } from '../../components/ui.jsx';
import { shiftCost, findConflicts, LABOR_RULES } from '../../lib/staff.js';
import { fmtDate } from '../../lib/dates.js';
import { sum } from '../../lib/money.js';

export default function StaffTab({ ev }) {
  const { state, act } = useStore();
  const [add, setAdd] = useState(false);
  const all = state.events.flatMap((e) => e.shifts.map((s) => ({ ...s, eventId: e.id, eventName: e.name })));
  const conflicts = findConflicts(all).filter(([a, b]) => a.eventId === ev.id || b.eventId === ev.id);
  const rows = ev.shifts.map((s) => ({ s, st: state.staff.find((x) => x.id === s.staffId) })).map((r) => ({ ...r, c: shiftCost(r.s, r.st) }));
  return (
    <div>
      {conflicts.map(([a, b], i) => <Alert key={i} tone="danger">Schedule conflict: {state.staff.find((s) => s.id === a.staffId)?.name} is booked on {a.eventName} ({a.start}-{a.end}) and {b.eventName} ({b.start}-{b.end}) on {fmtDate(a.date)}.</Alert>)}
      <Card title="Crew shifts" actions={<button className="btn primary" onClick={() => setAdd(true)}>+ Shift</button>}>
        <table className="t">
          <thead><tr><th>Staff</th><th>Type</th><th>Role</th><th>Date</th><th>Shift</th><th>Clock in/out</th><th className="num">Hours</th><th>Rules</th><th className="num">Cost</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map(({ s, st, c }) => (
              <tr key={s.id}>
                <td>{st?.name}</td>
                <td><Badge tone={st?.type === 'freelancer' ? 'warn' : 'info'}>{st?.type}</Badge></td>
                <td>{s.role}</td><td>{fmtDate(s.date)}</td><td>{s.start}–{s.end}</td>
                <td className="faint" style={{ fontSize: 12 }}>{s.clockIn ? s.clockIn.slice(11, 16) : '—'} / {s.clockOut ? s.clockOut.slice(11, 16) : '—'}{s.clockLocation && <div>📍 {s.clockLocation}</div>}</td>
                <td className="num">{c.hours}</td>
                <td style={{ fontSize: 11.5 }}>{LABOR_RULES[st?.laborRegion]?.label}{c.warnings.map((w) => <div key={w} style={{ color: 'var(--warn)' }}>{w}</div>)}</td>
                <td className="num"><Money value={c.cost} currency={ev.currency} /></td>
                <td>{s.confirmed ? <Badge tone="ok">confirmed</Badge> : <><Badge tone="warn">awaiting</Badge><button className="btn sm" onClick={() => act('SHIFT_CONFIRM', { eventId: ev.id, shiftId: s.id })}>confirm</button></>}</td>
                <td><button className="btn sm ghost" onClick={() => act('SHIFT_REMOVE', { eventId: ev.id, shiftId: s.id })}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={8}>Total crew cost (flows into event costing)</td><td className="num"><Money value={sum(rows, (r) => r.c.cost)} currency={ev.currency} /></td><td colSpan={2} /></tr></tfoot>
        </table>
        <div className="faint mt" style={{ fontSize: 12 }}>Overtime: California daily OT &gt;8h (1.5×) and &gt;12h (2×); other US states weekly &gt;40h; EU/UK Working Time Directive max daily/48h week warnings. Rules are illustrative — confirm with payroll counsel.</div>
      </Card>
      {add && <AddShift ev={ev} onClose={() => setAdd(false)} />}
    </div>
  );
}

function AddShift({ ev, onClose }) {
  const { state, act } = useStore();
  const [v, , bind] = useForm({ staffId: state.staff[0].id, role: 'Coordinator', date: ev.date, start: '12:00', end: '23:00' });
  const all = state.events.flatMap((e) => e.shifts.map((s) => ({ ...s, eventName: e.name })));
  const conflict = findConflicts([...all, { ...v, id: 'new', eventName: ev.name }]).find(([a, b]) => a.id === 'new' || b.id === 'new');
  const st = state.staff.find((s) => s.id === v.staffId);
  const preview = shiftCost(v, st);
  return (
    <Modal title="Schedule shift" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { act('SHIFT_ADD', { eventId: ev.id, data: v }); onClose(); }}>Schedule{conflict ? ' anyway' : ''}</button></>}>
      <div className="grid g2">
        <Field label="Staff"><select {...bind('staffId')}>{state.staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type}, {s.region})</option>)}</select></Field>
        <Field label="Role"><input {...bind('role')} /></Field>
        <Field label="Date"><input type="date" {...bind('date')} /></Field>
        <div className="row"><Field label="Start"><input type="time" {...bind('start')} /></Field><Field label="End"><input type="time" {...bind('end')} /></Field></div>
      </div>
      {conflict && <Alert tone="danger">Conflict with {conflict.find((x) => x.id !== 'new').eventName}</Alert>}
      <Alert tone="info">Estimated cost: {preview.cost} ({preview.hours}h) {preview.warnings.join(' · ')}</Alert>
    </Modal>
  );
}
