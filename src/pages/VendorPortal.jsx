import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Alert, Empty } from '../components/ui.jsx';
import { sortRos, rosForVendor } from '../lib/ros.js';
import { vendorCompliance } from '../lib/derived.js';
import { fmtDate, fmtDateTime, addMinutes } from '../lib/dates.js';

export default function VendorPortal() {
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
        <div className="row mt"><span>Upload renewed COI — new expiry:</span><input type="date" value={coi} onChange={(e) => setCoi(e.target.value)} /><button className="btn primary" disabled={!coi} onClick={() => act('VENDOR_COI_UPLOAD', { vendorId: v.id, expiry: coi })}>Upload COI</button></div>
      </Card>
      {bookings.length === 0 && <Empty>No bookings yet.</Empty>}
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
                {b.status === 'requested' && <button className="btn primary mt" onClick={() => act('BOOKING_CONFIRM', { eventId: e.id, bookingId: b.id })}>Confirm booking & schedule</button>}
              </div>
              <div>
                <h4>Your payments</h4>
                {b.model === 'direct' ? <div className="faint">Direct contract — invoice the client directly.</div> : b.payments.map((p) => <div key={p.id} className="row between"><span>{p.label} · {fmtDate(p.dueDate)}</span><span><Money value={p.amount} currency={e.currency} /> <StatusBadge status={p.status} /></span></div>)}
                <h4 className="mt">Invoices uploaded</h4>
                {b.vendorInvoices.map((vi) => <div key={vi.id}>📄 {vi.name} — <Money value={vi.amount} currency={e.currency} /></div>)}
                <div className="row mt"><input type="file" onChange={(ev) => { const f = ev.target.files?.[0]; if (!f) return; act('VENDOR_INVOICE_UPLOAD', { eventId: e.id, bookingId: b.id, name: f.name, amount: Number(prompt('Invoice amount', b.cost)) || b.cost }); }} /></div>
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
