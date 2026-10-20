import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Stat, StageBadge, Badge, Money, Alert } from '../components/ui.jsx';
import { fmtDate, diffDays, addDays } from '../lib/dates.js';
import { fmtMoney, round2 } from '../lib/money.js';
import { SALES_STAGES, ACTIVE_BOOKED_STAGES } from '../lib/lifecycle.js';
import { eventFinancials, leakage, toUSD, vendorCompliance, proposalTotals, invoiceStatus, guaranteeWarnings } from '../lib/derived.js';

export default function Dashboard() {
  const { state, today, user } = useStore();
  const evs = state.events;
  const pipeline = evs.filter((e) => SALES_STAGES.includes(e.stage));
  const pipeValue = pipeline.reduce((a, e) => a + toUSD(state, (proposalTotals(state, e)?.total ?? e.budget ?? 0), e.currency) * (e.probability / 100), 0);
  const upcoming = evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const contracted = evs.filter((e) => e.contract?.immutable && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).reduce((a, e) => a + toUSD(state, e.contract.total, e.currency), 0);
  const deferred = evs.reduce((a, e) => a + toUSD(state, eventFinancials(state, e).deferred, e.currency), 0);
  const leaks = leakage(state, today);
  const leakUSD = leaks.reduce((a, l) => a + toUSD(state, l.amount, l.currency), 0);
  const myTasks = evs.flatMap((e) => e.tasks.filter((t) => t.status !== 'done' && t.dueDate <= addDays(today, 14) && t.assigneeType !== 'client').map((t) => ({ ...t, ev: e }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const expiringHolds = state.holds.filter((h) => h.status === 'active' && diffDays(today, h.expiresAt) <= state.settings.holdReminderDays);
  const vendorIssues = state.vendors.map((v) => ({ v, issues: vendorCompliance(v, today) })).filter((x) => x.issues.length);
  const overdue = evs.flatMap((e) => e.invoices.filter((i) => invoiceStatus(e, i, today) === 'overdue').map((i) => ({ i, e })));
  const pendingCOs = evs.flatMap((e) => e.changeOrders.filter((c) => ['draft', 'sent'].includes(c.status)).map((c) => ({ c, e })));
  const headcountAlerts = evs.filter((e) => ACTIVE_BOOKED_STAGES.includes(e.stage)).flatMap((e) => guaranteeWarnings(e).map((w) => ({ ...w, e })));

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <h1>Good day, {user.name.split(' ')[0]}</h1>
          <div className="muted">{fmtDate(today, { weekday: 'long' })} · {upcoming.length} upcoming booked events · {pipeline.length} open deals</div>
        </div>
        <Link className="btn primary" to="/pipeline">+ New inquiry</Link>
      </div>

      <div className="grid g5">
        <Stat label="Weighted pipeline (USD)" value={fmtMoney(pipeValue)} sub={`${pipeline.length} deals`} />
        <Stat label="Contracted revenue (USD)" value={fmtMoney(contracted)} sub="signed, not cancelled" />
        <Stat label="Deferred revenue (USD)" value={fmtMoney(deferred)} sub="deposits for future events" />
        <Stat label="Revenue leakage (USD)" value={fmtMoney(leakUSD)} sub={`${leaks.length} items`} tone={leaks.length ? 'danger' : undefined} />
        <Stat label="Open tasks ≤14d" value={myTasks.length} sub={`${myTasks.filter((t) => t.dueDate < today).length} overdue`} />
      </div>

      <div className="grid g2 mt">
        <Card title="Upcoming events" actions={<Link to="/events">All events →</Link>}>
          <table className="t">
            <thead><tr><th>Date</th><th>Event</th><th>Stage</th><th>Date status</th><th className="num">T-minus</th></tr></thead>
            <tbody>
              {upcoming.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td><Link to={`/events/${e.id}`}>{e.name}</Link><div className="faint">{e.segment} · {e.venue?.name}</div></td>
                  <td><StageBadge stage={e.stage} /></td>
                  <td><Badge tone={e.dateStatus === 'locked' ? 'ok' : 'warn'}>{e.dateStatus === 'locked' ? '🔒 locked' : '⏳ hold'}</Badge></td>
                  <td className="num">T-{diffDays(today, e.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Needs attention">
          {expiringHolds.map((h) => {
            const e = evs.find((x) => x.id === h.eventId);
            return <Alert key={h.id} tone="warning">⏳ Hold #{h.priority} for <Link to={`/events/${e.id}`}>{e.name}</Link> on {fmtDate(h.date)} expires {fmtDate(h.expiresAt)}</Alert>;
          })}
          {overdue.map(({ i, e }) => <Alert key={i.id} tone="danger">💸 {i.number} overdue — <Link to={`/events/${e.id}`}>{e.name}</Link> (due {fmtDate(i.dueDate)}, <Money value={i.amount} currency={i.currency} />)</Alert>)}
          {pendingCOs.map(({ c, e }) => <Alert key={c.id} tone={c.isException ? 'danger' : 'info'}>✎ {c.number} {c.title} — {c.status}{c.isException ? ' (EXCEPTION: needs special approval)' : ''} · <Link to={`/events/${e.id}`}>{e.name}</Link></Alert>)}
          {headcountAlerts.map((w, k) => <Alert key={k} tone={w.level}>👥 <Link to={`/events/${w.e.id}`}>{w.e.name}</Link>: {w.text}</Alert>)}
          {vendorIssues.slice(0, 5).map(({ v, issues }) => <Alert key={v.id} tone={issues[0].level}>⚑ {v.name}: {issues.map((i) => i.text).join(', ')}</Alert>)}
          {!expiringHolds.length && !overdue.length && !pendingCOs.length && !vendorIssues.length && <div className="empty">All clear 🎉</div>}
        </Card>
      </div>

      <div className="grid g2 mt">
        <Card title="Tasks due in the next 14 days">
          <table className="t">
            <thead><tr><th>Due</th><th>Task</th><th>Event</th><th>Status</th></tr></thead>
            <tbody>
              {myTasks.slice(0, 10).map((t) => (
                <tr key={t.id}>
                  <td style={{ color: t.dueDate < today ? 'var(--danger)' : undefined }}>{fmtDate(t.dueDate)}</td>
                  <td>{t.title}</td>
                  <td><Link to={`/events/${t.ev.id}?tab=planning`}>{t.ev.name}</Link></td>
                  <td><Badge>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Revenue leakage" actions={<Link to="/reports">Reports →</Link>}>
          {leaks.length === 0 ? <div className="empty">No leakage detected</div> : (
            <table className="t">
              <thead><tr><th>Type</th><th>Event</th><th>Ref</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {leaks.map((l, i) => (
                  <tr key={i}><td>{l.type}</td><td><Link to={`/events/${l.eventId}`}>{l.eventName}</Link></td><td>{l.ref}</td><td className="num"><Money value={l.amount} currency={l.currency} /></td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total (USD equiv.)</td><td className="num">{fmtMoney(round2(leakUSD))}</td></tr></tfoot>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
