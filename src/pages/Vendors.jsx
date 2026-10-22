import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, Modal, Field, useForm, PillSelect, Money, Button, Icon } from '../design-system/index.js';
import { vendorCompliance, vendorScore } from '../lib/derived.js';
import { fmtDate } from '../lib/dates.js';

export default function Vendors() {
  const { state, act, today } = useStore();
  const [cat, setCat] = useState('All');
  const [sel, setSel] = useState(null);
  const [add, setAdd] = useState(false);
  const cats = ['All', ...new Set(state.vendors.map((v) => v.category))];
  const list = state.vendors.filter((v) => cat === 'All' || v.category === cat);
  const bookings = (vid) => state.events.flatMap((e) => e.vendorBookings.filter((b) => b.vendorId === vid).map((b) => ({ b, e })));
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Vendor directory</h1><div className="muted">Categories, regions, price range, internal rating, compliance documents (COI, licenses, W-9) with expiry reminders.</div></div>
        <Button variant="primary" onClick={() => setAdd(true)}>+ Vendor</Button>
      </div>
      <PillSelect options={cats} value={cat} onChange={setCat} />
      <Card className="mt">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vendor</th><th>Category</th><th>Regions</th><th>Price</th><th>Rating</th><th>COI expiry</th><th>Licenses</th><th>W-9</th><th>Commission</th><th>Compliance</th><th className="num">Bookings</th></tr></thead>
            <tbody>
              {list.map((v) => {
                const issues = vendorCompliance(v, today);
                return (
                  <tr key={v.id} onClick={() => setSel(v)} style={{ cursor: 'pointer' }}>
                    <td><b>{v.name}</b><div className="faint">{v.contact} · {v.email}</div></td>
                    <td>{v.category}</td><td style={{ fontSize: 12 }}>{v.regions.join(', ')}</td><td>{v.priceRange}</td>
                    <td><Icon name="star" size={12} /> {vendorScore(v)}<div className="faint">{v.performance.length} reviews</div></td>
                    <td className="nowrap">{fmtDate(v.coiExpiry)}</td>
                    <td style={{ fontSize: 12 }}>{v.licenses.map((l) => <div key={l.name}>{l.name} — {fmtDate(l.expiry)}</div>)}</td>
                    <td>{v.country === 'US' ? (v.w9 ? <Badge tone="ok">on file</Badge> : <Badge tone="warn">missing</Badge>) : <span className="faint">n/a</span>}</td>
                    <td>{v.commissionPct ? `${v.commissionPct}%` : '—'}</td>
                    <td>{issues.length ? issues.map((i) => <div key={i.text}><Badge tone={i.level}>{i.text}</Badge></div>) : <Badge tone="ok">compliant</Badge>}</td>
                    <td className="num">{bookings(v.id).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {sel && <VendorModal v={state.vendors.find((x) => x.id === sel.id)} bookings={bookings(sel.id)} onClose={() => setSel(null)} />}
      {add && <AddVendor onClose={() => setAdd(false)} />}
    </div>
  );
}

function VendorModal({ v, bookings, onClose }) {
  const { state, act } = useStore();
  return (
    <Modal wide title={v.name} onClose={onClose}>
      <div className="grid g2">
        <div>
          <h4>Compliance</h4>
          <div className="row mb">COI expires <input type="date" defaultValue={v.coiExpiry} onBlur={(e) => e.target.value !== v.coiExpiry && act('VENDOR_UPDATE', { vendorId: v.id, patch: { coiExpiry: e.target.value } })} /></div>
          {v.country === 'US' && <label className="row"><input type="checkbox" checked={v.w9} onChange={(e) => act('VENDOR_UPDATE', { vendorId: v.id, patch: { w9: e.target.checked } })} />W-9 on file</label>}
          <h4 className="mt">Internal rating</h4>
          <div className="row"><input type="number" step="0.1" min="1" max="5" defaultValue={v.rating} onBlur={(e) => Number(e.target.value) !== v.rating && act('VENDOR_UPDATE', { vendorId: v.id, patch: { rating: Number(e.target.value) } })} /> / 5</div>
          <h4 className="mt">Notes</h4>
          <textarea defaultValue={v.notes} onBlur={(e) => e.target.value !== v.notes && act('VENDOR_UPDATE', { vendorId: v.id, patch: { notes: e.target.value } })} />
        </div>
        <div>
          <h4>Performance history</h4>
          {v.performance.length === 0 && <div className="faint">No post-event ratings yet.</div>}
          {v.performance.map((p) => <div key={p.eventId}>{state.events.find((e) => e.id === p.eventId)?.name}: on-time {p.onTime}/5, quality {p.quality}/5 <span className="faint">{p.notes}</span></div>)}
          <h4 className="mt">Bookings</h4>
          {bookings.map(({ b, e }) => <div key={b.id}>{e.name} · {b.service} · <Money value={b.cost} currency={e.currency} /> · {b.status}</div>)}
        </div>
      </div>
    </Modal>
  );
}

function AddVendor({ onClose }) {
  const { act } = useStore();
  const [v, , bind] = useForm({ name: '', category: 'Catering', regions: '', priceRange: '$$', contact: '', email: '', phone: '', country: 'US', coiExpiry: '', commissionPct: 0, w9: false });
  return (
    <Modal title="Add vendor" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.name} onClick={() => { act('VENDOR_CREATE', { data: { ...v, regions: v.regions.split(',').map((x) => x.trim()).filter(Boolean), commissionPct: Number(v.commissionPct) } }); onClose(); }}>Add</Button></>}>
      <div className="grid g2">
        <Field label="Name"><input {...bind('name')} /></Field>
        <Field label="Category"><select {...bind('category')}>{['Catering', 'Florist', 'Photographer', 'Band/DJ', 'AV', 'Transportation', 'Venue', 'Bartending', 'Rentals', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Regions (comma separated)"><input {...bind('regions')} /></Field>
        <Field label="Price range"><select {...bind('priceRange')}>{['$', '$$', '$$$', '$$$$'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Contact"><input {...bind('contact')} /></Field>
        <Field label="Email"><input {...bind('email')} /></Field>
        <Field label="Phone"><input {...bind('phone')} /></Field>
        <Field label="Country"><input {...bind('country')} /></Field>
        <Field label="COI expiry"><input type="date" {...bind('coiExpiry')} /></Field>
        <Field label="Commission / referral %"><input type="number" {...bind('commissionPct')} /></Field>
        <label className="row"><input type="checkbox" {...bind('w9', 'checkbox')} />W-9 received (US)</label>
      </div>
    </Modal>
  );
}
