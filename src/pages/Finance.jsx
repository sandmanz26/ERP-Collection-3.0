import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, StatTile, PillSelect, Tabs, Button } from '../design-system/index.js';
import { invoiceStatus, invoiceBalance, eventFinancials, toBase, baseCurrency } from '../lib/derived.js';
import { fmtDate, diffDays, monthKey } from '../lib/dates.js';
import { fmtMoney, round2 } from '../lib/money.js';
import { PayModal } from './event/FinanceTab.jsx';

export default function Finance() {
  const { state, act, today } = useStore();
  const [tab, setTab] = useState('ar');
  const [filter, setFilter] = useState('open');
  const [pay, setPay] = useState(null);
  const invs = state.events.flatMap((e) => e.invoices.map((i) => ({ i, e, st: invoiceStatus(e, i, today), bal: invoiceBalance(e, i) })));
  const ar = invs.filter((x) => filter === 'all' || (filter === 'open' ? !['paid', 'void'].includes(x.st) : x.st === filter)).sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
  const ap = state.events.flatMap((e) => e.vendorBookings.flatMap((b) => b.payments.map((p) => ({ p, b, e, v: state.vendors.find((v) => v.id === b.vendorId) })))).sort((a, b) => a.p.dueDate.localeCompare(b.p.dueDate));
  const fin = state.events.map((e) => ({ e, f: eventFinancials(state, e) }));
  const BASE = baseCurrency(state);
  const usd = (n, c) => toBase(state, n, c);
  const arOpen = invs.filter((x) => !['paid', 'void'].includes(x.st)).reduce((a, x) => a + usd(x.bal, x.i.currency), 0);
  const overdue = invs.filter((x) => x.st === 'overdue').reduce((a, x) => a + usd(x.bal, x.i.currency), 0);
  const apOpen = ap.filter((x) => x.p.status !== 'paid').reduce((a, x) => a + usd(x.p.amount, x.e.currency), 0);
  const deferred = fin.reduce((a, x) => a + usd(x.f.deferred, x.e.currency), 0);
  const recognized = fin.reduce((a, x) => a + usd(x.f.recognizedRevenue, x.e.currency), 0);
  // cash forecast: unpaid schedule items + unpaid invoice balances by month (in) vs vendor payables (out)
  const months = {};
  const add = (m, k, v) => { months[m] ??= { in: 0, out: 0 }; months[m][k] += v; };
  state.events.forEach((e) => {
    e.paymentSchedule.filter((p) => p.status === 'scheduled').forEach((p) => add(monthKey(p.dueDate < today ? today : p.dueDate), 'in', usd(p.amount, e.currency)));
    e.invoices.forEach((i) => { const b = invoiceBalance(e, i); if (b > 0 && invoiceStatus(e, i, today) !== 'void') add(monthKey(i.dueDate < today ? today : i.dueDate), 'in', usd(b, e.currency)); });
    e.vendorBookings.forEach((b) => b.payments.filter((p) => p.status !== 'paid').forEach((p) => add(monthKey(p.dueDate < today ? today : p.dueDate), 'out', usd(p.amount, e.currency))));
  });
  return (
    <div>
      <div className="page-head"><div className="grow"><h1>Finance</h1><div className="muted">Receivables, payables, deferred vs recognized revenue, gratuities, commissions and accounting sync. Amounts in {BASE} equivalent unless stated.</div></div></div>
      <div className="grid g5">
        <StatTile label="Open receivables" value={fmtMoney(arOpen, BASE)} />
        <StatTile label="Overdue" value={fmtMoney(overdue, BASE)} tone={overdue ? 'danger' : undefined} />
        <StatTile label="Open vendor payables" value={fmtMoney(apOpen, BASE)} />
        <StatTile label="Deferred revenue (liability)" value={fmtMoney(deferred, BASE)} />
        <StatTile label="Recognized revenue" value={fmtMoney(recognized, BASE)} />
      </div>
      <div className="mt">
        <Tabs tabs={[{ id: 'ar', label: 'Receivables' }, { id: 'ap', label: 'Vendor payables' }, { id: 'rev', label: 'Revenue recognition' }, { id: 'cash', label: 'Cash forecast' }, { id: 'other', label: 'Gratuities & commissions' }, { id: 'acct', label: 'Accounting' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'ar' && (
        <Card actions={<PillSelect options={['open', 'overdue', 'paid', 'all']} value={filter} onChange={setFilter} />} title="Client invoices">
          <table className="t">
            <thead><tr><th>Invoice</th><th>Event</th><th>Description</th><th>Due</th><th className="num">Amount</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
            <tbody>{ar.map(({ i, e, st, bal }) => (
              <tr key={i.id}><td className="nowrap">{i.number}</td><td><Link to={`/events/${e.id}?tab=finance`}>{e.name}</Link></td><td>{i.label}</td><td className="nowrap">{fmtDate(i.dueDate)}{st === 'overdue' && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{diffDays(i.dueDate, today)}d late</div>}</td><td className="num"><Money value={i.amount} currency={i.currency} /></td><td className="num"><Money value={bal} currency={i.currency} /></td><td><StatusBadge status={st} /></td>
                <td><div className="row">{bal > 0 && st !== 'void' && <Button size="sm" onClick={() => setPay({ e, i })}>Record payment</Button>}{st === 'overdue' && <Button variant="danger" size="sm" onClick={() => act('LATE_FEE_APPLY', { eventId: e.id, invoiceId: i.id })}>Late fee</Button>}</div></td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'ap' && (
        <Card title="Vendor payables (pass-through)">
          <table className="t">
            <thead><tr><th>Due</th><th>Vendor</th><th>Event</th><th>Label</th><th className="num">Amount</th><th>Status</th><th>Proof</th><th /></tr></thead>
            <tbody>{ap.map(({ p, b, e, v }) => (
              <tr key={p.id}><td className="nowrap" style={{ color: p.status !== 'paid' && p.dueDate < today ? 'var(--danger)' : undefined }}>{fmtDate(p.dueDate)}</td><td>{v.name}</td><td><Link to={`/events/${e.id}?tab=vendors`}>{e.name}</Link></td><td>{p.label}</td><td className="num"><Money value={p.amount} currency={e.currency} /></td><td><StatusBadge status={p.status} /></td><td className="faint">{p.proofRef}</td>
                <td>{p.status !== 'paid' && <Button variant="success" size="sm" onClick={() => act('VENDOR_PAYMENT_PAID', { eventId: e.id, bookingId: b.id, paymentId: p.id })}>Mark paid</Button>}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'rev' && (
        <Card title="Deposits (deferred) vs recognized revenue per event">
          <div className="faint mb" style={{ fontSize: 12 }}>Cash received before the event is a liability (revenue received in advance) and is recognized only once the event has taken place — essential for refunds on cancellation.</div>
          <table className="t">
            <thead><tr><th>Event</th><th>Date</th><th>Stage</th><th className="num">Received</th><th className="num">Refunded</th><th className="num">Deferred</th><th className="num">Recognized</th></tr></thead>
            <tbody>{fin.filter((x) => x.f.paid > 0).map(({ e, f }) => <tr key={e.id}><td><Link to={`/events/${e.id}?tab=finance`}>{e.name}</Link></td><td className="nowrap">{fmtDate(e.date)}</td><td>{e.stage}</td><td className="num"><Money value={f.paid} currency={e.currency} /></td><td className="num"><Money value={f.refunds} currency={e.currency} /></td><td className="num"><Money value={f.deferred} currency={e.currency} /></td><td className="num"><Money value={f.recognizedRevenue} currency={e.currency} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}
      {tab === 'cash' && (
        <Card title={`Cash forecast by month (${BASE})`}>
          <table className="t">
            <thead><tr><th>Month</th><th className="num">Expected in (clients)</th><th className="num">Expected out (vendors)</th><th className="num">Net</th></tr></thead>
            <tbody>{Object.keys(months).sort().map((m) => <tr key={m}><td>{m}</td><td className="num">{fmtMoney(months[m].in, BASE)}</td><td className="num">{fmtMoney(months[m].out, BASE)}</td><td className="num" style={{ color: months[m].in - months[m].out < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(round2(months[m].in - months[m].out), BASE)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
      {tab === 'other' && (
        <div className="grid g2">
          <Card title="Gratuities (liability, not revenue)">
            <table className="t"><tbody>{state.events.flatMap((e) => e.gratuities.map((g) => <tr key={g.id}><td>{e.name}</td><td>{g.to}</td><td className="num"><Money value={g.amount} currency={e.currency} /></td></tr>))}</tbody></table>
          </Card>
          <Card title="Vendor commissions & referral fees">
            <table className="t"><tbody>{state.events.flatMap((e) => e.vendorBookings.filter((b) => b.commissionAmount).map((b) => <tr key={b.id}><td>{e.name}</td><td>{state.vendors.find((v) => v.id === b.vendorId)?.name}</td><td className="num"><Money value={b.commissionAmount} currency={e.currency} /></td><td><StatusBadge status={b.commissionStatus} /></td></tr>))}</tbody></table>
          </Card>
        </div>
      )}
      {tab === 'acct' && (
        <div className="grid g2">
          <Card title="Chart of accounts mapping">
            <table className="t"><thead><tr><th>Concept</th><th>QuickBooks</th><th>Xero</th></tr></thead><tbody>{state.settings.accountMapping.map((m) => <tr key={m.key}><td>{m.label}</td><td>{m.quickbooks}</td><td>{m.xero}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Sync events" actions={<Button variant="primary" onClick={() => state.events.filter((e) => e.contract?.immutable).forEach((e) => act('ACCOUNTING_SYNC', { eventId: e.id, provider: state.settings.accountingProvider }))}>Sync all booked events</Button>}>
            <table className="t"><tbody>{state.events.filter((e) => e.contract?.immutable).map((e) => <tr key={e.id}><td>{e.name}</td><td>{e.accountingSync[0] ? <Badge tone="ok">{e.accountingSync[0].provider} · {fmtDate(e.accountingSync[0].at.slice(0, 10))}</Badge> : <Badge>never</Badge>}</td></tr>)}</tbody></table>
          </Card>
        </div>
      )}
      {pay && <PayModal ev={pay.e} inv={pay.i} onClose={() => setPay(null)} />}
    </div>
  );
}
