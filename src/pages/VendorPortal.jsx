import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Alert, EmptyState, Button, useDialog } from '../design-system/index.js';
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
      <Card title="Compliance documents">
        {issues.map((i) => <Alert key={i.text} tone={i.level}>{i.text}</Alert>)}
        <div className="row mt">Certificate of Insurance valid until <b>{fmtDate(v.coiExpiry)}</b></div>
        <div className="row mt"><span>Upload renewed COI — new expiry:</span><input type="date" value={coi} onChange={(e) => setCoi(e.target.value)} /><Button variant="primary" disabled={!coi} onClick={() => act('VENDOR_COI_UPLOAD', { vendorId: v.id, expiry: coi })}>Upload COI</Button></div>
      </Card>
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
                {b.vendorInvoices.map((vi) => <div key={vi.id}>📄 {vi.name} — <Money value={vi.amount} currency={e.currency} /></div>)}
                <div className="row mt"><input type="file" onChange={async (ev) => { const f = ev.target.files?.[0]; if (!f) return; const amount = await dialog.prompt({ title: `Upload ${f.name}`, label: 'Invoice amount', type: 'number', defaultValue: b.cost }); if (amount === null) return; act('VENDOR_INVOICE_UPLOAD', { eventId: e.id, bookingId: b.id, name: f.name, amount: Number(amount) }); }} /></div>
              </div>
            </div>
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
                <td>{fmtDate(r.dueDate)}</td>
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
      {tasks.map(({ t, e }) => (
        <label key={t.id} className="row" style={{ padding: '4px 0' }}>
          <input type="checkbox" checked={t.status === 'done'} onChange={(ev) => act('TASK_UPDATE', { eventId: e.id, taskId: t.id, patch: { status: ev.target.checked ? 'done' : 'todo' } })} />
          <span style={{ flex: 1 }}>{t.title}</span><span className="faint">{e.name} · due {fmtDate(t.dueDate)}</span>
        </label>
      ))}
    </Card>
  );
}
