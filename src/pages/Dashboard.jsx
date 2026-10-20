import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, StatTile, StageBadge, Badge, Money, PageHeader, EmptyState, Icon, AttentionList } from '../design-system/index.js';
import { fmtDate, diffDays, addDays, fmtDateTime } from '../lib/dates.js';
import { fmtMoney, round2 } from '../lib/money.js';
import { SALES_STAGES, ACTIVE_BOOKED_STAGES } from '../lib/lifecycle.js';
import { productionIssues } from '../lib/timeline.js';
import { staffingSummary } from '../lib/workforce.js';
import { eventFinancials, leakage, toUSD, vendorCompliance, proposalTotals, invoiceStatus, invoiceBalance, guaranteeWarnings } from '../lib/derived.js';

/**
 * Role-tailored home: every internal role sees the KPIs and attention items relevant to their job first.
 * Attention items are tagged with the roles that act on them.
 */
export default function Dashboard() {
  const { state, today, user } = useStore();
  const role = user.role;
  const evs = state.events;
  const usd = (n, c) => toUSD(state, n, c);
  const pipeline = evs.filter((e) => SALES_STAGES.includes(e.stage));
  const pipeValue = pipeline.reduce((a, e) => a + usd(proposalTotals(state, e)?.total ?? e.budget ?? 0, e.currency) * (e.probability / 100), 0);
  const upcoming = evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const contracted = evs.filter((e) => e.contract?.immutable && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).reduce((a, e) => a + usd(e.contract.total, e.currency), 0);
  const deferred = evs.reduce((a, e) => a + usd(eventFinancials(state, e).deferred, e.currency), 0);
  const leaks = leakage(state, today);
  const leakUSD = leaks.reduce((a, l) => a + usd(l.amount, l.currency), 0);
  const tasks = evs.flatMap((e) => e.tasks.filter((t) => t.status !== 'done' && t.dueDate <= addDays(today, 14) && t.assigneeType !== 'client').map((t) => ({ ...t, ev: e }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const invoices = evs.flatMap((e) => e.invoices.map((i) => ({ i, e, st: invoiceStatus(e, i, today), bal: invoiceBalance(e, i) })));
  const overdue = invoices.filter((x) => x.st === 'overdue');
  const dueSoon = invoices.filter((x) => ['sent', 'partial'].includes(x.st) && x.i.dueDate <= addDays(today, 14));
  const loadIns = evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage)).flatMap((e) => e.vendorBookings.filter((b) => b.loadIn && b.loadIn.slice(0, 10) >= today && b.loadIn.slice(0, 10) <= addDays(today, 45)).map((b) => ({ b, e }))).sort((a, b) => a.b.loadIn.localeCompare(b.b.loadIn));
  const unconfirmedShifts = evs.flatMap((e) => e.shifts.filter((s) => !s.confirmed && s.date >= today).map((s) => ({ s, e })));
  const soon = upcoming.filter((e) => diffDays(today, e.date) <= 60);
  const crewGaps = soon.map((e) => ({ e, s: staffingSummary(e) })).filter((x) => x.s.open > 0);
  const conflicts = soon.flatMap((e) => productionIssues(state, e).filter((i) => i.level === 'danger' && i.kind !== 'staffing').map((i) => ({ i, e })));
  const converted = evs.filter((e) => e.contract?.immutable).length;
  const decided = converted + evs.filter((e) => e.stage === 'lost').length;

  const KPIS = {
    pipeline: <StatTile key="p" label="Weighted pipeline (USD)" value={fmtMoney(pipeValue, 'USD', { whole: true })} sub={`${pipeline.length} open deals`} />,
    conversion: <StatTile key="c" label="Win rate" value={`${decided ? round2((converted / decided) * 100) : 0}%`} sub={`${converted} won / ${decided} decided`} />,
    contracted: <StatTile key="ct" label="Contracted revenue (USD)" value={fmtMoney(contracted, 'USD', { whole: true })} sub="signed, not cancelled" />,
    deferred: <StatTile key="d" label="Deferred revenue (USD)" value={fmtMoney(deferred, 'USD', { whole: true })} sub="deposits for future events" />,
    overdue: <StatTile key="o" label="Overdue receivables (USD)" value={fmtMoney(overdue.reduce((a, x) => a + usd(x.bal, x.i.currency), 0), 'USD', { whole: true })} sub={`${overdue.length} invoices`} tone={overdue.length ? 'danger' : undefined} />,
    leakage: <StatTile key="l" label="Revenue leakage (USD)" value={fmtMoney(leakUSD, 'USD', { whole: true })} sub={`${leaks.length} items`} tone={leaks.length ? 'danger' : undefined} />,
    tasks: <StatTile key="t" label="Open tasks ≤ 14 days" value={tasks.length} sub={`${tasks.filter((t) => t.dueDate < today).length} overdue`} tone={tasks.some((t) => t.dueDate < today) ? 'warn' : undefined} />,
    upcoming: <StatTile key="u" label="Booked events ahead" value={upcoming.length} sub={upcoming[0] ? `next: ${fmtDate(upcoming[0].date)}` : '—'} />,
    loadins: <StatTile key="li" label="Load-ins next 45 days" value={loadIns.length} />,
    shifts: <StatTile key="s" label="Unconfirmed shifts" value={unconfirmedShifts.length} tone={unconfirmedShifts.length ? 'warn' : undefined} />,
    crew: <StatTile key="cr" label="Open crew slots (≤ 60 days)" value={crewGaps.reduce((a, x) => a + x.s.open, 0)} sub={`${crewGaps.length} event(s)`} tone={crewGaps.length ? 'danger' : 'ok'} />,
    conflicts: <StatTile key="cf" label="Production conflicts" value={conflicts.length} sub="docks, hand-offs, access" tone={conflicts.length ? 'danger' : 'ok'} />,
  };
  const KPI_BY_ROLE = {
    admin: ['pipeline', 'contracted', 'deferred', 'leakage', 'tasks'],
    sales: ['pipeline', 'conversion', 'contracted', 'upcoming', 'tasks'],
    planner: ['upcoming', 'tasks', 'crew', 'conflicts', 'leakage'],
    production: ['upcoming', 'loadins', 'crew', 'conflicts', 'shifts'],
    finance: ['overdue', 'deferred', 'contracted', 'leakage'],
  };

  // attention items, each tagged with the roles that can act on it
  const attention = [
    ...state.holds.filter((h) => h.status === 'active' && (h.depositOverdue || diffDays(today, h.expiresAt) <= state.settings.holdReminderDays)).map((h) => {
      const e = evs.find((x) => x.id === h.eventId);
      return { roles: ['sales', 'admin', 'finance'], tone: h.depositOverdue ? 'danger' : 'warning', icon: h.depositOverdue ? 'money' : 'hourglass', node: <>{h.depositOverdue ? 'Deposit overdue, date at risk:' : `Hold #${h.priority} expires ${fmtDate(h.expiresAt)}:`} <Link to={`/events/${e.id}`}>{e.name}</Link> ({fmtDate(h.date)})</> };
    }),
    ...overdue.map(({ i, e, bal }) => ({ roles: ['finance', 'admin', 'planner'], tone: 'danger', icon: 'money', node: <>{i.number} overdue since {fmtDate(i.dueDate)} — <Link to={`/events/${e.id}?tab=finance`}>{e.name}</Link> (<Money value={bal} currency={i.currency} />)</> })),
    ...evs.flatMap((e) => e.changeOrders.filter((c) => ['draft', 'sent'].includes(c.status)).map((c) => ({ roles: ['planner', 'admin', 'sales'], tone: c.isException ? 'danger' : 'info', icon: 'edit', node: <>{c.number} {c.title} — {c.status}{c.isException ? ' (EXCEPTION: needs special approval)' : ''} · <Link to={`/events/${e.id}?tab=co`}>{e.name}</Link></> }))),
    ...evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage)).flatMap((e) => guaranteeWarnings(e).map((w) => ({ roles: ['planner', 'admin'], tone: w.level, icon: 'users', node: <><Link to={`/events/${e.id}?tab=guests`}>{e.name}</Link>: {w.text}</> }))),
    ...state.vendors.map((v) => ({ v, issues: vendorCompliance(v, today) })).filter((x) => x.issues.length).map(({ v, issues }) => ({ roles: ['planner', 'production', 'admin', 'finance'], tone: issues[0].level, icon: 'flag', node: <>{v.name}: {issues.map((i) => i.text).join(', ')}</> })),
    ...conflicts.map(({ i, e }) => ({ roles: ['production', 'planner'], tone: 'danger', icon: 'clock', node: <><Link to={`/events/${e.id}?tab=timeline`}>{e.name}</Link>: {i.text}</> })),
    ...crewGaps.map(({ e, s }) => ({ roles: ['production', 'planner', 'admin'], tone: 'danger', icon: 'hardhat', node: <><Link to={`/events/${e.id}?tab=people`}>{e.name}</Link>: {s.open} of {s.required} crew slots not confirmed (T-{diffDays(today, e.date)})</> })),
    ...unconfirmedShifts.map(({ s, e }) => ({ roles: ['production', 'planner'], tone: 'warning', icon: 'users', node: <>{state.staff.find((x) => x.id === s.staffId)?.name} has not confirmed {s.role} on {fmtDate(s.date)} · <Link to={`/events/${e.id}?tab=staff`}>{e.name}</Link></> })),
  ].filter((a) => a.roles.includes(role) || role === 'admin');

  return (
    <div>
      <PageHeader title={`Good day, ${user.name.split(' ')[0]}`} subtitle={`${fmtDate(today, { weekday: 'long' })} · ${state.users.find((u) => u.id === user.id)?.role} view · ${upcoming.length} booked events ahead · ${pipeline.length} open deals`}
        actions={['admin', 'sales'].includes(role) && <Link className="btn primary" to="/pipeline">+ New inquiry</Link>} />
      <div className={`grid g${(KPI_BY_ROLE[role] ?? KPI_BY_ROLE.admin).length}`}>{(KPI_BY_ROLE[role] ?? KPI_BY_ROLE.admin).map((k) => KPIS[k])}</div>

      <div className="grid g2 mt">
        <Card title="Needs your attention" actions={<Badge>{attention.length}</Badge>}>
          <AttentionList items={[...attention].sort((a, b) => (a.tone === 'danger' ? 0 : 1) - (b.tone === 'danger' ? 0 : 1))} />
        </Card>
        {role === 'finance' ? (
          <Card title="Receivables due in 14 days" actions={<Link to="/finance">Finance →</Link>}>
            <table className="t"><thead><tr><th>Due</th><th>Invoice</th><th>Event</th><th className="num">Balance</th></tr></thead>
              <tbody>{dueSoon.map(({ i, e, bal }) => <tr key={i.id}><td>{fmtDate(i.dueDate)}</td><td>{i.number}</td><td><Link to={`/events/${e.id}?tab=finance`}>{e.name}</Link></td><td className="num"><Money value={bal} currency={i.currency} /></td></tr>)}</tbody></table>
            {dueSoon.length === 0 && <EmptyState>Nothing due</EmptyState>}
          </Card>
        ) : role === 'production' ? (
          <Card title="Upcoming load-ins">
            <table className="t"><thead><tr><th>Load-in</th><th>Vendor</th><th>Event</th><th>Contact</th></tr></thead>
              <tbody>{loadIns.slice(0, 12).map(({ b, e }) => <tr key={b.id}><td>{fmtDateTime(b.loadIn)}</td><td>{state.vendors.find((v) => v.id === b.vendorId)?.name}</td><td><Link to={`/events/${e.id}?tab=ros`}>{e.name}</Link></td><td className="faint">{b.onsiteContact}</td></tr>)}</tbody></table>
          </Card>
        ) : (
          <Card title="Upcoming events" actions={<Link to="/events">All events →</Link>}>
            <table className="t">
              <thead><tr><th>Date</th><th>Event</th><th>Stage</th><th>Date status</th><th className="num">Days out</th></tr></thead>
              <tbody>{upcoming.slice(0, 8).map((e) => (
                <tr key={e.id}><td>{fmtDate(e.date)}</td><td><Link to={`/events/${e.id}`}>{e.name}</Link><div className="faint">{e.segment} · {e.venue?.name}</div></td><td><StageBadge stage={e.stage} /></td>
                  <td><Badge tone={e.dateStatus === 'locked' ? 'ok' : 'warn'}>{e.dateStatus === 'locked' ? <><Icon name="lock" size={12} /> locked</> : <><Icon name="hourglass" size={12} /> hold</>}</Badge></td><td className="num">{diffDays(today, e.date)}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="grid g2 mt">
        <Card title="Tasks due in the next 14 days">
          <table className="t">
            <thead><tr><th>Due</th><th>Task</th><th>Event</th><th>Status</th></tr></thead>
            <tbody>{tasks.slice(0, 10).map((t) => (
              <tr key={t.id}><td className={t.dueDate < today ? 'text-danger' : ''}>{fmtDate(t.dueDate)}</td><td>{t.title}</td><td><Link to={`/events/${t.ev.id}?tab=planning`}>{t.ev.name}</Link></td><td><Badge>{t.status}</Badge></td></tr>
            ))}</tbody>
          </table>
          {tasks.length === 0 && <EmptyState>No tasks due</EmptyState>}
        </Card>
        <Card title="Revenue leakage" actions={<Link to="/reports">Reports →</Link>}>
          {leaks.length === 0 ? <EmptyState>No leakage detected</EmptyState> : (
            <table className="t">
              <thead><tr><th>Type</th><th>Event</th><th>Ref</th><th className="num">Amount</th></tr></thead>
              <tbody>{leaks.map((l, i) => <tr key={i}><td>{l.type}</td><td><Link to={`/events/${l.eventId}`}>{l.eventName}</Link></td><td>{l.ref}</td><td className="num"><Money value={l.amount} currency={l.currency} /></td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>Total (USD equiv.)</td><td className="num">{fmtMoney(round2(leakUSD))}</td></tr></tfoot>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
