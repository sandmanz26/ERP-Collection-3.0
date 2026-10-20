import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Modal, Field, Alert, Empty } from '../../components/ui.jsx';
import { fmtDate, fmtDateTime, addDays } from '../../lib/dates.js';
import { decorSnapshot } from '../../lib/decorApi.js';
import { BUDGET_CATEGORIES } from '../../data/config.js';

export function CoCard({ ev, co, portal }) {
  const { state, act, user } = useStore();
  const [name, setName] = useState('');
  const db = decorSnapshot();
  const sched = ev.paymentSchedule.find((p) => p.coId === co.id);
  const cur = ev.currency;
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row between">
        <div><b>{co.number} · {co.title}</b> <StatusBadge status={co.status} /> {co.isException && <Badge tone="danger">EXCEPTION — after headcount deadline</Badge>} {co.status === 'approved' && !co.invoiced && <Badge tone="warn">not yet invoiced</Badge>}</div>
        <b><Money value={co.costImpact + (co.taxImpact || 0)} currency={cur} /></b>
      </div>
      <div className="muted mt">{co.description}</div>
      <table className="t mt">
        <thead><tr><th>Line</th><th>Category</th><th className="num">Price</th>{!portal && <th className="num">Cost</th>}</tr></thead>
        <tbody>
          {co.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{l.category}</td><td className="num"><Money value={l.amount} currency={cur} /></td>{!portal && <td className="num"><Money value={l.cost} currency={cur} /></td>}</tr>)}
          <tr><td colSpan={2}>Tax</td><td className="num"><Money value={co.taxImpact || 0} currency={cur} /></td>{!portal && <td />}</tr>
        </tbody>
      </table>
      <div className="grid g3 mt" style={{ fontSize: 12.5 }}>
        <div><b>Vendor impact</b><div className="muted">{co.vendorImpact || '—'}</div></div>
        <div><b>Decor impact</b><div className="muted">{co.decorImpact.length ? co.decorImpact.map((d) => `${d.qty > 0 ? '+' : ''}${d.qty} × ${db.items.find((i) => i.id === d.itemId)?.name}`).join(', ') : '—'}</div></div>
        <div><b>Timeline impact</b><div className="muted">{co.timelineImpact || '—'}{co.guestCountDelta ? ` · guests ${co.guestCountDelta > 0 ? '+' : ''}${co.guestCountDelta}` : ''}</div></div>
      </div>
      {co.specialApproval && <div className="faint mt" style={{ fontSize: 12 }}>Exception approved internally by {co.specialApproval.name} · {fmtDateTime(co.specialApproval.at)} · {co.specialApproval.note}</div>}
      {co.approvals.map((a, i) => <div key={i} className="faint" style={{ fontSize: 12 }}>✔ Client approval: “{a.name}” via {a.method} · {fmtDateTime(a.at)} · IP {a.ip}</div>)}
      {sched && <div className="faint" style={{ fontSize: 12 }}>Payment schedule: {sched.label} due {fmtDate(sched.dueDate)} — {sched.status}</div>}
      <div className="row mt">
        {!portal && co.status === 'draft' && <button className="btn primary" onClick={() => act('CO_SEND', { eventId: ev.id, coId: co.id })}>Send to client</button>}
        {!portal && co.isException && !co.specialApproval && co.status !== 'rejected' && ['admin', 'planner'].includes(user.role) && <button className="btn" onClick={() => act('CO_SPECIAL_APPROVE', { eventId: ev.id, coId: co.id, note: prompt('Exception note', 'Vendor capacity confirmed') || '' })}>Grant exception approval</button>}
        {co.status === 'sent' && (
          <>
            <input placeholder="Type full name to sign" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn ok" onClick={() => act('CO_APPROVE', { eventId: ev.id, coId: co.id, method: name ? 'signature' : 'click', typedName: name || undefined })}>{portal ? 'Approve' : 'Record client approval'}</button>
            <button className="btn danger" onClick={() => act('CO_REJECT', { eventId: ev.id, coId: co.id, reason: prompt('Reason?') || '' })}>Reject</button>
          </>
        )}
        {!portal && sched && sched.status === 'scheduled' && ['admin', 'finance', 'planner'].includes(user.role) && <button className="btn" onClick={() => act('INVOICE_FROM_SCHEDULE', { eventId: ev.id, itemId: sched.id })}>Invoice now</button>}
      </div>
    </div>
  );
}

export default function ChangeOrdersTab({ ev }) {
  const [add, setAdd] = useState(false);
  if (!ev.contract?.immutable) return <Card><Empty>Change Orders become available after the contract is signed. Before that, revise the proposal instead.</Empty></Card>;
  const approved = ev.changeOrders.filter((c) => c.status === 'approved');
  return (
    <div>
      <Card title="Change Orders" actions={<button className="btn primary" onClick={() => setAdd(true)}>+ Change Order</button>}>
        <Alert tone="info">Every post-contract change must be a Change Order. Once the client approves (portal signature/click with audit trail), the contract total, payment schedule, budget and the Decor Inventory request update automatically. Original contract <Money value={ev.contract.originalTotal} currency={ev.currency} /> → current <Money value={ev.contract.total} currency={ev.currency} /> ({approved.length} approved).</Alert>
        <div className="stack mt">{ev.changeOrders.slice().reverse().map((co) => <CoCard key={co.id} ev={ev} co={co} />)}</div>
      </Card>
      {add && <NewCo ev={ev} onClose={() => setAdd(false)} />}
    </div>
  );
}

function NewCo({ ev, onClose }) {
  const { state, act, today } = useStore();
  const db = decorSnapshot();
  const [v, setV] = useState({ title: '', description: '', vendorImpact: '', timelineImpact: '', guestCountDelta: 0 });
  const [lines, setLines] = useState([{ name: '', category: 'Catering', amount: 0, cost: 0 }]);
  const [decor, setDecor] = useState([]);
  const deadline = addDays(ev.date, -state.settings.finalHeadcountDays);
  const isException = Number(v.guestCountDelta) !== 0 && today > deadline;
  const submit = () => {
    act('CO_CREATE', { eventId: ev.id, data: { ...v, guestCountDelta: Number(v.guestCountDelta), lines: lines.filter((l) => l.name), decorImpact: decor.filter((d) => d.itemId && d.qty).map((d) => ({ itemId: d.itemId, qty: Number(d.qty) })) } });
    onClose();
  };
  return (
    <Modal wide title="New Change Order" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.title || !lines.some((l) => l.name)} onClick={submit}>Create draft</button></>}>
      <div className="grid g2">
        <Field label="Title"><input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Guest count change (±)"><input type="number" value={v.guestCountDelta} onChange={(e) => setV({ ...v, guestCountDelta: e.target.value })} /></Field>
      </div>
      {isException && <Alert tone="danger">Final headcount deadline ({fmtDate(deadline)}) has passed. This CO will be flagged as an EXCEPTION and needs internal special approval before the client can approve.</Alert>}
      <Field label="Description" style={{ marginTop: 10 }}><textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <h4 className="mt">Cost impact lines (negative amount = reduction → credit note)</h4>
      {lines.map((l, i) => (
        <div className="row mb" key={i}>
          <input placeholder="Item" value={l.name} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <select value={l.category} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>{BUDGET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" placeholder="Price" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <input type="number" placeholder="Cost" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn sm" onClick={() => setLines([...lines, { name: '', category: 'Other', amount: 0, cost: 0 }])}>+ line</button>
      <h4 className="mt">Decor impact (sent to Decor Inventory on approval)</h4>
      {decor.map((d, i) => (
        <div className="row mb" key={i}>
          <select value={d.itemId} onChange={(e) => setDecor(decor.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}><option value="">Item…</option>{db.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select>
          <input type="number" value={d.qty} onChange={(e) => setDecor(decor.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn sm" onClick={() => setDecor([...decor, { itemId: '', qty: 1 }])}>+ decor item</button>
      <div className="grid g2 mt">
        <Field label="Vendor impact"><input value={v.vendorImpact} onChange={(e) => setV({ ...v, vendorImpact: e.target.value })} /></Field>
        <Field label="Timeline impact"><input value={v.timelineImpact} onChange={(e) => setV({ ...v, timelineImpact: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
