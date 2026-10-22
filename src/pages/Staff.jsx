import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, Modal, Field, useForm, Alert, Money, download, Button } from '../design-system/index.js';
import { findConflicts, shiftCost, classificationRisk, LABOR_RULES, shiftHours, weeklyCompliance } from '../lib/staff.js';
import { fmtDate, addDays } from '../lib/dates.js';

export default function Staff() {
  const { state, act, today } = useStore();
  const [add, setAdd] = useState(false);
  const all = state.events.flatMap((e) => e.shifts.map((s) => ({ ...s, eventId: e.id, eventName: e.name, currency: e.currency })));
  const conflicts = findConflicts(all);
  const ics = (st) => {
    const sh = all.filter((s) => s.staffId === st.id);
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EO MS//EN', ...sh.flatMap((s) => ['BEGIN:VEVENT', `UID:${s.id}@eo-ms`, `DTSTART:${s.date.replace(/-/g, '')}T${s.start.replace(':', '')}00`, `DTEND:${s.date.replace(/-/g, '')}T${s.end.replace(':', '')}00`, `SUMMARY:${s.role} — ${s.eventName}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    download(`${st.name}-shifts.ics`, body, 'text/calendar');
    act('STAFF_UPDATE', { staffId: st.id, patch: { calendarSyncedAt: new Date().toISOString() } });
  };
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Staff & crew</h1><div className="muted">Employees and freelancers, skills, rates, region-specific labor rules, scheduling conflicts and utilization.</div></div>
        <Button variant="primary" onClick={() => setAdd(true)}>+ Staff</Button>
      </div>
      {conflicts.map(([a, b], i) => <Alert key={i} tone="danger">Conflict: {state.staff.find((s) => s.id === a.staffId)?.name} double-booked on {fmtDate(a.date)} — <Link to={`/events/${a.eventId}?tab=staff`}>{a.eventName}</Link> vs <Link to={`/events/${b.eventId}?tab=staff`}>{b.eventName}</Link></Alert>)}
      <Card className="mt">
        <table className="t">
          <thead><tr><th>Name</th><th>Type</th><th>Skills</th><th>Rate</th><th>Labor rules</th><th className="num">Shifts (90d)</th><th className="num">Hours</th><th className="num">Cost</th><th>Classification</th><th>Calendar</th></tr></thead>
          <tbody>
            {state.staff.map((st) => {
              const mine = all.filter((s) => s.staffId === st.id);
              const recent = mine.filter((s) => s.date >= addDays(today, -90) && s.date <= addDays(today, 90));
              const hours = mine.reduce((a, s) => a + shiftHours(s), 0);
              const cost = mine.reduce((a, s) => a + shiftCost(s, st).cost, 0);
              const risk = classificationRisk(st, recent.length);
              const weekly = weeklyCompliance(st, mine);
              return (
                <tr key={st.id}>
                  <td><b>{st.name}</b><div className="faint">{st.region} · {st.phone}</div></td>
                  <td><Badge tone={st.type === 'freelancer' ? 'warn' : 'info'}>{st.type}</Badge></td>
                  <td style={{ fontSize: 12 }}>{st.skills.join(', ')}</td>
                  <td>{st.rate}/{st.rateType === 'hourly' ? 'h' : 'event'}</td>
                  <td style={{ fontSize: 12 }}>{LABOR_RULES[st.laborRegion]?.label}{weekly.map((w) => <div key={w.week} className="text-danger">{w.warning}{w.premium ? ` (+${w.premium} premium)` : ''}</div>)}</td>
                  <td className="num">{recent.length}</td>
                  <td className="num">{hours.toFixed(1)}</td>
                  <td className="num"><Money value={cost} /></td>
                  <td style={{ fontSize: 12 }}>{risk ? <span style={{ color: 'var(--danger)' }}>{risk}</span> : <span className="faint">—</span>}</td>
                  <td><Button size="sm" onClick={() => ics(st)}>.ics</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card title="All upcoming shifts" className="mt">
        <table className="t">
          <thead><tr><th>Date</th><th>Staff</th><th>Event</th><th>Role</th><th>Shift</th><th>Confirmed</th></tr></thead>
          <tbody>{all.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).map((s) => <tr key={s.id}><td className="nowrap">{fmtDate(s.date)}</td><td>{state.staff.find((x) => x.id === s.staffId)?.name}</td><td><Link to={`/events/${s.eventId}?tab=staff`}>{s.eventName}</Link></td><td>{s.role}</td><td>{s.start}–{s.end}</td><td>{s.confirmed ? <Badge tone="ok">yes</Badge> : <Badge tone="warn">pending</Badge>}</td></tr>)}</tbody>
        </table>
      </Card>
      {add && <AddStaff onClose={() => setAdd(false)} />}
    </div>
  );
}

function AddStaff({ onClose }) {
  const { act } = useStore();
  const [v, , bind] = useForm({ name: '', type: 'freelancer', skills: '', rate: 30, rateType: 'hourly', region: '', laborRegion: 'US-NY', phone: '' });
  return (
    <Modal title="Add staff" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.name} onClick={() => { act('STAFF_ADD', { data: { ...v, skills: v.skills.split(',').map((x) => x.trim()).filter(Boolean) } }); onClose(); }}>Add</Button></>}>
      <div className="grid g2">
        <Field label="Name"><input {...bind('name')} /></Field>
        <Field label="Type"><select {...bind('type')}><option value="employee">Employee</option><option value="freelancer">Freelancer (1099 / contractor)</option></select></Field>
        <Field label="Skills"><input {...bind('skills')} /></Field>
        <Field label="Region"><input {...bind('region')} /></Field>
        <Field label="Rate"><input type="number" {...bind('rate')} /></Field>
        <Field label="Rate type"><select {...bind('rateType')}><option value="hourly">Hourly</option><option value="event">Per event</option></select></Field>
        <Field label="Labor rules"><select {...bind('laborRegion')}>{Object.entries(LABOR_RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
        <Field label="Phone"><input {...bind('phone')} /></Field>
      </div>
    </Modal>
  );
}
