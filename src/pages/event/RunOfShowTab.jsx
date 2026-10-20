import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Modal, Field, useForm, PillSelect, Alert, download, CommitInput } from '../../components/ui.jsx';
import { sortRos, rosForVendor } from '../../lib/ros.js';
import { addMinutes, fmtDate, fmtDateTime } from '../../lib/dates.js';

export function CallSheet({ ev }) {
  const { state } = useStore();
  const v = ev.venue || {};
  const vendors = ev.vendorBookings.filter((b) => b.status !== 'cancelled').map((b) => ({ b, v: state.vendors.find((x) => x.id === b.vendorId) }));
  const crew = ev.shifts.map((s) => ({ s, st: state.staff.find((x) => x.id === s.staffId) }));
  return (
    <div>
      <div className="grid g2">
        <div className="kv">
          <div>Event</div><div><b>{ev.name}</b> · {fmtDate(ev.date, { weekday: 'long' })}</div>
          <div>Venue</div><div>{v.name}<br />{v.address}</div>
          <div>Parking / loading</div><div>{v.parking || '—'}</div>
          <div>Access code</div><div>{v.accessCode || '—'}</div>
          <div>Curfew</div><div>{v.curfew || '—'}</div>
          <div>Emergency contact</div><div>{v.emergencyContact || '—'}</div>
          <div>Nearest hospital</div><div>{v.nearestHospital || '—'}</div>
          <div>Emergency</div><div>911 (US) · 112 (EU) · 999 (UK)</div>
        </div>
        <div>
          <h4>Functions</h4>
          {ev.subEvents.map((s) => <div key={s.id}>{s.start}–{s.end} · <b>{s.name}</b> · {s.room} ({s.guestCount} pax)</div>)}
        </div>
      </div>
      <h4 className="mt2">Crew</h4>
      <table className="t"><tbody>{crew.map(({ s, st }) => <tr key={s.id}><td>{st?.name}</td><td>{s.role}</td><td>{s.start}–{s.end}</td><td>{st?.phone}</td><td>{s.confirmed ? <Badge tone="ok">confirmed</Badge> : <Badge tone="warn">unconfirmed</Badge>}</td></tr>)}</tbody></table>
      <h4 className="mt2">Vendors</h4>
      <table className="t"><tbody>{vendors.map(({ b, v: vd }) => <tr key={b.id}><td>{vd?.name}</td><td>{b.category}</td><td>{b.onsiteContact}</td><td>{vd?.phone}</td><td>in {b.loadIn ? fmtDateTime(b.loadIn) : '—'} / out {b.loadOut ? fmtDateTime(b.loadOut) : '—'}</td></tr>)}</tbody></table>
    </div>
  );
}

export function callSheetText(state, ev) {
  const v = ev.venue || {};
  const lines = [`CALL SHEET — ${ev.name}`, `Date: ${ev.date}`, `Venue: ${v.name}, ${v.address}`, `Parking: ${v.parking}`, `Access: ${v.accessCode}`, `Curfew: ${v.curfew}`, `Emergency: ${v.emergencyContact}`, `Hospital: ${v.nearestHospital}`, '', 'CREW'];
  ev.shifts.forEach((s) => { const st = state.staff.find((x) => x.id === s.staffId); lines.push(`- ${st?.name} | ${s.role} | ${s.start}-${s.end} | ${st?.phone}`); });
  lines.push('', 'VENDORS');
  ev.vendorBookings.forEach((b) => { const vd = state.vendors.find((x) => x.id === b.vendorId); lines.push(`- ${vd?.name} | ${b.category} | ${b.onsiteContact} | load-in ${b.loadIn} | load-out ${b.loadOut}`); });
  lines.push('', 'RUN OF SHOW');
  sortRos(ev.ros.items).forEach((i) => lines.push(`${i.start} (+${i.duration}m) [${i.track}] ${i.activity} @ ${i.location}${i.cue ? ` | CUE: ${i.cue}` : ''}`));
  return lines.join('\n');
}

export default function RunOfShowTab({ ev }) {
  const { state, act } = useStore();
  const [view, setView] = useState('all');
  const [track, setTrack] = useState('all');
  const [add, setAdd] = useState(false);
  const [sheet, setSheet] = useState(false);
  let items = sortRos(ev.ros.items);
  if (track !== 'all') items = items.filter((i) => i.track === track);
  if (view.startsWith('vd_')) items = rosForVendor(items, view);
  const vendorIds = [...new Set(ev.vendorBookings.map((b) => b.vendorId))];
  const statusFlow = { draft: 'shared', shared: 'final', final: 'draft' };
  return (
    <div>
      <Card title={`Run of show — v${ev.ros.version}`} actions={<div className="row">
        <StatusBadge status={ev.ros.status} />
        <button className="btn" onClick={() => act('ROS_SET_STATUS', { eventId: ev.id, status: statusFlow[ev.ros.status] })}>{ev.ros.status === 'draft' ? 'Share with vendors' : ev.ros.status === 'shared' ? 'Mark FINAL' : 'Back to draft'}</button>
        <button className="btn" onClick={() => setSheet(true)}>Call sheet</button>
        <button className="btn primary" onClick={() => setAdd(true)}>+ Item</button>
      </div>}>
        {ev.ros.status === 'final' && <Alert tone="warning">Timeline is FINAL. Any change now notifies affected vendors and crew automatically.</Alert>}
        <div className="row mb mt">
          <PillSelect options={[{ id: 'all', label: 'All tracks' }, { id: 'guest', label: 'Guest timeline' }, { id: 'production', label: 'Production' }]} value={track} onChange={setTrack} />
          <span className="muted">View as:</span>
          <select value={view} onChange={(e) => setView(e.target.value)}><option value="all">Planner (everything)</option>{vendorIds.map((id) => <option key={id} value={id}>Vendor: {state.vendors.find((v) => v.id === id)?.name}</option>)}</select>
        </div>
        {ev.subEvents.map((se) => {
          const its = items.filter((i) => i.subEventId === se.id);
          if (!its.length) return null;
          return (
            <div key={se.id} className="mb">
              <h4 className="mt">{se.name} · {se.room}</h4>
              <table className="t">
                <thead><tr><th>Start</th><th>End</th><th>Track</th><th>Activity</th><th>Location</th><th>Owner</th><th>Vendors</th><th>Cue</th><th>Live</th><th /></tr></thead>
                <tbody>
                  {its.map((i) => (
                    <tr key={i.id}>
                      <td><CommitInput type="time" value={i.start} onCommit={(v) => act('ROS_ITEM_UPDATE', { eventId: ev.id, itemId: i.id, patch: { start: v } })} /></td>
                      <td className="faint">{addMinutes(i.start, i.duration)}</td>
                      <td><Badge tone={i.track === 'production' ? 'warn' : 'info'}>{i.track}</Badge></td>
                      <td><b>{i.activity}</b>{i.notes && <div className="faint">{i.notes}</div>}</td>
                      <td>{i.location}</td>
                      <td>{state.staff.find((s) => s.id === i.ownerStaffId)?.name}</td>
                      <td style={{ fontSize: 12 }}>{i.vendorIds.map((v) => state.vendors.find((x) => x.id === v)?.name).join(', ')}</td>
                      <td style={{ fontSize: 12 }}>{i.cue}</td>
                      <td><StatusBadge status={i.liveStatus} />{i.delayedBy ? <span className="faint"> +{i.delayedBy}m</span> : null}</td>
                      <td><button className="btn sm ghost" onClick={() => act('ROS_ITEM_REMOVE', { eventId: ev.id, itemId: i.id })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <h4 className="mt">Version history</h4>
        {ev.ros.history.map((h, i) => <div key={i} className="faint">v{h.version} · {h.status} · {fmtDateTime(h.at)} · {state.users.find((u) => u.id === h.by)?.name}</div>)}
      </Card>
      {add && <AddRos ev={ev} onClose={() => setAdd(false)} />}
      {sheet && (
        <Modal wide title="Call sheet (auto-generated)" onClose={() => setSheet(false)} footer={<button className="btn primary" onClick={() => { download(`${ev.name}-call-sheet.txt`, callSheetText(state, ev)); act('INTERACTION_ADD', { eventId: ev.id, type: 'note', summary: 'Call sheet downloaded/distributed' }); }}>Download</button>}>
          <CallSheet ev={ev} />
        </Modal>
      )}
    </div>
  );
}

function AddRos({ ev, onClose }) {
  const { state, act } = useStore();
  const [v, , bind] = useForm({ subEventId: ev.subEvents[0]?.id, track: 'guest', start: '18:00', duration: 15, activity: '', location: '', ownerStaffId: '', cue: '', notes: '' });
  const [vids, setVids] = useState([]);
  return (
    <Modal title="Add run-of-show item" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.activity} onClick={() => { act('ROS_ITEM_ADD', { eventId: ev.id, data: { ...v, duration: Number(v.duration), vendorIds: vids } }); onClose(); }}>Add</button></>}>
      <div className="grid g3">
        <Field label="Function"><select {...bind('subEventId')}>{ev.subEvents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Track"><select {...bind('track')}><option value="guest">Guest timeline</option><option value="production">Production</option></select></Field>
        <Field label="Owner"><select {...bind('ownerStaffId')}><option value="">—</option>{state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Start"><input type="time" {...bind('start')} /></Field>
        <Field label="Duration (min)"><input type="number" {...bind('duration')} /></Field>
        <Field label="Location"><input {...bind('location')} /></Field>
      </div>
      <Field label="Activity" style={{ marginTop: 10 }}><input {...bind('activity')} /></Field>
      <div className="grid g2 mt"><Field label="Cue (music/lights/MC)"><input {...bind('cue')} /></Field><Field label="Notes"><input {...bind('notes')} /></Field></div>
      <h4 className="mt">Vendors involved</h4>
      <PillSelect multi options={ev.vendorBookings.map((b) => ({ id: b.vendorId, label: state.vendors.find((x) => x.id === b.vendorId)?.name }))} value={vids} onChange={setVids} />
    </Modal>
  );
}
