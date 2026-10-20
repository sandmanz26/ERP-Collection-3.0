import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Tabs, BarChart, Money, Badge, download } from '../components/ui.jsx';
import { eventFinancials, leakage, toUSD, proposalTotals, vendorScore, vendorCompliance } from '../lib/derived.js';
import { fmtMoney, round2 } from '../lib/money.js';
import { stageIndex, isBookedOrLater } from '../lib/lifecycle.js';
import { monthKey, fmtDate, addDays } from '../lib/dates.js';
import { shiftHours } from '../lib/staff.js';

const isWon = (e) => isBookedOrLater(e.stage) || e.stage === 'cancelled_client' || e.stage === 'cancelled_eo';

export default function Reports() {
  const { state, today, act } = useStore();
  const [tab, setTab] = useState('pipeline');
  const usd = (n, c) => toUSD(state, n, c);
  const evs = state.events;

  // 1. pipeline & conversion by source
  const bySource = state.settings.leadSources.map((s) => {
    const list = evs.filter((e) => e.source === s);
    const won = list.filter(isWon);
    const lost = list.filter((e) => e.stage === 'lost');
    const open = list.length - won.length - lost.length;
    const wonValue = won.reduce((a, e) => a + usd(e.contract?.total ?? 0, e.currency), 0);
    return { s, n: list.length, won: won.length, lost: lost.length, open, conv: won.length + lost.length ? round2((won.length / (won.length + lost.length)) * 100) : 0, wonValue };
  }).filter((r) => r.n);

  // 2. contracted revenue per event month + cash to come
  const byMonth = {};
  evs.filter((e) => e.contract?.immutable && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).forEach((e) => {
    const m = monthKey(e.date);
    byMonth[m] ??= { contracted: 0, paid: 0, events: 0 };
    byMonth[m].contracted += usd(e.contract.total, e.currency);
    byMonth[m].paid += usd(eventFinancials(state, e).paid, e.currency);
    byMonth[m].events += 1;
  });
  const months = Object.keys(byMonth).sort();

  // 3. profitability
  const prof = evs.filter((e) => e.contract?.immutable && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).map((e) => ({ e, f: eventFinancials(state, e) }));
  const group = (keyFn) => {
    const g = {};
    prof.forEach(({ e, f }) => { const k = keyFn(e); g[k] ??= { rev: 0, profit: 0, n: 0 }; g[k].rev += usd(f.revenueNet, e.currency); g[k].profit += usd(f.profit, e.currency); g[k].n += 1; });
    return Object.entries(g).map(([k, v]) => ({ k, ...v, margin: v.rev ? round2((v.profit / v.rev) * 100) : 0 }));
  };
  const byType = group((e) => state.settings.eventTypes.find((t) => t.id === e.eventTypeId)?.name);
  const byPlanner = group((e) => state.users.find((u) => u.id === e.plannerId)?.name ?? 'Unassigned');

  // 4. utilization
  const planners = state.users.filter((u) => u.role === 'planner').map((u) => {
    const mine = evs.filter((e) => e.plannerId === u.id && stageIndex(e.stage) >= stageIndex('booked') && stageIndex(e.stage) <= stageIndex('event_day'));
    const next90 = mine.filter((e) => e.date >= today && e.date <= addDays(today, 90));
    const openTasks = evs.filter((e) => e.plannerId === u.id).flatMap((e) => e.tasks).filter((t) => t.status !== 'done').length;
    return { u, active: mine.length, next90: next90.length, openTasks, util: Math.min(100, round2((next90.length / 4) * 100)) };
  });
  const crew = state.staff.map((st) => {
    const hrs = evs.flatMap((e) => e.shifts).filter((s) => s.staffId === st.id && s.date >= addDays(today, -90) && s.date <= addDays(today, 90)).reduce((a, s) => a + shiftHours(s), 0);
    return { st, hrs: round2(hrs) };
  });

  // 5. vendor perf
  const vendors = state.vendors.map((v) => ({ v, score: vendorScore(v), bookings: evs.flatMap((e) => e.vendorBookings).filter((b) => b.vendorId === v.id).length, issues: vendorCompliance(v, today) }));

  // 6. leakage
  const leaks = leakage(state, today);

  const exportCsv = (name, rows) => { download(`${name}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv'); act('INTERACTION_ADD', { eventId: evs[0].id, type: 'note', summary: `Report "${name}" exported` }); };

  return (
    <div>
      <div className="page-head"><div className="grow"><h1>Reporting & analytics</h1><div className="muted">All money in USD equivalent (rates in Settings).</div></div></div>
      <Tabs tabs={[{ id: 'pipeline', label: 'Pipeline & conversion' }, { id: 'revenue', label: 'Contracted revenue' }, { id: 'profit', label: 'Profitability' }, { id: 'util', label: 'Utilization' }, { id: 'vendors', label: 'Vendor performance' }, { id: 'leak', label: `Leakage (${leaks.length})` }]} value={tab} onChange={setTab} />
      {tab === 'pipeline' && (
        <div className="grid g2">
          <Card title="Conversion rate by lead source (won ÷ decided)">
            <BarChart rows={bySource.map((r) => ({ label: r.s, value: r.conv, display: `${r.conv}%` }))} max={100} />
          </Card>
          <Card title="Lead sources" actions={<button className="btn sm" onClick={() => exportCsv('conversion-by-source', [['Source', 'Leads', 'Open', 'Won', 'Lost', 'Conversion %', 'Won value USD'], ...bySource.map((r) => [r.s, r.n, r.open, r.won, r.lost, r.conv, r.wonValue])])}>CSV</button>}>
            <table className="t">
              <thead><tr><th>Source</th><th className="num">Leads</th><th className="num">Open</th><th className="num">Won</th><th className="num">Lost</th><th className="num">Conv.</th><th className="num">Won value</th></tr></thead>
              <tbody>{bySource.map((r) => <tr key={r.s}><td>{r.s}</td><td className="num">{r.n}</td><td className="num">{r.open}</td><td className="num">{r.won}</td><td className="num">{r.lost}</td><td className="num">{r.conv}%</td><td className="num">{fmtMoney(r.wonValue)}</td></tr>)}</tbody>
            </table>
          </Card>
          <Card title="Open pipeline by stage">
            <BarChart rows={['lead', 'qualified', 'proposal_sent', 'negotiation'].map((s) => {
              const list = evs.filter((e) => e.stage === s);
              const v = list.reduce((a, e) => a + usd(proposalTotals(state, e)?.total ?? e.budget ?? 0, e.currency), 0);
              return { label: `${s.replace('_', ' ')} (${list.length})`, value: v, display: fmtMoney(v) };
            })} />
          </Card>
        </div>
      )}
      {tab === 'revenue' && (
        <div className="grid g2">
          <Card title="Contracted revenue by event month (forward-looking)">
            <BarChart rows={months.map((m) => ({ label: m, value: byMonth[m].contracted, display: fmtMoney(byMonth[m].contracted) }))} />
          </Card>
          <Card title="Cash still to come in per event month">
            <table className="t">
              <thead><tr><th>Event month</th><th className="num">Events</th><th className="num">Contracted</th><th className="num">Received</th><th className="num">Still to collect</th></tr></thead>
              <tbody>{months.map((m) => <tr key={m}><td>{m}</td><td className="num">{byMonth[m].events}</td><td className="num">{fmtMoney(byMonth[m].contracted)}</td><td className="num">{fmtMoney(byMonth[m].paid)}</td><td className="num">{fmtMoney(byMonth[m].contracted - byMonth[m].paid)}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}
      {tab === 'profit' && (
        <div>
          <Card title="Profitability per event">
            <table className="t">
              <thead><tr><th>Event</th><th>Date</th><th className="num">Revenue</th><th className="num">Vendor</th><th className="num">Decor</th><th className="num">Crew</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
              <tbody>{prof.sort((a, b) => b.f.marginPct - a.f.marginPct).map(({ e, f }) => <tr key={e.id}><td><Link to={`/events/${e.id}?tab=budget`}>{e.name}</Link></td><td>{fmtDate(e.date)}</td><td className="num"><Money value={f.revenueNet} currency={e.currency} /></td><td className="num"><Money value={f.vendorCost} currency={e.currency} /></td><td className="num"><Money value={f.decorCost} currency={e.currency} /></td><td className="num"><Money value={f.crewCost} currency={e.currency} /></td><td className="num"><Money value={f.profit} currency={e.currency} /></td><td className="num">{f.marginPct}%</td></tr>)}</tbody>
            </table>
          </Card>
          <div className="grid g2 mt">
            <Card title="Margin % by event type"><BarChart rows={byType.map((r) => ({ label: `${r.k} (${r.n})`, value: r.margin, display: `${r.margin}% · ${fmtMoney(r.profit)}` }))} max={100} /></Card>
            <Card title="Margin % by planner"><BarChart rows={byPlanner.map((r) => ({ label: `${r.k} (${r.n})`, value: r.margin, display: `${r.margin}% · ${fmtMoney(r.profit)}` }))} max={100} /></Card>
          </div>
        </div>
      )}
      {tab === 'util' && (
        <div className="grid g2">
          <Card title="Planner utilization (next 90 days; capacity 4 events)">
            <BarChart rows={planners.map((p) => ({ label: p.u.name, value: p.util, display: `${p.util}% · ${p.next90} ev · ${p.openTasks} tasks` }))} max={100} />
          </Card>
          <Card title="Crew hours (±90 days)">
            <BarChart rows={crew.map((c) => ({ label: c.st.name, value: c.hrs, display: `${c.hrs} h` }))} />
          </Card>
        </div>
      )}
      {tab === 'vendors' && (
        <Card title="Vendor performance">
          <table className="t">
            <thead><tr><th>Vendor</th><th>Category</th><th className="num">Bookings</th><th className="num">Score</th><th>Reviews</th><th>Compliance</th></tr></thead>
            <tbody>{vendors.sort((a, b) => b.score - a.score).map(({ v, score, bookings, issues }) => <tr key={v.id}><td>{v.name}</td><td>{v.category}</td><td className="num">{bookings}</td><td className="num">★ {score}</td><td>{v.performance.map((p) => `${p.onTime}/${p.quality}`).join(', ') || '—'}</td><td>{issues.length ? issues.map((i) => <Badge key={i.text} tone={i.level}>{i.text}</Badge>) : <Badge tone="ok">OK</Badge>}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
      {tab === 'leak' && (
        <Card title="Revenue leakage report" actions={<button className="btn sm" onClick={() => exportCsv('leakage', [['Type', 'Event', 'Ref', 'Amount', 'Currency'], ...leaks.map((l) => [l.type, l.eventName, l.ref, l.amount, l.currency])])}>CSV</button>}>
          <div className="faint mb" style={{ fontSize: 12 }}>Unbilled change orders, overdue payments, unbilled decor damage, unbilled cancellation fees and uncollected vendor commissions.</div>
          <table className="t">
            <thead><tr><th>Type</th><th>Event</th><th>Reference</th><th className="num">Amount</th><th className="num">USD</th></tr></thead>
            <tbody>{leaks.map((l, i) => <tr key={i}><td>{l.type}</td><td><Link to={`/events/${l.eventId}`}>{l.eventName}</Link></td><td>{l.ref}{l.days ? ` (${l.days}d late)` : ''}</td><td className="num"><Money value={l.amount} currency={l.currency} /></td><td className="num">{fmtMoney(usd(l.amount, l.currency))}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{fmtMoney(leaks.reduce((a, l) => a + usd(l.amount, l.currency), 0))}</td></tr></tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
