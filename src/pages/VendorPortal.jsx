import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Alert, EmptyState, Button, useDialog, Gantt, hourTicks, SitePlan, PillSelect, Icon, Callout } from '../design-system/index.js';
import { dayTimeline, productionIssues } from '../lib/timeline.js';
import { positionFill, WORKER_STATUSES } from '../lib/workforce.js';
import { sortRos, rosForVendor } from '../lib/ros.js';
import { vendorCompliance } from '../lib/derived.js';
import { fmtDate, fmtDateTime, addMinutes } from '../lib/dates.js';

export default function VendorPortal() {
  const dialog = useDialog();
  const { state, act, user, today } = useStore();
  const v = state.vendors.find((x) => x.id === user.vendorId);
  const [coi, setCoi] = useState('');
  const bookings = state.events.flatMap((e) => e.vendorBookings.filter((b) => b.vendorId === v.id).map((b) => ({ b, e })));
  const issues = vendorCompliance(v, today);
  return (
    <div>
      <div className="portal-hero">
        <div style={{ opacity: 0.8, fontSize: 12 }}>{state.settings.company.name} · Vendor portal</div>
        <h1>{v.name}</h1>
        <div>{v.category} · {v.regions.join(', ')}</div>
      </div>
      <VendorCallouts vendor={v} bookings={bookings} />
      <div id="vp-compliance" />
      <Card title="Compliance documents">
        {issues.map((i) => <Alert key={i.text} tone={i.level}>{i.text}</Alert>)}
        <div className="row mt">Certificate of Insurance valid until <b>{fmtDate(v.coiExpiry)}</b></div>
        <div className="row mt"><span>Upload a renewed COI, valid until</span><input type="date" value={coi} onChange={(e) => setCoi(e.target.value)} /><Button variant="primary" disabled={!coi} onClick={() => act('VENDOR_COI_UPLOAD', { vendorId: v.id, expiry: coi })}>Upload COI</Button></div>
      </Card>
      <CrewRequests vendor={v} />
      <VendorRfqs vendor={v} />
      <VendorTasks vendor={v} />
      {bookings.length === 0 && <EmptyState>No bookings yet.</EmptyState>}
      {bookings.map(({ b, e }) => {
        const items = sortRos(rosForVendor(e.ros.items, v.id));
        return (
          <Card key={b.id} title={`${e.name} — ${fmtDate(e.date)}`} actions={<StatusBadge status={b.status} />}>
            <div className="grid g2">
              <div>
                <div><b>Service:</b> {b.service}</div>
                <div><b>Venue:</b> {e.venue?.name}, {e.venue?.address}</div>
                <div><b>Load-in:</b> {b.loadIn ? fmtDateTime(b.loadIn) : 'TBD'} · <b>Load-out:</b> {b.loadOut ? fmtDateTime(b.loadOut) : 'TBD'}</div>
                <div><b>Parking / dock:</b> {e.venue?.parking}</div>
                <div><b>Access:</b> {e.venue?.accessCode}</div>
                <div><b>Curfew:</b> {e.venue?.curfew}</div>
                <div><b>Planner on site:</b> {state.users.find((u) => u.id === e.plannerId)?.name}</div>
                {b.status === 'requested' && <Button variant="primary" className="mt" onClick={() => act('BOOKING_CONFIRM', { eventId: e.id, bookingId: b.id })}>Confirm booking & schedule</Button>}
              </div>
              <div>
                <h4>Your payments</h4>
                {b.model === 'direct' ? <div className="faint">Direct contract — invoice the client directly.</div> : b.payments.map((p) => <div key={p.id} className="row between"><span>{p.label} · {fmtDate(p.dueDate)}</span><span><Money value={p.amount} currency={e.currency} /> <StatusBadge status={p.status} /></span></div>)}
                <h4 className="mt">Invoices uploaded</h4>
                {b.vendorInvoices.map((vi) => <div key={vi.id}><Icon name="file" size={14} /> {vi.name} — <Money value={vi.amount} currency={e.currency} /></div>)}
                <div className="row mt"><input type="file" onChange={async (ev) => { const f = ev.target.files?.[0]; if (!f) return; const amount = await dialog.prompt({ title: `Upload ${f.name}`, label: 'Invoice amount', type: 'number', defaultValue: b.cost }); if (amount === null) return; act('VENDOR_INVOICE_UPLOAD', { eventId: e.id, bookingId: b.id, name: f.name, amount: Number(amount) }); }} /></div>
              </div>
            </div>
            <VendorDayLane ev={e} booking={b} />
            <VendorSiteFootprint ev={e} vendorId={v.id} />
            <h4 className="mt">Your run of show ({e.ros.status}, v{e.ros.version}) — only the items relevant to you</h4>
            {e.ros.status === 'draft' ? <div className="faint">Timeline not shared yet.</div> : (
              <table className="t"><tbody>{items.map((i) => <tr key={i.id}><td><b>{i.start}</b>–{addMinutes(i.start, i.duration)}</td><td>{i.activity}</td><td>{i.location}</td><td>{i.cue}</td><td>{i.notes}</td></tr>)}</tbody></table>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Requests for quote addressed to this vendor — the vendor answers directly in the portal. */
function VendorRfqs({ vendor }) {
  const { state, act } = useStore();
  const dialog = useDialog();
  const rfqs = state.events.flatMap((e) => e.rfqs.filter((r) => r.vendorIds.includes(vendor.id)).map((r) => ({ r, e })));
  if (!rfqs.length) return null;
  return (
    <Card title="Requests for quote">
      <div id="vp-rfq" />
      <table className="t">
        <thead><tr><th>Event</th><th>Scope</th><th>Respond by</th><th>Your quote</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rfqs.map(({ r, e }) => {
            const mine = r.responses.find((x) => x.vendorId === vendor.id);
            const status = r.awardedVendorId ? (r.awardedVendorId === vendor.id ? 'awarded' : 'declined') : mine ? 'quoted' : 'pending';
            return (
              <tr key={r.id}>
                <td>{e.name}<div className="faint">{fmtDate(e.date)}</div></td>
                <td>{r.category}: {r.description}</td>
                <td className="nowrap">{fmtDate(r.dueDate)}</td>
                <td>{mine ? <Money value={mine.amount} currency={e.currency} /> : '—'}</td>
                <td><StatusBadge status={status} /></td>
                <td>{!r.awardedVendorId && <Button size="sm" variant={mine ? 'secondary' : 'primary'} onClick={async () => {
                  const q = await dialog.form({ title: `Quote — ${r.category}`, fields: [{ name: 'amount', label: `Amount (${e.currency})`, type: 'number', required: true, defaultValue: mine?.amount }, { name: 'notes', label: 'Inclusions / notes', type: 'textarea', defaultValue: mine?.notes }] });
                  q && act('RFQ_RESPOND', { eventId: e.id, rfqId: r.id, vendorId: vendor.id, ...q });
                }}>{mine ? 'Update quote' : 'Submit quote'}</Button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** Checklist items the planner assigned to this vendor. */
function VendorTasks({ vendor }) {
  const { state, act } = useStore();
  const tasks = state.events.flatMap((e) => e.tasks.filter((t) => t.assigneeType === 'vendor' && t.assigneeId === vendor.id).map((t) => ({ t, e })));
  if (!tasks.length) return null;
  return (
    <Card title="Your tasks">
      <div id="vp-tasks" />
      {tasks.map(({ t, e }) => (
        <label key={t.id} className="row" style={{ padding: '4px 0' }}>
          <input type="checkbox" checked={t.status === 'done'} onChange={(ev) => act('TASK_UPDATE', { eventId: e.id, taskId: t.id, patch: { status: ev.target.checked ? 'done' : 'todo' } })} />
          <span style={{ flex: 1 }}>{t.title}</span><span className="faint">{e.name} · due {fmtDate(t.dueDate)}</span>
        </label>
      ))}
    </Card>
  );
}

/** Staffing agencies / vendors that supply people: see requested headcount and submit their own crew roster. */
function CrewRequests({ vendor }) {
  const { state, act } = useStore();
  const dialog = useDialog();
  const reqs = state.events.flatMap((e) => (e.positions || []).filter((p) => p.vendorId === vendor.id).map((p) => ({ p, e })));
  if (!reqs.length) return null;
  return (
    <Card title="Crew requested from you">
      <div id="vp-crew" />
      <div className="faint mb text-sm">Submit the names of the people you are sending — they receive QR credentials for venue access and are checked in on site. You are billed for the booked headcount.</div>
      {reqs.map(({ p, e }) => {
        const f = positionFill(e, p);
        const named = f.workers.filter((w) => w.status !== 'declined').length;
        return (
          <div key={p.id} className="card compact">
            <div className="row between">
              <span><b>{p.qty} × {p.role}</b> · {e.name} · {fmtDate(p.date, { weekday: 'short' })} {p.start}–{p.end}</span>
              <span className="row"><Badge tone={named >= p.qty ? 'ok' : 'danger'}>roster {named}/{p.qty}</Badge>
                <Button size="sm" variant="primary" onClick={async () => {
                  const r = await dialog.form({ title: `Submit crew — ${p.role}`, description: `${p.qty - named > 0 ? `${p.qty - named} more name(s) needed.` : 'Roster complete — you can still add stand-bys.'} One person per line, optional ", phone".`, fields: [{ name: 'names', label: 'Names', type: 'textarea', required: true }] });
                  r && act('WORKER_ADD', { eventId: e.id, positionId: p.id, workers: r.names.split('\n').map((l) => { const [name, phone] = l.split(','); return { name, phone: phone?.trim(), status: 'confirmed' }; }) });
                }}>+ Add names</Button></span>
            </div>
            {f.workers.length > 0 && (
              <table className="t mt"><tbody>{f.workers.map((w) => (
                <tr key={w.id}><td>{w.name}</td><td className="faint">{w.phone}</td><td><code>{w.credentialCode}</code></td>
                  <td><select value={w.status} onChange={(ev) => act('WORKER_UPDATE', { eventId: e.id, workerId: w.id, patch: { status: ev.target.value } })}>{WORKER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></td></tr>
              ))}</tbody></table>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/** The vendor's own lane of the production Gantt (booked window + their run-of-show items, conflicts in red). */
function VendorDayLane({ ev, booking }) {
  const { state } = useStore();
  if (ev.ros.status === 'draft') return null;
  const issues = productionIssues(state, ev);
  const tl = dayTimeline(state, ev, 'vendor', issues);
  const lane = tl?.lanes.find((l) => l.id === booking.id);
  if (!lane) return null;
  const mine = issues.filter((i) => (i.itemIds || []).some((id) => lane.items.some((x) => x.id === id)));
  return (
    <div className="mt">
      <h4>Your production timeline</h4>
      <Gantt range={tl.range} lanes={[lane]} ticks={hourTicks(tl.range, tl.day0)} markers={tl.markers} shading={tl.shading} pxPerUnit={0.5} fit labelWidth={150} />
      {mine.map((i, n) => <Alert key={n} tone="warning">{i.text}</Alert>)}
    </div>
  );
}

function VendorSiteFootprint({ ev, vendorId }) {
  const rooms = (ev.sitePlan?.rooms || []).filter((r) => r.elements.some((x) => x.vendorId === vendorId));
  const [roomId, setRoomId] = useState(rooms[0]?.id);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  if (!room) return null;
  return (
    <div className="mt">
      <div className="row between"><h4>Where you set up</h4>{rooms.length > 1 && <PillSelect options={rooms.map((r) => ({ id: r.id, label: r.name }))} value={room.id} onChange={setRoomId} />}</div>
      <div style={{ maxWidth: 640 }}><SitePlan readOnly width={room.width} height={room.height} elements={room.elements} highlightIds={room.elements.filter((x) => x.vendorId === vendorId).map((x) => x.id)} /></div>
      <div className="faint text-sm">Your elements are outlined in red.</div>
    </div>
  );
}

/** The vendor's to-do list, most urgent first. Scrolls to the section that resolves each item. */
function VendorCallouts({ vendor, bookings }) {
  const { state, act, today } = useStore();
  const items = [];
  vendorCompliance(vendor, today).forEach((i) => items.push({ tone: i.level, icon: 'shield', title: i.text, text: 'Upload a renewed certificate so bookings can be confirmed.', target: 'compliance', cta: 'Upload' }));
  bookings.filter(({ b }) => b.status === 'requested').forEach(({ b, e }) => items.push({ tone: 'warning', icon: 'calendar', title: `Confirm your booking for ${e.name}`, text: `${b.service} · ${fmtDate(e.date)}`, cta: 'Confirm', run: () => act('BOOKING_CONFIRM', { eventId: e.id, bookingId: b.id }) }));
  state.events.forEach((e) => (e.positions || []).filter((p) => p.vendorId === vendor.id).forEach((p) => {
    const named = (e.workers || []).filter((w) => w.positionId === p.id && w.status !== 'declined').length;
    if (named < p.qty) items.push({ tone: 'danger', icon: 'hardhat', title: `${p.qty - named} crew name(s) missing for ${p.role}`, text: `${e.name} · ${fmtDate(p.date)} call ${p.start}`, target: 'crew', cta: 'Add names' });
  }));
  state.events.forEach((e) => e.rfqs.filter((r) => r.vendorIds.includes(vendor.id) && !r.awardedVendorId && !r.responses.some((x) => x.vendorId === vendor.id)).forEach((r) => items.push({ tone: 'info', icon: 'file', title: `Quote requested: ${r.category}`, text: `${e.name} · respond by ${fmtDate(r.dueDate)}`, target: 'rfq', cta: 'Quote' })));
  state.events.forEach((e) => e.tasks.filter((t) => t.assigneeType === 'vendor' && t.assigneeId === vendor.id && t.status !== 'done').forEach((t) => items.push({ tone: t.dueDate < today ? 'danger' : 'info', icon: 'checkSquare', title: t.title, text: `${e.name} · due ${fmtDate(t.dueDate)}`, target: 'tasks', cta: 'Open' })));
  const order = { danger: 0, warning: 1, info: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone]);
  if (!items.length) return <Callout tone="success" icon="check" title="Nothing waiting on you">New requests from the planning team will appear here.</Callout>;
  return (
    <div className="grid g2 mb">
      {items.slice(0, 6).map((i, n) => <Callout key={n} tone={i.tone} icon={i.icon} title={i.title} action={{ label: i.cta, onClick: () => (i.run ? i.run() : document.getElementById(`vp-${i.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}>{i.text}</Callout>)}
    </div>
  );
}
