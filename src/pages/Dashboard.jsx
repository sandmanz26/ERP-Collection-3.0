import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, StatTile, StageBadge, Badge, Money, PageHeader, EmptyState, Icon, AttentionList, Button, Runway } from '../design-system/index.js';
import { useNavigate } from 'react-router-dom';
import { fmtDate, diffDays, addDays, fmtDateTime } from '../lib/dates.js';
import { fmtMoney, round2 } from '../lib/money.js';
import { GettingStarted } from '../platform/SaasChrome.jsx';
import { SALES_STAGES, ACTIVE_BOOKED_STAGES } from '../lib/lifecycle.js';
import { productionIssues } from '../lib/timeline.js';
import { priorities, nextActions } from '../lib/eventGuide.js';
import { staffingSummary } from '../lib/workforce.js';
import { eventFinancials, leakage, toBase, baseCurrency, vendorCompliance, proposalTotals, invoiceStatus, invoiceBalance, guaranteeWarnings } from '../lib/derived.js';

/**
 * Role-tailored home: every internal role sees the KPIs and attention items relevant to their job first.
 * Attention items are tagged with the roles that act on them.
 */
export default function Dashboard() {
  const { state, today, user } = useStore();
  const role = user.role;
  const nav = useNavigate();
  const top = priorities(state, user, today, 4);
  const evs = state.events;
  const BASE = baseCurrency(state);
  const usd = (n, c) => toBase(state, n, c);
  const pipeline = evs.filter((e) => SALES_STAGES.includes(e.stage));
  const pipeValue = pipeline.reduce((a, e) => a + usd(proposalTotals(state, e)?.total ?? e.budget ?? 0, e.currency) * (e.probability / 100), 0);
  const upcoming = evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const contracted = evs.filter((e) => e.contract?.immutable && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).reduce((a, e) => a + usd(e.contract.total, e.currency), 0);
  const deferred = evs.reduce((a, e) => a + usd(eventFinancials(state, e).deferred, e.currency), 0);
  const leaks = leakage(state, today);
  const leakBase = leaks.reduce((a, l) => a + usd(l.amount, l.currency), 0);
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

  // runway: booked events and dates on hold in the next 120 days; red ring when the event has a danger next step
  const runwayItems = evs.filter((e) => e.date && (ACTIVE_BOOKED_STAGES.includes(e.stage) || (SALES_STAGES.includes(e.stage) && state.holds.some((h) => h.eventId === e.id && h.status === 'active'))))
    .filter((e) => role === 'admin' || role === 'finance' || [e.plannerId, e.salesId].includes(user.id) || role === 'production')
    .map((e) => ({ id: e.id, date: e.date, label: e.name, kind: ACTIVE_BOOKED_STAGES.includes(e.stage) ? 'booked' : 'hold', alert: ACTIVE_BOOKED_STAGES.includes(e.stage) && nextActions(state, e, today).some((a) => a.severity === 'danger'), onClick: () => nav(`/events/${e.id}`) }));

  const KPIS = {
    pipeline: <StatTile key="p" label={`Weighted pipeline (${BASE})`} value={fmtMoney(pipeValue, BASE, { whole: true })} sub={`${pipeline.length} open deals`} />,
    conversion: <StatTile key="c" label="Win rate" value={`${decided ? round2((converted / decided) * 100) : 0}%`} sub={`${converted} won / ${decided} decided`} />,
    contracted: <StatTile key="ct" label={`Contracted revenue (${BASE})`} value={fmtMoney(contracted, BASE, { whole: true })} sub="signed, not cancelled" />,
    deferred: <StatTile key="d" label={`Deferred revenue (${BASE})`} value={fmtMoney(deferred, BASE, { whole: true })} sub="deposits for future events" />,
    overdue: <StatTile key="o" label={`Overdue receivables (${BASE})`} value={fmtMoney(overdue.reduce((a, x) => a + usd(x.bal, x.i.currency), 0), BASE, { whole: true })} sub={`${overdue.length} invoices`} tone={overdue.length ? 'danger' : undefined} />,
    leakage: <StatTile key="l" label={`Revenue leakage (${BASE})`} value={fmtMoney(leakBase, BASE, { whole: true })} sub={`${leaks.length} items`} tone={leaks.length ? 'danger' : undefined} />,
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
      <PageHeader title={`Good day, ${user.name.split(' ')[0]}`} subtitle={`${fmtDate(today, { weekday: 'long', year: undefined })}. ${upcoming.length} booked ${upcoming.length === 1 ? 'event' : 'events'} ahead and ${pipeline.length} open ${pipeline.length === 1 ? 'deal' : 'deals'}.`}
        actions={['admin', 'sales'].includes(role) && <Link className="btn primary" to="/pipeline">New inquiry</Link>} />
      <section className="dash-section runway-section" aria-label="Next 120 days">
        <div className="dash-head"><h2>Next 120 days</h2>
          <div className="runway-legend"><span><i />Booked</span><span><i className="rl-hold" />Date on hold</span><span><i className="rl-alert" />Needs attention</span></div>
        </div>
        <Runway today={today} days={120} items={runwayItems} />
      </section>
      <GettingStarted />
      {top.length > 0 && (
        <section className="dash-section" aria-label="Today's priorities">
          <div className="dash-head"><h2>Today's priorities</h2><span className="faint text-sm">Most urgent first, across {role === 'admin' || role === 'finance' ? 'all events' : 'your events'}</span></div>
          <Card className="prio">
            {top.map((a, i) => (
              <div key={i} className={`prio-row prio-${a.severity}`}>
                <span className="callout-icon"><Icon name={a.icon} size={17} /></span>
                <div>
                  <div className="prio-event">{a.ev.name}{a.ev.date ? `, ${fmtDate(a.ev.date)}` : ''}</div>
                  <div className="prio-title">{a.title}</div>
                  {a.detail && <div className="prio-detail">{a.detail}</div>}
                </div>
                <Button size="sm" onClick={() => nav(`/events/${a.ev.id}?tab=${a.tab}`)}>{a.cta}</Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="dash-section" aria-label="Key numbers">
        <div className="dash-head"><h2>At a glance</h2></div>
        <div className="kpis">{(KPI_BY_ROLE[role] ?? KPI_BY_ROLE.admin).map((k) => KPIS[k])}</div>
      </section>

      <section className="dash-section">
        <div className="grid g2 top">
          <Card title="Needs your attention" actions={<Badge>{attention.length}</Badge>}>
            <AttentionList max={5} items={[...attention].sort((a, b) => (a.tone === 'danger' ? 0 : 1) - (b.tone === 'danger' ? 0 : 1))} />
          </Card>
          {role === 'finance' ? (
            <Card title="Receivables due in 14 days" actions={<Link to="/finance">Open finance</Link>}>
              {dueSoon.length === 0 ? <EmptyState>Nothing due</EmptyState> : (
                <table className="t"><thead><tr><th>Due</th><th>Invoice · event</th><th className="num">Balance</th></tr></thead>
                  <tbody>{dueSoon.slice(0, 5).map(({ i, e, bal }) => <tr key={i.id}><td className="nowrap">{fmtDate(i.dueDate, { year: undefined })}</td><td>{i.number}<Link className="cell-sub" to={`/events/${e.id}?tab=finance`}>{e.name}</Link></td><td className="num"><Money value={bal} currency={i.currency} /></td></tr>)}</tbody>
                </table>
              )}
            </Card>
          ) : role === 'production' ? (
            <Card title="Upcoming load-ins">
              <table className="t"><thead><tr><th>Load-in</th><th>Vendor · event</th></tr></thead>
                <tbody>{loadIns.slice(0, 5).map(({ b, e }) => <tr key={b.id}><td className="nowrap">{fmtDate(b.loadIn.slice(0, 10), { year: undefined })} · {b.loadIn.slice(11, 16)}</td><td>{state.vendors.find((v) => v.id === b.vendorId)?.name}<Link className="cell-sub" to={`/events/${e.id}?tab=ros`}>{e.name} · {b.onsiteContact}</Link></td></tr>)}</tbody>
              </table>
            </Card>
          ) : (
            <Card title="Upcoming events" actions={<Link to="/events">All events</Link>}>
              {upcoming.length === 0 ? <EmptyState>No booked events ahead</EmptyState> : (
                <table className="t">
                  <thead><tr><th>When</th><th>Event</th><th>Status</th></tr></thead>
                  <tbody>{upcoming.slice(0, 5).map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => nav(`/events/${e.id}`)}>
                      <td className="nowrap"><b>{fmtDate(e.date, { year: undefined })}</b><span className="cell-sub">in {diffDays(today, e.date)} days</span></td>
                      <td><Link to={`/events/${e.id}`} onClick={(x) => x.stopPropagation()}>{e.name}</Link><span className="cell-sub">{e.venue?.name}</span></td>
                      <td className="nowrap"><StageBadge stage={e.stage} /><span className="cell-sub">{e.dateStatus === 'locked' ? <><Icon name="lock" size={12} /> date locked</> : <><Icon name="hourglass" size={12} /> date on hold</>}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          )}
        </div>
      </section>

      <section className="dash-section">
        <div className="grid g2 top">
          <Card title="Due in the next 14 days" actions={tasks.length > 5 && <Link to="/events">All {tasks.length} tasks</Link>}>
            {tasks.length === 0 ? <EmptyState>No tasks due</EmptyState> : (
              <table className="t">
                <thead><tr><th>Due</th><th>Task</th></tr></thead>
                <tbody>{tasks.slice(0, 5).map((t) => (
                  <tr key={t.id}><td className={`nowrap ${t.dueDate < today ? 'text-danger' : ''}`}>{fmtDate(t.dueDate, { year: undefined })}{t.dueDate < today && <span className="cell-sub">overdue</span>}</td><td>{t.title}<Link className="cell-sub" to={`/events/${t.ev.id}?tab=planning`}>{t.ev.name}</Link></td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <Card title="Revenue leakage" actions={<Link to="/reports">Open reports</Link>}>
            {leaks.length === 0 ? <EmptyState>No leakage detected</EmptyState> : (
              <table className="t">
                <thead><tr><th>Issue</th><th className="num">Amount</th></tr></thead>
                <tbody>{leaks.slice(0, 5).map((l, i) => <tr key={i}><td>{l.type} · {l.ref}<Link className="cell-sub" to={`/events/${l.eventId}`}>{l.eventName}</Link></td><td className="num nowrap"><Money value={l.amount} currency={l.currency} /></td></tr>)}</tbody>
                <tfoot><tr><td>Total{leaks.length > 5 ? ` (${leaks.length} items)` : ''}</td><td className="num nowrap">{fmtMoney(round2(leakBase), BASE)}</td></tr></tfoot>
              </table>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
