import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Money, Alert, KeyValue, StatTile, Button } from '../../design-system/index.js';
import { closingChecklist, eventFinancials, eventContext } from '../../lib/derived.js';
import { transitionBlockers, stageIndex } from '../../lib/lifecycle.js';
import * as decorApi from '../../lib/decorApi.js';
import { fmtDateTime } from '../../lib/dates.js';

export default function PostEventTab({ ev }) {
  const { state, act, today } = useStore();
  const [busy, setBusy] = useState(false);
  const checklist = closingChecklist(state, ev, today);
  const f = eventFinancials(state, ev);
  const cur = ev.currency;
  const blockers = transitionBlockers(ev, 'financial_close', eventContext(state, ev, today));
  const happened = ev.date && ev.date <= today;
  const pullReturn = async () => {
    setBusy(true);
    try {
      const res = await decorApi.markReturned(ev.id);
      act('DECOR_RETURN_RECORDED', { eventId: ev.id, report: res.returnReport });
    } catch (e) {
      act('DECOR_SYNCED', { eventId: ev.id, ok: false, message: e.message });
    }
    setBusy(false);
  };
  return (
    <div>
      {!happened && <Alert tone="info">The event hasn't happened yet — this tab becomes the close-out workspace after the event date.</Alert>}
      <div className="grid g2 mt">
        <Card title="Close-out checklist" actions={ev.stage === 'post_event' && <Button variant="primary" disabled={blockers.length > 0} onClick={() => act('STAGE_CHANGE', { eventId: ev.id, to: 'financial_close' })}>Financial close</Button>}>
          {checklist.map((c) => <div key={c.key} className="row" style={{ padding: '5px 0' }}><span style={{ color: c.done ? 'var(--ok)' : 'var(--ink-3)', fontSize: 16 }}>{c.done ? '☑' : '☐'}</span>{c.label}</div>)}
          <div className="row mt">
            <label className="row"><input type="checkbox" checked={!!ev.closing.venueDepositReturned} onChange={(e) => act('CLOSING_UPDATE', { eventId: ev.id, patch: { venueDepositReturned: e.target.checked } })} />Venue security deposit returned</label>
          </div>
          {ev.stage === 'financial_close' && <Button className="mt" onClick={() => act('STAGE_CHANGE', { eventId: ev.id, to: 'archived' })}>Archive event</Button>}
        </Card>
        <Card title="Final profitability">
          <KeyValue rows={[
            ['Revenue (excl. tax)', <Money value={f.revenueNet} currency={cur} />],
            ['+ Commissions from vendors', <Money value={f.commissions} currency={cur} />],
            ['+ Damage / late fees billed', <Money value={f.damageCharges + f.lateFees} currency={cur} />],
            ['− Vendor costs', <Money value={-f.vendorCost} currency={cur} />],
            ['− Decor costs', <Money value={-f.decorCost} currency={cur} />],
            ['− Crew costs', <Money value={-f.crewCost} currency={cur} />],
            ['− Change order costs', <Money value={-f.coCost} currency={cur} />],
            ['= Profit', <b><Money value={f.profit} currency={cur} /> ({f.marginPct}%)</b>],
          ]} />
        </Card>
      </div>
      <div className="grid g2 mt">
        <Card title="Decor return & damage (Decor Inventory)" actions={!ev.decorReturn && ev.decorRequests.length > 0 && <Button variant="primary" disabled={busy || !happened} onClick={pullReturn}>{busy ? 'Calling API…' : 'Pull return report'}</Button>}>
          {!ev.decorRequests.length && <div className="faint">No decor used.</div>}
          {ev.decorReturn && (
            <>
              <div className="faint" style={{ fontSize: 12 }}>Checked {fmtDateTime(ev.decorReturn.checkedAt)}</div>
              <table className="t mt">
                <thead><tr><th>Item</th><th className="num">Out</th><th className="num">Returned</th><th className="num">Damaged</th><th className="num">Lost</th><th className="num">Charge</th></tr></thead>
                <tbody>{ev.decorReturn.items.map((r) => <tr key={r.itemId}><td>{r.name}</td><td className="num">{r.qtyOut}</td><td className="num">{r.qtyReturned}</td><td className="num">{r.damaged}</td><td className="num">{r.lost}</td><td className="num"><Money value={r.charge} currency={cur} /></td></tr>)}</tbody>
                <tfoot><tr><td colSpan={5}>Total charge</td><td className="num"><Money value={ev.decorReturn.totalCharge} currency={cur} /></td></tr></tfoot>
              </table>
              {ev.decorReturn.totalCharge > 0 && !ev.closing.damageBilled && (
                <div className="row mt"><span className="muted">Bill per contract to:</span><Button onClick={() => act('DAMAGE_BILL', { eventId: ev.id, billTo: 'client' })}>Client</Button><Button onClick={() => act('DAMAGE_BILL', { eventId: ev.id, billTo: 'venue' })}>Venue</Button></div>
              )}
              {ev.closing.damageBilled && <Badge tone="ok">billed</Badge>}
            </>
          )}
          {ev.incidents.length > 0 && <><h4 className="mt">Incidents on the day</h4>{ev.incidents.map((i) => <div key={i.id} className="alert warning"><div><b>{i.type}</b> ({i.severity}) — {i.description}<div className="faint">{fmtDateTime(i.at)}</div>{i.photo && <img src={i.photo} alt="incident" style={{ maxWidth: 160, marginTop: 6, borderRadius: 6 }} />}</div></div>)}</>}
        </Card>
        <Card title="Client feedback">
          <div className="row">
            <Button disabled={ev.closing.surveySent} onClick={() => act('CLOSING_UPDATE', { eventId: ev.id, patch: { surveySent: true } })}>{ev.closing.surveySent ? 'Survey sent ✓' : 'Send satisfaction survey'}</Button>
            <Button disabled={ev.closing.reviewRequested} onClick={() => act('CLOSING_UPDATE', { eventId: ev.id, patch: { reviewRequested: true } })}>{ev.closing.reviewRequested ? 'Review requested ✓' : 'Request review (Google / The Knot)'}</Button>
          </div>
          {ev.closing.survey ? <Alert tone="success">★ {ev.closing.survey.rating}/5 — “{ev.closing.survey.comment}”</Alert> : <div className="faint mt">No survey response yet (client answers in the portal).</div>}
          <h4 className="mt2">Internal vendor ratings</h4>
          <VendorRatings ev={ev} />
        </Card>
      </div>
    </div>
  );
}

function VendorRatings({ ev }) {
  const { state, act } = useStore();
  const [r, setR] = useState({});
  return (
    <div>
      {ev.vendorBookings.map((b) => {
        const v = state.vendors.find((x) => x.id === b.vendorId);
        const existing = v.performance.find((p) => p.eventId === ev.id);
        const cur = r[v.id] ?? { onTime: existing?.onTime ?? 5, quality: existing?.quality ?? 5, notes: existing?.notes ?? '' };
        return (
          <div key={b.id} className="row mb">
            <span style={{ width: 160 }}>{v.name}</span>
            <label className="row">On-time <select value={cur.onTime} onChange={(e) => setR({ ...r, [v.id]: { ...cur, onTime: e.target.value } })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="row">Quality <select value={cur.quality} onChange={(e) => setR({ ...r, [v.id]: { ...cur, quality: e.target.value } })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <input placeholder="Notes" value={cur.notes} onChange={(e) => setR({ ...r, [v.id]: { ...cur, notes: e.target.value } })} />
            <Button size="sm" onClick={() => act('VENDOR_RATE', { vendorId: v.id, eventId: ev.id, ...cur })}>{existing ? 'Update' : 'Rate'}</Button>
          </div>
        );
      })}
      {ev.vendorBookings.length > 0 && <Button size="sm" onClick={() => act('CLOSING_UPDATE', { eventId: ev.id, patch: { vendorRatingsDone: true } })}>Mark ratings complete</Button>}
    </div>
  );
}
