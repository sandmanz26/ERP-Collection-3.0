import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Modal, Field, useForm, Alert, PillSelect, Button, useDialog } from '../../design-system/index.js';
import { vendorCompliance } from '../../lib/derived.js';
import { fmtDate, fmtDateTime } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { BUDGET_CATEGORIES } from '../../data/config.js';

export default function VendorsTab({ ev }) {
  const dialog = useDialog();
  const { state, act, today } = useStore();
  const [add, setAdd] = useState(false);
  const [rfq, setRfq] = useState(false);
  const [open, setOpen] = useState(null);
  const cur = ev.currency;
  return (
    <div>
      <Card title="Vendor bookings" actions={<div className="row"><Button onClick={() => setRfq(true)}>+ Request for quote</Button><Button variant="primary" onClick={() => setAdd(true)}>+ Book vendor</Button></div>}>
        <div className="legend mb"><span><b>Pass-through</b>: EO pays vendor & bills client (cash-flow risk, markup possible)</span><span><b>Direct</b>: client pays vendor; EO coordinates (commission possible)</span></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vendor</th><th>Service</th><th>Model</th><th className="num">Cost</th><th className="num">Sell</th><th className="num">Margin</th><th>Commission</th><th>Load-in / out</th><th>Compliance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {ev.vendorBookings.map((b) => {
                const v = state.vendors.find((x) => x.id === b.vendorId);
                const issues = vendorCompliance(v, today);
                return (
                  <React.Fragment key={b.id}>
                    <tr>
                      <td><b>{v.name}</b><div className="faint">{b.category} · {b.onsiteContact}</div></td>
                      <td>{b.service}{b.minGuarantee ? <div className="faint">min guarantee {b.minGuarantee} · contracted {b.contractedGuests}</div> : null}</td>
                      <td><select value={b.model} onChange={(e) => act('BOOKING_UPDATE', { eventId: ev.id, bookingId: b.id, patch: { model: e.target.value } })}><option value="pass_through">pass-through</option><option value="direct">direct</option></select></td>
                      <td className="num"><Money value={b.cost} currency={cur} /></td>
                      <td className="num">{b.model === 'pass_through' ? <Money value={b.sellPrice} currency={cur} /> : <span className="faint">client pays</span>}</td>
                      <td className="num">{b.model === 'pass_through' ? <Money value={round2(b.sellPrice - b.cost)} currency={cur} /> : '—'}</td>
                      <td>{b.commissionAmount ? <><Money value={b.commissionAmount} currency={cur} /> <StatusBadge status={b.commissionStatus} /><select value={b.commissionStatus} onChange={(e) => act('COMMISSION_STATUS', { eventId: ev.id, bookingId: b.id, status: e.target.value })}><option>pending</option><option>invoiced</option><option>paid</option></select></> : '—'}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{b.loadIn ? fmtDateTime(b.loadIn) : '—'}<br />{b.loadOut ? fmtDateTime(b.loadOut) : ''}</td>
                      <td>{issues.length ? issues.map((i) => <div key={i.text}><Badge tone={i.level}>{i.text}</Badge></div>) : <Badge tone="ok">OK</Badge>}</td>
                      <td><StatusBadge status={b.status} />{b.status === 'requested' && <Button size="sm" onClick={() => act('BOOKING_CONFIRM', { eventId: ev.id, bookingId: b.id })}>Mark confirmed</Button>}</td>
                      <td><Button size="sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? 'Hide' : 'Payments'}</Button></td>
                    </tr>
                    {open === b.id && (
                      <tr><td colSpan={11} style={{ background: 'var(--panel-2)' }}>
                        <div className="grid g2">
                          <div>
                            <h4>Vendor payables</h4>
                            <table className="t"><tbody>
                              {b.payments.map((p) => (
                                <tr key={p.id}><td>{p.label}</td><td>{fmtDate(p.dueDate)}</td><td className="num"><Money value={p.amount} currency={cur} /></td><td><StatusBadge status={p.status} /> {p.proofRef && <span className="faint">{p.proofRef}</span>}</td>
                                  <td>{p.status !== 'paid' && <Button variant="success" size="sm" onClick={() => act('VENDOR_PAYMENT_PAID', { eventId: ev.id, bookingId: b.id, paymentId: p.id })}>Mark paid</Button>}</td></tr>
                              ))}
                            </tbody></table>
                            <Button size="sm" className="mt" onClick={async () => { const r = await dialog.form({ title: 'Add vendor payable', fields: [{ name: 'label', label: 'Label', defaultValue: 'Installment', required: true }, { name: 'amount', label: `Amount (${ev.currency})`, type: 'number', required: true }, { name: 'dueDate', label: 'Due date', type: 'date', defaultValue: ev.date, required: true }] }); r && act('VENDOR_PAYMENT_ADD', { eventId: ev.id, bookingId: b.id, ...r }); }}>+ Payable</Button>
                          </div>
                          <div>
                            <h4>Vendor invoices & logistics</h4>
                            {b.vendorInvoices.length ? b.vendorInvoices.map((vi) => <div key={vi.id}>📄 {vi.name} — <Money value={vi.amount} currency={cur} /> <span className="faint">{fmtDateTime(vi.at)}</span></div>) : <div className="faint">No invoices uploaded</div>}
                            <div className="grid g2 mt">
                              <Field label="Load-in"><input type="datetime-local" defaultValue={b.loadIn} onBlur={(e) => e.target.value !== b.loadIn && act('BOOKING_UPDATE', { eventId: ev.id, bookingId: b.id, patch: { loadIn: e.target.value } })} /></Field>
                              <Field label="Load-out"><input type="datetime-local" defaultValue={b.loadOut} onBlur={(e) => e.target.value !== b.loadOut && act('BOOKING_UPDATE', { eventId: ev.id, bookingId: b.id, patch: { loadOut: e.target.value } })} /></Field>
                            </div>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Requests for quote (RFQ) — compare vendors">
        {ev.rfqs.length === 0 && <div className="faint">No RFQs yet.</div>}
        {ev.rfqs.map((r) => <RfqBlock key={r.id} ev={ev} r={r} />)}
      </Card>
      {add && <AddBooking ev={ev} onClose={() => setAdd(false)} />}
      {rfq && <NewRfq ev={ev} onClose={() => setRfq(false)} />}
    </div>
  );
}

function RfqBlock({ ev, r }) {
  const dialog = useDialog();
  const { state, act } = useStore();
  const best = r.responses.length ? Math.min(...r.responses.map((x) => x.amount)) : null;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between"><b>{r.category}: {r.description}</b><span className="faint">due {fmtDate(r.dueDate)}</span></div>
      <table className="t mt">
        <thead><tr><th>Vendor</th><th>Rating</th><th className="num">Quote</th><th>Notes</th><th /></tr></thead>
        <tbody>
          {r.vendorIds.map((vid) => {
            const v = state.vendors.find((x) => x.id === vid);
            const resp = r.responses.find((x) => x.vendorId === vid);
            return (
              <tr key={vid} style={r.awardedVendorId === vid ? { background: 'var(--ok-soft)' } : undefined}>
                <td>{v.name}</td><td>★ {v.rating}</td>
                <td className="num">{resp ? <><Money value={resp.amount} currency={ev.currency} /> {resp.amount === best && <Badge tone="ok">lowest</Badge>}</> : <span className="faint">awaiting</span>}</td>
                <td>{resp?.notes}</td>
                <td>
                  {!r.awardedVendorId && !resp && <Button size="sm" onClick={async () => { const q = await dialog.form({ title: `Quote from ${v.name}`, fields: [{ name: 'amount', label: `Amount (${ev.currency})`, type: 'number', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }] }); q && act('RFQ_RESPOND', { eventId: ev.id, rfqId: r.id, vendorId: vid, ...q }); }}>Enter quote</Button>}
                  {!r.awardedVendorId && resp && <Button variant="primary" size="sm" onClick={async () => { const a = await dialog.form({ title: `Award to ${v.name}`, description: 'Pass-through: we pay the vendor and bill the client (markup possible). Direct: the client contracts and pays the vendor.', fields: [{ name: 'model', label: 'Financial model', type: 'select', options: [{ value: 'pass_through', label: 'Pass-through' }, { value: 'direct', label: 'Direct contract' }], defaultValue: 'pass_through' }, { name: 'sellPrice', label: `Sell price to client (${ev.currency})`, type: 'number', defaultValue: Math.round(resp.amount * 1.15), hint: 'Ignored for direct contracts' }] }); a && act('RFQ_AWARD', { eventId: ev.id, rfqId: r.id, vendorId: vid, model: a.model, sellPrice: a.model === 'direct' ? resp.amount : a.sellPrice }); }}>Award</Button>}
                  {r.awardedVendorId === vid && <Badge tone="ok">awarded</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewRfq({ ev, onClose }) {
  const { state, act } = useStore();
  const [v, , bind] = useForm({ category: 'Photo/Video', description: '', dueDate: '' });
  const [ids, setIds] = useState([]);
  return (
    <Modal title="Request for quote" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ids.length || !v.description} onClick={() => { act('RFQ_CREATE', { eventId: ev.id, ...v, vendorIds: ids }); onClose(); }}>Send RFQ</Button></>}>
      <div className="grid g2">
        <Field label="Category"><select {...bind('category')}>{BUDGET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Response due"><input type="date" {...bind('dueDate')} /></Field>
      </div>
      <Field label="Scope" style={{ marginTop: 10 }}><textarea {...bind('description')} /></Field>
      <h4 className="mt">Vendors</h4>
      <PillSelect multi options={state.vendors.map((x) => ({ id: x.id, label: `${x.name} (${x.category})` }))} value={ids} onChange={setIds} />
    </Modal>
  );
}

function AddBooking({ ev, onClose }) {
  const { state, act, today } = useStore();
  const [v, , bind] = useForm({ vendorId: state.vendors[0].id, category: 'Catering', service: '', cost: '', sellPrice: '', model: 'pass_through', loadIn: `${ev.date}T10:00`, loadOut: `${ev.date}T23:00`, minGuarantee: '', contractedGuests: '' });
  const vendor = state.vendors.find((x) => x.id === v.vendorId);
  const issues = vendorCompliance(vendor, today);
  return (
    <Modal title="Book vendor" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.service} onClick={() => { act('BOOKING_ADD', { eventId: ev.id, data: { ...v, minGuarantee: Number(v.minGuarantee) || null, contractedGuests: Number(v.contractedGuests) || null } }); onClose(); }}>Create booking</Button></>}>
      <div className="grid g2">
        <Field label="Vendor"><select {...bind('vendorId')}>{state.vendors.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.category}</option>)}</select></Field>
        <Field label="Budget category"><select {...bind('category')}>{BUDGET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Service"><input {...bind('service')} /></Field>
        <Field label="Financial model"><select {...bind('model')}><option value="pass_through">Pass-through</option><option value="direct">Direct contract</option></select></Field>
        <Field label="Cost to EO"><input type="number" {...bind('cost')} /></Field>
        <Field label="Sell price to client"><input type="number" {...bind('sellPrice')} /></Field>
        <Field label="Load-in"><input type="datetime-local" {...bind('loadIn')} /></Field>
        <Field label="Load-out"><input type="datetime-local" {...bind('loadOut')} /></Field>
        <Field label="Min. guarantee (guests)"><input type="number" {...bind('minGuarantee')} /></Field>
        <Field label="Contracted guests"><input type="number" {...bind('contractedGuests')} /></Field>
      </div>
      {issues.map((i) => <Alert key={i.text} tone={i.level}>Compliance: {i.text}</Alert>)}
    </Modal>
  );
}
