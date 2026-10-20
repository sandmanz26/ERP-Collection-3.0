import React from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Money, Alert, Badge, CommitInput, Stat, PillSelect } from '../../components/ui.jsx';
import { budgetByCategory, eventFinancials, proposalTotals, headcount, payerSummary } from '../../lib/derived.js';
import { round2, sum } from '../../lib/money.js';
import { BUDGET_CATEGORIES } from '../../data/config.js';

export default function BudgetTab({ ev, et }) {
  const { state, act, today, user } = useStore();
  const rows = budgetByCategory(state, ev);
  const f = eventFinancials(state, ev);
  const t = proposalTotals(state, ev);
  const hc = headcount(ev);
  const cur = ev.currency;
  const internal = user.role !== 'client';
  const live = ev.finalHeadcount ?? (ev.households.length ? hc.confirmed + hc.pending : null);
  const perGuest = (t?.lines ?? []).filter((l) => l.active && l.pricing === 'per_guest');
  const payers = payerSummary(ev, today);
  const tot = (k) => round2(rows.reduce((a, r) => a + r[k], 0));

  return (
    <div>
      <div className="grid g5">
        <Stat label="Revenue (excl. tax)" value={<Money value={f.revenueNet} currency={cur} />} />
        <Stat label="Vendor cost (pass-through)" value={<Money value={f.vendorCost} currency={cur} />} />
        <Stat label="Decor cost (Decor Inventory)" value={<Money value={f.decorCost} currency={cur} />} />
        <Stat label="Crew cost (from schedule)" value={<Money value={f.crewCost} currency={cur} />} />
        <Stat label="Profit / margin" value={<Money value={f.profit} currency={cur} />} sub={`${f.marginPct}%`} tone={f.profit < 0 ? 'danger' : 'ok'} />
      </div>
      {rows.filter((r) => r.overCost).map((r) => <Alert key={r.category} tone="warning">Variance: {r.category} actual cost <Money value={r.actualCost} currency={cur} /> exceeds estimate <Money value={r.estCost} currency={cur} /> by <Money value={r.variance} currency={cur} />.</Alert>)}
      {rows.filter((r) => r.overBudget).map((r) => <Alert key={`b${r.category}`} tone="info">{r.category}: client budget <Money value={r.clientBudget} currency={cur} /> exceeded by price <Money value={r.sell} currency={cur} />.</Alert>)}
      <Card title="Budget by category — client budget vs. price vs. internal cost" className="mt">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Category</th><th className="num">Client budget</th><th className="num">Price to client</th><th className="num">Δ vs budget</th>{internal && <><th className="num">Est. cost</th><th className="num">Actual cost</th><th className="num">Variance</th><th className="num">Margin</th></>}<th>Paid by</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category}>
                  <td>{r.category}</td>
                  <td className="num"><CommitInput className="inline" type="number" value={r.clientBudget} onCommit={(n) => act('CLIENT_BUDGET_SET', { eventId: ev.id, category: r.category, amount: n })} /></td>
                  <td className="num"><Money value={r.sell} currency={cur} /></td>
                  <td className="num" style={{ color: r.clientBudget && r.sell > r.clientBudget ? 'var(--danger)' : 'var(--ok)' }}>{r.clientBudget ? <Money value={round2(r.clientBudget - r.sell)} currency={cur} /> : '—'}</td>
                  {internal && <>
                    <td className="num"><Money value={r.estCost} currency={cur} /></td>
                    <td className="num"><Money value={r.actualCost} currency={cur} /></td>
                    <td className="num" style={{ color: r.variance > 0 ? 'var(--danger)' : undefined }}><Money value={r.variance} currency={cur} /></td>
                    <td className="num"><Money value={r.margin} currency={cur} /></td>
                  </>}
                  <td>{ev.payers.filter((p) => p.categories.includes(r.category)).map((p) => <Badge key={p.id}>{p.name}</Badge>)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num"><Money value={tot('clientBudget')} currency={cur} /></td><td className="num"><Money value={tot('sell')} currency={cur} /></td><td />{internal && <><td className="num"><Money value={tot('estCost')} currency={cur} /></td><td className="num"><Money value={tot('actualCost')} currency={cur} /></td><td className="num"><Money value={tot('variance')} currency={cur} /></td><td className="num"><Money value={tot('margin')} currency={cur} /></td></>}<td /></tr></tfoot>
          </table>
        </div>
        <div className="faint mt" style={{ fontSize: 12 }}>Sources: proposal line items (price & estimated cost), approved change orders, vendor bookings, Decor Inventory reservations (rental cost), crew shifts (incl. overtime rules).</div>
      </Card>

      <div className="grid g2 mt">
        <Card title="Live headcount → per-guest lines">
          {!live ? <div className="faint">No RSVP data yet.</div> : (
            <>
              <div className="muted mb">Contracted guests: <b>{t?.lines ? (ev.proposals.find((p) => p.status === 'accepted') ?? ev.proposals[0])?.guestCount : '—'}</b> · projected ({ev.finalHeadcount ? 'final' : 'confirmed + pending'}): <b>{live}</b></div>
              <table className="t">
                <thead><tr><th>Line</th><th className="num">Contracted</th><th className="num">Projected</th><th className="num">Δ</th></tr></thead>
                <tbody>
                  {perGuest.map((l) => {
                    const proj = round2(live * l.unitPrice);
                    return <tr key={l.id}><td>{l.name}</td><td className="num"><Money value={l.amount} currency={cur} /></td><td className="num"><Money value={proj} currency={cur} /></td><td className="num" style={{ color: proj > l.amount ? 'var(--danger)' : 'var(--ok)' }}><Money value={round2(proj - l.amount)} currency={cur} /></td></tr>;
                  })}
                </tbody>
              </table>
              {perGuest.length > 0 && live > (ev.proposals.find((p) => p.status === 'accepted')?.guestCount ?? Infinity) && <Alert tone="warning">Headcount above contract — raise a Change Order so the increase is billed.</Alert>}
            </>
          )}
        </Card>
        <Card title="Who pays what (multiple payers)">
          {!et.features.multiplePayers && <div className="faint mb" style={{ fontSize: 12 }}>Single-payer event type (multiple payers can still be added).</div>}
          {ev.payers.map((p) => (
            <div key={p.id} className="card" style={{ padding: 10 }}>
              <div className="row between"><b>{p.name}</b><span className="faint">{state.users.find((u) => u.id === p.userId)?.email}</span></div>
              <PillSelect multi options={BUDGET_CATEGORIES} value={p.categories} onChange={(cats) => act('PAYER_UPDATE', { eventId: ev.id, payers: ev.payers.map((x) => (x.id === p.id ? { ...x, categories: cats } : x)) })} />
            </div>
          ))}
          <button className="btn sm mt" onClick={() => { const n = prompt('Payer name'); n && act('PAYER_UPDATE', { eventId: ev.id, payers: [...ev.payers, { id: `py_${Date.now()}`, name: n, userId: null, categories: [] }] }); }}>+ Payer</button>
          <table className="t mt">
            <thead><tr><th>Payer</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{payers.map((p) => <tr key={p.id}><td>{p.name} {p.overdue > 0 && <Badge tone="danger">{p.overdue} overdue</Badge>}</td><td className="num"><Money value={p.billed} currency={cur} /></td><td className="num"><Money value={p.paid} currency={cur} /></td><td className="num"><Money value={p.outstanding} currency={cur} /></td></tr>)}</tbody>
          </table>
          <div className="faint" style={{ fontSize: 12 }}>Total payments: <Money value={sum(ev.payments, (x) => x.amount)} currency={cur} /></div>
        </Card>
      </div>
    </div>
  );
}
