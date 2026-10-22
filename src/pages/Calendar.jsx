import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, StageBadge, ConfirmButton, Button, Gantt, dayTicks, Icon } from '../design-system/index.js';
import { AvailabilityCheck } from '../components/Availability.jsx';
import { availability } from '../lib/availability.js';
import { toISODate, parseDate, fmtDate, diffDays } from '../lib/dates.js';
import { SALES_STAGES } from '../lib/lifecycle.js';
import { workloadTimeline } from '../lib/timeline.js';
import { useNavigate } from 'react-router-dom';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const { state, act, today } = useStore();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [holdEvent, setHoldEvent] = useState('');

  const first = parseDate(`${month}-01`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return toISODate(d); });
  const shift = (n) => { const d = parseDate(`${month}-01`); d.setMonth(d.getMonth() + n); setMonth(toISODate(d).slice(0, 7)); };

  const av = availability(sel, { events: state.events, holds: state.holds, capacity: state.settings.capacity, planners: state.users.filter((u) => u.role === 'planner') });
  const holdable = state.events.filter((e) => SALES_STAGES.includes(e.stage) || (e.stage === 'booked' && e.dateStatus !== 'locked'));
  const activeHolds = state.holds.filter((h) => h.status === 'active').sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority);

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <h1>Availability & Date Holds</h1>
          <div className="muted">Capacity per date is configurable (Settings). A date is only <b>locked</b> once the deposit is received; before that it is a <b>hold</b> that expires after {state.settings.holdExpiryDays} days.</div>
        </div>
      </div>
      <Card title="Planner workload — each event from T-45 to close-out" className="mb">
        <WorkloadView />
      </Card>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)' }}>
        <Card title={parseDate(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} actions={<div className="row"><Button size="sm" onClick={() => shift(-1)}>‹</Button><Button size="sm" onClick={() => setMonth(today.slice(0, 7))}>Today</Button><Button size="sm" onClick={() => shift(1)}>›</Button></div>}>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {days.map((d) => {
              const a = availability(d, { events: state.events, holds: state.holds, capacity: state.settings.capacity, planners: state.users.filter((u) => u.role === 'planner') });
              return (
                <div key={d} className={`day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''} ${a.status === 'full' ? 'full' : a.holds.length ? 'held' : ''}`} onClick={() => setSel(d)} style={sel === d ? { outline: '2px solid var(--brand)' } : undefined}>
                  <div className="row between"><span className="num">{Number(d.slice(8))}</span><span className="faint">{a.booked.length}/{a.capacity}</span></div>
                  {a.booked.map((e) => <span key={e.id} className={`chip ${e.dateStatus === 'locked' ? 'locked' : 'hold'}`}><Icon name={e.dateStatus === 'locked' ? 'lock' : 'hourglass'} size={10} /> {e.name}</span>)}
                  {a.holds.filter((h) => !a.booked.some((b) => b.id === h.eventId)).map((h) => <span key={h.id} className="chip hold">#{h.priority} {state.events.find((e) => e.id === h.eventId)?.name}</span>)}
                </div>
              );
            })}
          </div>
          <div className="legend mt"><span><i style={{ background: 'var(--ok-soft)' }} />Locked (deposit paid)</span><span><i style={{ background: 'var(--warn-soft)' }} />Hold</span><span><i style={{ background: '#fff1f0' }} />Full</span></div>
        </Card>
        <div>
          <Card title={fmtDate(sel, { weekday: 'long' })}>
            <AvailabilityCheck date={sel} />
            <h4 className="mt">Booked</h4>
            {av.booked.length === 0 && <div className="faint">None</div>}
            {av.booked.map((e) => <div key={e.id} className="row"><Link to={`/events/${e.id}`}>{e.name}</Link><StageBadge stage={e.stage} /></div>)}
            <h4 className="mt">Holds (priority order)</h4>
            {av.holds.length === 0 && <div className="faint">None</div>}
            {av.holds.map((h) => {
              const e = state.events.find((x) => x.id === h.eventId);
              return (
                <div key={h.id} className="card" style={{ padding: 10 }}>
                  <div className="row between"><b>#{h.priority} {e?.name}</b><Badge tone={diffDays(today, h.expiresAt) <= 2 ? 'danger' : 'warn'}>exp. {fmtDate(h.expiresAt)}</Badge></div>
                  <div className="row mt">
                    <Button size="sm" onClick={() => act('HOLD_EXTEND', { holdId: h.id, days: 7 })}>Extend 7d</Button>
                    <ConfirmButton variant="danger" size="sm" message="Release this hold? The next hold in line will be notified." onConfirm={() => act('HOLD_RELEASE', { holdId: h.id, reason: 'Released manually' })}>Release</ConfirmButton>
                  </div>
                </div>
              );
            })}
            <h4 className="mt">Place a hold on this date</h4>
            <div className="row">
              <select value={holdEvent} onChange={(e) => setHoldEvent(e.target.value)} style={{ flex: 1 }}>
                <option value="">Select deal…</option>
                {holdable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <Button variant="primary" disabled={!holdEvent} onClick={() => act('HOLD_CREATE', { eventId: holdEvent, date: sel })}>Hold</Button>
            </div>
          </Card>
          <Card title="All active holds">
            <table className="t">
              <thead><tr><th>Date</th><th>#</th><th>Event</th><th>Expires</th></tr></thead>
              <tbody>
                {activeHolds.map((h) => (
                  <tr key={h.id} onClick={() => { setSel(h.date); setMonth(h.date.slice(0, 7)); }} style={{ cursor: 'pointer' }}>
                    <td className="nowrap">{fmtDate(h.date)}</td><td>{h.priority}</td><td>{state.events.find((e) => e.id === h.eventId)?.name}</td>
                    <td className="nowrap" style={{ color: diffDays(today, h.expiresAt) <= 2 ? 'var(--danger)' : undefined }}>{fmtDate(h.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Portfolio Gantt: overlapping bars on one planner lane = crunch periods (several events peaking together). */
function WorkloadView() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const tl = workloadTimeline(state, today);
  return (
    <>
      <Gantt range={tl.range} lanes={tl.lanes} ticks={dayTicks(tl.range, tl.toDate)} markers={tl.markers} pxPerUnit={3} fit labelWidth={170} onItemClick={(it) => nav(`/events/${it.href}?tab=timeline`)} />
      <div className="legend mt"><span><i className="tone-brand-soft" style={{ border: '1px solid' }} />Social event</span><span><i className="tone-info-soft" style={{ border: '1px solid' }} />Corporate event</span><span className="muted">Stacked bars on one lane = parallel events for that planner. Click to open the event timeline.</span></div>
    </>
  );
}
