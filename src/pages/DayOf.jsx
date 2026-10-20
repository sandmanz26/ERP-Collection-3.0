import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Badge, StatusBadge, PillSelect, Alert } from '../components/ui.jsx';
import { sortRos } from '../lib/ros.js';
import { addMinutes, fmtDate, fmtDateTime } from '../lib/dates.js';
import { ACTIVE_BOOKED_STAGES } from '../lib/lifecycle.js';
import { headcount } from '../lib/derived.js';
import { CallSheet } from './event/RunOfShowTab.jsx';

export default function DayOf() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, act, user, today } = useStore();
  const candidates = state.events.filter((e) => [...ACTIVE_BOOKED_STAGES, 'post_event'].includes(e.stage) && e.ros.items.length).sort((a, b) => Math.abs(new Date(a.date) - new Date(today)) - Math.abs(new Date(b.date) - new Date(today)));
  const ev = state.events.find((e) => e.id === id) ?? candidates[0];
  const [tab, setTab] = useState('timeline');
  const [se, setSe] = useState('all');
  if (!ev) return <div className="empty">No events with a run of show.</div>;
  const myStaffId = user.staffId;
  let items = sortRos(ev.ros.items);
  if (se !== 'all') items = items.filter((i) => i.subEventId === se);
  if (tab === 'mine') items = items.filter((i) => i.ownerStaffId === myStaffId || (!myStaffId && i.ownerStaffId));
  const myShift = ev.shifts.find((s) => s.staffId === myStaffId);
  const live = (itemId, liveStatus) => act('ROS_LIVE', { eventId: ev.id, itemId, liveStatus });
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Day-of mode</h1><div className="muted">Mobile view for coordinators & crew. Works offline: toggle the connection to simulate a venue with no signal — actions are stored locally and synced when back online.</div></div>
        <select value={ev.id} onChange={(e) => nav(`/dayof/${e.target.value}`)}>{candidates.map((e) => <option key={e.id} value={e.id}>{e.name} — {fmtDate(e.date)}</option>)}</select>
        <button className={`btn ${state.online ? '' : 'danger solid'}`} onClick={() => act('SET_ONLINE', { online: !state.online })}>{state.online ? '📶 Online — simulate offline' : '📵 Offline — reconnect & sync'}</button>
      </div>
      <div className="phone">
        <div className="screen">
          <div className="bar">
            <b style={{ flex: 1 }}>{ev.name}</b>
            <span className={`badge ${state.online ? 'ok' : 'danger'}`}>{state.online ? 'online' : `offline · ${state.offlineQueue.length} queued`}</span>
          </div>
          <div style={{ padding: 12 }}>
            <div className="row between mb"><span className="muted">{fmtDate(ev.date, { weekday: 'short' })} · {ev.venue?.name}</span><span className="badge">{user.name.split(' ')[0]}</span></div>
            {myShift && (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div className="row between"><span>My shift {myShift.start}–{myShift.end}</span>{!myShift.confirmed && <button className="btn sm" onClick={() => act('SHIFT_CONFIRM', { eventId: ev.id, shiftId: myShift.id })}>Confirm</button>}</div>
                <div className="row mt">
                  <button className="btn sm ok" disabled={!!myShift.clockIn} onClick={() => act('CLOCK', { eventId: ev.id, shiftId: myShift.id, direction: 'in', location: '40.7614,-74.0021 (mock GPS)' })}>Clock in {myShift.clockIn && myShift.clockIn.slice(11, 16)}</button>
                  <button className="btn sm" disabled={!myShift.clockIn || !!myShift.clockOut} onClick={() => act('CLOCK', { eventId: ev.id, shiftId: myShift.id, direction: 'out', location: 'mock GPS' })}>Clock out {myShift.clockOut && myShift.clockOut.slice(11, 16)}</button>
                </div>
              </div>
            )}
            <PillSelect options={[{ id: 'timeline', label: 'Timeline' }, { id: 'mine', label: 'My cues' }, { id: 'checkin', label: 'Check-in' }, { id: 'incident', label: 'Incident' }, { id: 'sheet', label: 'Call sheet' }]} value={tab} onChange={setTab} />
            {(tab === 'timeline' || tab === 'mine') && (
              <>
                <div className="mt"><select value={se} onChange={(e) => setSe(e.target.value)} style={{ width: '100%' }}><option value="all">All functions</option>{ev.subEvents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="mt">
                  {items.map((i) => (
                    <div key={i.id} className={`timeline-item ${i.liveStatus}`}>
                      <div className="time">{i.start}<div className="faint" style={{ fontSize: 10, fontWeight: 400 }}>→{addMinutes(i.start, i.duration)}</div></div>
                      <div>
                        <b>{i.activity}</b> {i.track === 'production' && <Badge tone="warn">prod</Badge>}
                        <div className="faint" style={{ fontSize: 11.5 }}>{i.location} · {state.staff.find((s) => s.id === i.ownerStaffId)?.name}{i.cue && <> · 🎵 {i.cue}</>}</div>
                        <div className="row" style={{ marginTop: 4, gap: 4 }}>
                          {i.liveStatus !== 'in_progress' && i.liveStatus !== 'done' && <button className="btn sm primary" onClick={() => live(i.id, 'in_progress')}>Start</button>}
                          {i.liveStatus === 'in_progress' && <button className="btn sm ok" onClick={() => live(i.id, 'done')}>Done</button>}
                          {i.liveStatus !== 'done' && <><button className="btn sm" onClick={() => act('ROS_SHIFT', { eventId: ev.id, itemId: i.id, minutes: 5 })}>+5</button><button className="btn sm" onClick={() => act('ROS_SHIFT', { eventId: ev.id, itemId: i.id, minutes: 15 })}>+15</button></>}
                        </div>
                      </div>
                      <div><StatusBadge status={i.liveStatus} />{i.delayedBy ? <div className="faint" style={{ fontSize: 10 }}>+{i.delayedBy}m</div> : null}</div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="empty">Nothing assigned.</div>}
                </div>
              </>
            )}
            {tab === 'checkin' && <CheckIn ev={ev} />}
            {tab === 'incident' && <Incident ev={ev} />}
            {tab === 'sheet' && <div className="mt" style={{ fontSize: 12 }}><CallSheet ev={ev} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIn({ ev }) {
  const { act } = useStore();
  const [q, setQ] = useState('');
  const hc = headcount(ev);
  const hh = ev.households.filter((h) => !q || h.code.toLowerCase() === q.toLowerCase() || h.name.toLowerCase().includes(q.toLowerCase()) || h.guests.some((g) => g.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 15);
  return (
    <div className="mt">
      <div className="row between"><b>Checked in {hc.checkedIn} / {hc.confirmed}</b></div>
      <input className="mt" style={{ width: '100%' }} placeholder="Scan QR / type code or name" value={q} onChange={(e) => setQ(e.target.value)} />
      {hh.map((h) => (
        <div key={h.id} className="card" style={{ padding: 8, marginTop: 6 }}>
          <div className="row between"><b>{h.name}</b><code>{h.code}</code></div>
          {h.guests.map((g) => (
            <div key={g.id} className="row between" style={{ fontSize: 13 }}>
              <span>{g.name} {g.dietary && <Badge tone="warn">{g.dietary}</Badge>}</span>
              <button className={`btn sm ${g.checkedIn ? 'ok' : ''}`} onClick={() => act('GUEST_CHECKIN', { eventId: ev.id, guestId: g.id, value: !g.checkedIn, via: q && h.code.toLowerCase() === q.toLowerCase() ? 'QR' : 'manual' })}>{g.checkedIn ? '✓ in' : 'Check in'}</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Incident({ ev }) {
  const { act } = useStore();
  const [v, setV] = useState({ type: 'Damage', severity: 'low', description: '', photo: null });
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setV((s) => ({ ...s, photo: r.result }));
    r.readAsDataURL(f);
  };
  return (
    <div className="mt stack">
      <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{['Damage', 'Injury', 'Complaint', 'Vendor no-show', 'Security', 'Weather', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
      <select value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value })}><option>low</option><option>medium</option><option>high</option></select>
      <textarea placeholder="What happened?" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <input type="file" accept="image/*" capture="environment" onChange={onFile} />
      {v.photo && <img src={v.photo} alt="preview" style={{ maxWidth: '100%', borderRadius: 8 }} />}
      <button className="btn danger solid" disabled={!v.description} onClick={() => { act('INCIDENT_ADD', { eventId: ev.id, ...v }); setV({ ...v, description: '', photo: null }); }}>Report incident</button>
      <h4 className="mt">Reported</h4>
      {ev.incidents.map((i) => <Alert key={i.id} tone={i.severity === 'high' ? 'danger' : 'warning'}><div><b>{i.type}</b> · {i.description}<div className="faint">{fmtDateTime(i.at)}</div></div></Alert>)}
    </div>
  );
}
