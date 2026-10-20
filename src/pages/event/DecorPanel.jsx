import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Money, Alert, StatusBadge, Button, Icon } from '../../design-system/index.js';
import * as decorApi from '../../lib/decorApi.js';
import { fmtDateTime } from '../../lib/dates.js';

/** Decor requirements for the event, synced to the external Decor Inventory System via its API. */
export default function DecorPanel({ ev }) {
  const { act } = useStore();
  const [items, setItems] = useState([]);
  const [avail, setAvail] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(ev.decorRequests);
  useEffect(() => setDraft(ev.decorRequests), [ev.decorRequests]);
  useEffect(() => {
    decorApi.listItems().then(setItems);
    decorApi.getReservations(ev.id).then((r) => setRes(r.find((x) => x.status !== 'cancelled') ?? null));
  }, [ev.id, ev.decorReservationId, ev.decorRequests]);
  useEffect(() => {
    if (!ev.date) return;
    Promise.all(draft.map((d) => decorApi.checkAvailability(d.itemId, ev.date))).then((list) => setAvail(Object.fromEntries(list.map((a) => [a.itemId, a]))));
  }, [draft, ev.date]);
  const reservedFor = (itemId) => res?.items.find((i) => i.itemId === itemId)?.qty || 0;
  const sync = async () => {
    setBusy(true);
    act('DECOR_REQUEST_SET', { eventId: ev.id, items: draft });
    try {
      await decorApi.cancelReservation(ev.id);
      const r = await decorApi.reserve({ eventId: ev.id, eventName: ev.name, date: ev.date, items: draft.filter((d) => d.qty > 0) });
      act('DECOR_SYNCED', { eventId: ev.id, reservationId: r.id, ok: true });
    } catch (e) {
      act('DECOR_SYNCED', { eventId: ev.id, ok: false, message: e.message });
    }
    setBusy(false);
  };
  const cost = draft.reduce((a, d) => a + (items.find((i) => i.id === d.itemId)?.unitCost || 0) * d.qty, 0);
  return (
    <Card title="Decor & equipment (Decor Inventory System)" actions={<Button variant="primary" disabled={busy || !ev.date} onClick={sync}>{busy ? 'Syncing…' : 'Save & reserve via API'}</Button>}>
      {ev.decorSyncError && <Alert tone="danger">Last API call failed: {ev.decorSyncError}</Alert>}
      <div className="faint mb" style={{ fontSize: 12 }}>Reservation: {res ? <>{res.id} <StatusBadge status={res.status} /> · created {fmtDateTime(res.createdAt)}</> : 'none'}</div>
      <table className="t">
        <thead><tr><th>Item</th><th>SKU</th><th className="num">Qty requested</th><th className="num">Reserved</th><th className="num">Available on date*</th><th className="num">Internal cost</th><th /></tr></thead>
        <tbody>
          {draft.map((d, i) => {
            const it = items.find((x) => x.id === d.itemId);
            const a = avail[d.itemId];
            const freeForUs = a ? a.available + reservedFor(d.itemId) : null;
            return (
              <tr key={d.itemId}>
                <td><span className="swatch" style={{ background: it?.swatch, width: 14, height: 14, verticalAlign: 'middle' }} /> {it?.name}</td>
                <td className="faint">{it?.sku}</td>
                <td className="num"><input className="inline" type="number" value={d.qty} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} /></td>
                <td className="num">{reservedFor(d.itemId)}</td>
                <td className="num">{freeForUs ?? '…'} {freeForUs !== null && d.qty > freeForUs && <Badge tone="danger">short</Badge>}</td>
                <td className="num"><Money value={(it?.unitCost || 0) * d.qty} currency={ev.currency} /></td>
                <td><Button variant="ghost" size="sm" onClick={() => setDraft(draft.filter((_, j) => j !== i))}><Icon name="x" size={14} /></Button></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td colSpan={5}>Decor cost → event costing</td><td className="num"><Money value={cost} currency={ev.currency} /></td><td /></tr></tfoot>
      </table>
      <div className="row mt">
        <select onChange={(e) => { if (e.target.value) setDraft([...draft, { itemId: e.target.value, qty: 1 }]); e.target.value = ''; }}>
          <option value="">+ Add item from inventory…</option>
          {items.filter((i) => !draft.some((d) => d.itemId === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}
        </select>
        <span className="faint" style={{ fontSize: 12 }}>*including what is already reserved for this event</span>
      </div>
    </Card>
  );
}
