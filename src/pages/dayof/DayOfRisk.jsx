// Day-of tools for the things that go wrong on the night: late vendors, the party running over, personal items.
import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Badge, Button, Alert, Icon, useDialog } from '../../design-system/index.js';
import { lateVendors, overtimeQuote, overtimeApprovers, custodyOpen } from '../../lib/risk.js';
import { fmtMoney } from '../../lib/money.js';
import { fmtDateTime } from '../../lib/dates.js';

export function VendorArrivals({ ev }) {
  const { state, act } = useStore();
  const late = new Set(lateVendors(state, ev).map((x) => x.booking.id));
  const list = ev.vendorBookings.filter((b) => b.status !== 'cancelled').sort((a, b) => (a.loadIn || '').localeCompare(b.loadIn || ''));
  if (!list.length) return <div className="empty">No vendors booked.</div>;
  return (
    <div className="mt">
      {late.size > 0 && <Alert tone="danger">{late.size} vendor(s) past load-in without check-in — call them now.</Alert>}
      {list.map((b) => {
        const v = state.vendors.find((x) => x.id === b.vendorId);
        return (
          <div key={b.id} className="card compact mt">
            <div className="row between"><b>{v?.name}</b>{b.arrivedAt ? <Badge tone="ok">on site {b.arrivedAt.slice(11, 16)}</Badge> : late.has(b.id) ? <Badge tone="danger">late</Badge> : <Badge>expected</Badge>}</div>
            <div className="faint text-xs">{b.category} · load-in {b.loadIn ? b.loadIn.slice(11, 16) : '—'} · {b.onsiteContact || v?.phone}</div>
            {!b.arrivedAt && <div className="row mt" style={{ gap: 6 }}><Button size="sm" variant="primary" onClick={() => act('VENDOR_ARRIVED', { eventId: ev.id, bookingId: b.id })}>Arrived</Button>{b.onsiteContact && <a className="btn sm" href={`tel:${(b.onsiteContact.match(/\+[\d\s]+/) || [''])[0].replace(/\s/g, '')}`}><Icon name="phone" size={12} /> Call</a>}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** The party wants another hour: show the price first, capture who approved it, invoice it. No verbal yeses. */
export function Overtime({ ev }) {
  const { state, act } = useStore();
  const [minutes, setMinutes] = useState(60);
  const approvers = overtimeApprovers(state, ev);
  const [approver, setApprover] = useState('');
  const q = overtimeQuote(state, ev, minutes);
  return (
    <div className="mt">
      <div className="faint text-xs">Quote the extension before the band plays on. Rates come from the venue, vendor bookings and crew still on site.</div>
      <div className="row mt">{[30, 60, 90, 120].map((m) => <Button key={m} size="sm" variant={minutes === m ? 'primary' : 'secondary'} onClick={() => setMinutes(m)}>+{m} min</Button>)}</div>
      <div className="card compact mt">
        {q.lines.length ? q.lines.map((l) => <div key={l.label} className="row between text-sm"><span>{l.label}</span><span>{fmtMoney(l.amount, ev.currency)}</span></div>) : <div className="faint">No overtime rates on file.</div>}
        <div className="row between mt"><b>Total (excl. tax)</b><b>{fmtMoney(q.total, ev.currency)}</b></div>
      </div>
      <label className="field mt"><span>Approved by (authorized client representative)</span>
        <select value={approver} onChange={(e) => setApprover(e.target.value)}><option value="">Choose…</option>{approvers.map((a) => <option key={a}>{a}</option>)}</select>
      </label>
      <Button className="mt" variant="primary" disabled={!approver || !q.total} onClick={() => { act('OVERTIME_APPROVE', { eventId: ev.id, minutes, approverName: approver }); setApprover(''); }}>Confirm & invoice {fmtMoney(q.total, ev.currency)}</Button>
      {(ev.overtime || []).map((o) => <div key={o.id} className="faint text-xs mt"><Icon name="check" size={11} /> +{o.minutes} min · {o.approverName} · {fmtMoney(o.total, ev.currency)} · {fmtDateTime(o.at)}</div>)}
    </div>
  );
}

export function CustodyItems({ ev }) {
  const { act } = useStore();
  const dialog = useDialog();
  const items = ev.custody || [];
  const open = custodyOpen(ev);
  const move = async (c, status) => {
    const r = await dialog.form({ title: status === 'received' ? `Receive: ${c.item}` : `Hand back: ${c.item}`, fields: [{ name: 'person', label: status === 'received' ? 'Handed to us by' : 'Handed back to', defaultValue: status === 'returned' ? c.owner : '', required: true }] });
    r && act('CUSTODY_UPDATE', { eventId: ev.id, itemId: c.id, status, person: r.person });
  };
  if (!items.length) return <div className="empty">No personal items registered for this event.</div>;
  return (
    <div className="mt">
      {open.length > 0 && <Alert tone="warning">{open.length} item(s) still to hand back before you leave the venue.</Alert>}
      {items.map((c) => (
        <div key={c.id} className="card compact mt">
          <div className="row between"><b>{c.item}</b><Badge tone={c.status === 'returned' ? 'ok' : c.status === 'received' ? 'warn' : undefined}>{c.status}</Badge></div>
          <div className="faint text-xs">{c.owner && `Return to ${c.owner}`}{c.notes ? ` · ${c.notes}` : ''}</div>
          {c.log.map((l, i) => <div key={i} className="faint text-xs">{l.status === 'received' ? 'From' : 'To'} {l.person} · {fmtDateTime(l.at)}</div>)}
          <div className="row mt" style={{ gap: 6 }}>
            {c.status === 'expected' && <Button size="sm" onClick={() => move(c, 'received')}>Received</Button>}
            {c.status === 'received' && <Button size="sm" variant="primary" onClick={() => move(c, 'returned')}>Hand back</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}
