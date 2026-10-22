import React, { useMemo, useState } from 'react';
import { Button, Field, Alert, Badge, Card, StatTile, BarChart, Icon, useDialog } from '../../design-system/index.js';
import { usePlatform, loadTenantState } from '../PlatformStore.jsx';
import { usage } from '../entitlements.js';
import { tenantMrr } from '../platformReducer.js';
import { entitlement } from '../entitlements.js';
import { PLATFORM, PLANS, planById } from '../plans.js';
import { fmtMoney } from '../../lib/money.js';
import { fmtDate, fmtDateTime, monthKey, addDays } from '../../lib/dates.js';
import { SiteLogo } from './SiteChrome.jsx';

const STATUS_TONE = { trialing: 'info', active: 'ok', past_due: 'warn', expired: 'danger', canceled: 'danger', suspended: 'danger' };
const usd = (n) => fmtMoney(n, 'USD', { whole: true });

/** The SaaS owner's console: revenue, trials, churn and every workspace — separate from any tenant's data. */
export default function Operator() {
  const { pstate, pact } = usePlatform();
  if (!pstate.session.operator) return <OperatorLogin />;
  return <Console />;
}

function OperatorLogin() {
  const { pstate, pact } = usePlatform();
  const [f, setF] = useState({ email: `operator@${PLATFORM.domain}`, password: '' });
  const err = pstate.lastError?.type === 'OPERATOR_LOGIN' ? pstate.lastError.message : null;
  return (
    <div className="site" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <form className="card stack" style={{ width: 'min(420px, 100%)', gap: 14 }} onSubmit={(e) => { e.preventDefault(); pact('OPERATOR_LOGIN', f); }}>
        <SiteLogo />
        <div><h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500 }}>Platform operator</h2><div className="muted text-sm">For the {PLATFORM.name} team only. Workspace users sign in from their own workspace.</div></div>
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" hint="Demo: demo1234"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoFocus /></Field>
        <Button variant="primary" className="auth-submit" type="submit">Sign in</Button>
      </form>
    </div>
  );
}

function Console() {
  const { pstate, pact, today } = usePlatform();
  const dialog = useDialog();
  const [filter, setFilter] = useState('all');
  const rows = useMemo(() => pstate.tenants.map((t) => ({ t, ent: entitlement(t, today), mrr: tenantMrr(t), use: usage(loadTenantState(t)) })), [pstate.tenants, today]);
  const mrr = rows.reduce((a, r) => a + r.mrr, 0);
  const paying = rows.filter((r) => r.mrr > 0).length;
  const trials = rows.filter((r) => r.ent.status === 'trialing').length;
  const everTrialEnded = rows.filter((r) => r.t.convertedAt || ['expired'].includes(r.ent.status)).length;
  const converted = rows.filter((r) => r.t.convertedAt).length;
  const churned = rows.filter((r) => r.t.status === 'canceled');
  const pastDue = rows.filter((r) => r.t.status === 'past_due');
  const months = useMemo(() => {
    const by = {};
    for (let i = 11; i >= 0; i--) by[monthKey(addDays(today, -30 * i))] = 0;
    pstate.tenants.forEach((t) => (t.invoices || []).filter((i) => i.status === 'paid').forEach((i) => { const m = monthKey(i.date); if (m in by) by[m] += i.amount; }));
    return Object.entries(by).map(([m, v]) => ({ label: m, value: Math.round(v), display: usd(v) }));
  }, [pstate.tenants, today]);
  const shown = rows.filter((r) => filter === 'all' || r.ent.status === filter);
  const suspend = async (t) => { const r = await dialog.form({ title: `Suspend ${t.name}?`, fields: [{ name: 'reason', label: 'Reason (shown to the owner)', type: 'select', options: ['Terms of service violation', 'Suspected fraud', 'Chargeback dispute', 'Legal request'], defaultValue: 'Terms of service violation' }] }); r && pact('OP_SUSPEND', { tenantId: t.id, reason: r.reason }); };
  return (
    <div className="site">
      <header className="site-nav"><div className="site-wrap"><SiteLogo /><Badge tone="brand">Operator console</Badge><span className="grow" /><span className="faint text-sm">{pstate.session.operator}</span><Button variant="ghost" onClick={() => pact('OPERATOR_LOGOUT')}><Icon name="logout" size={15} /> Sign out</Button></div></header>
      <main className="site-wrap" style={{ padding: '28px 0 48px' }}>
        {pstate.lastError && <Alert tone="danger">{pstate.lastError.message}</Alert>}
        {pstate.lastOk && <Alert tone="success">{pstate.lastOk.summary}</Alert>}
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <StatTile label="MRR" value={usd(mrr)} sub={`ARR ${usd(mrr * 12)}`} />
          <StatTile label="Paying workspaces" value={paying} sub={`${rows.length} total`} />
          <StatTile label="Active trials" value={trials} sub={`${rows.filter((r) => r.ent.status === 'expired').length} expired unconverted`} />
          <StatTile label="Trial → paid" value={`${everTrialEnded ? Math.round((converted / everTrialEnded) * 100) : 0}%`} sub={`${converted} of ${everTrialEnded} finished trials`} />
          <StatTile label="Past due" value={pastDue.length} sub={usd(pastDue.reduce((a, r) => a + r.mrr, 0)) + ' MRR at risk'} tone={pastDue.length ? 'warn' : undefined} />
          <StatTile label="Churned" value={churned.length} sub={churned.map((r) => r.t.cancelReason).filter(Boolean)[0] ?? '—'} tone={churned.length ? 'danger' : undefined} />
        </div>
        <div className="grid g2 mt">
          <Card title="Revenue collected by month (USD)"><BarChart rows={months} /></Card>
          <Card title="Plan mix">
            {PLANS.map((p) => { const n = rows.filter((r) => r.t.plan === p.id && ['active', 'past_due'].includes(r.t.status)).length; return <div key={p.id} className="row between" style={{ padding: '6px 0' }}><span><b>{p.name}</b> <span className="faint">${p.price}/mo</span></span><span>{n} workspace{n === 1 ? '' : 's'} · {usd(rows.filter((r) => r.t.plan === p.id).reduce((a, r) => a + r.mrr, 0))} MRR</span></div>; })}
            <div className="faint text-xs mt">Trials run on Studio; expired trials and canceled workspaces keep their data read-only.</div>
          </Card>
        </div>
        <Card title={`Workspaces (${shown.length})`} className="mt" actions={<select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">{['all', 'trialing', 'active', 'past_due', 'expired', 'canceled', 'suspended'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>}>
          <div className="table-wrap">
            <table className="t op-table">
              <thead><tr><th>Workspace</th><th>Owner</th><th>Region</th><th>Plan</th><th>Status</th><th className="num">Seats</th><th className="num">Active events</th><th className="num">MRR</th><th>Created</th><th>Trial / renewal</th><th /></tr></thead>
              <tbody>{shown.map(({ t, ent, mrr: m, use }) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b>{t.demo && <Badge tone="brand">demo</Badge>}<div className="faint text-xs">{t.slug}.{PLATFORM.domain}</div></td>
                  <td>{t.ownerName}<div className="faint text-xs">{t.ownerEmail}</div></td>
                  <td>{t.region}</td>
                  <td>{planById(ent.planId).name}{t.interval === 'year' && <span className="faint"> · annual</span>}{t.comped && <Badge>comp</Badge>}</td>
                  <td><Badge tone={STATUS_TONE[ent.status]}>{ent.status.replace('_', ' ')}</Badge>{t.suspendReason && <div className="faint text-xs">{t.suspendReason}</div>}{t.cancelAtPeriodEnd && <div className="faint text-xs">cancels at period end</div>}</td>
                  <td className="num">{use.seats}/{ent.limits.seats ?? '∞'}</td>
                  <td className="num">{use.activeEvents}/{ent.limits.activeEvents ?? '∞'}</td>
                  <td className="num">{usd(m)}</td>
                  <td>{fmtDate(t.createdAt)}</td>
                  <td>{ent.status === 'trialing' || ent.status === 'expired' ? `trial ${ent.status === 'expired' ? 'ended' : 'ends'} ${fmtDate(t.trialEndsAt)}` : ent.status === 'past_due' ? `payment failed ${fmtDate(t.pastDueSince)}` : ent.status === 'canceled' ? `ended ${fmtDate(t.canceledAt ?? t.currentPeriodEnd)}` : ent.status === 'suspended' ? '—' : t.currentPeriodEnd ? `${t.cancelAtPeriodEnd ? 'ends' : 'renews'} ${fmtDate(t.currentPeriodEnd)}` : '—'}</td>
                  <td className="op-actions"><div>
                    {['trialing', 'expired'].includes(ent.status) && <Button size="sm" onClick={() => pact('OP_EXTEND_TRIAL', { tenantId: t.id, days: 7 })}>+7 days</Button>}
                    {t.status === 'suspended' ? <Button size="sm" onClick={() => pact('OP_REACTIVATE', { tenantId: t.id })}>Reactivate</Button> : !t.demo && <Button size="sm" variant="ghost" onClick={() => suspend(t)}>Suspend</Button>}
                    <select aria-label={`Set plan for ${t.name}`} value="" onChange={(e) => e.target.value && pact('OP_SET_PLAN', { tenantId: t.id, planId: e.target.value })}><option value="">Comp plan…</option>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Platform activity" className="mt" actions={<Button size="sm" variant="ghost" onClick={async () => { if (await dialog.confirm({ title: 'Reset demo platform?', message: 'All workspaces, sign-ups and billing return to the demo data.' })) pact('PLATFORM_RESET'); }}>Reset demo platform</Button>}>
          <table className="t"><tbody>{pstate.log.slice(0, 25).map((l) => <tr key={l.id}><td className="nowrap text-sm">{fmtDateTime(l.ts)}</td><td><Badge tone={l.status === 'rejected' ? 'danger' : undefined}>{l.type}</Badge></td><td>{l.summary}</td><td className="faint text-sm">{l.actor}</td></tr>)}</tbody></table>
        </Card>
      </main>
    </div>
  );
}
