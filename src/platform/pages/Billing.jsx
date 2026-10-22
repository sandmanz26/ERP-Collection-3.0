import React, { useEffect, useState } from 'react';
import { Card, Badge, Button, Alert, Field, Modal, ProgressBar, Callout, Icon, useDialog, printDocument, escapeHtml } from '../../design-system/index.js';
import { useStore } from '../../store/AppStore.jsx';
import { usePlatform, useWorkspace } from '../PlatformStore.jsx';
import { usage } from '../entitlements.js';
import { PLATFORM, PLANS, planById, planPrice, BRAND_COLORS, FEATURES } from '../plans.js';
import { slugify } from '../workspace.js';
import { fmtMoney } from '../../lib/money.js';
import { fmtDate } from '../../lib/dates.js';
import { IntervalToggle, PricingCards } from './SiteChrome.jsx';

const usd = (n) => fmtMoney(n, 'USD');
const STATUS_TONE = { trialing: 'info', active: 'ok', past_due: 'warn', expired: 'danger', canceled: 'danger' };

/** Settings → Plan & billing (workspace admins). Subscription data lives in the platform layer, not in the workspace. */
export default function BillingPanel() {
  const { pstate, pact } = usePlatform();
  const { tenant: t, ent } = useWorkspace();
  const { state } = useStore();
  const dialog = useDialog();
  const [interval, setIv] = useState(t.interval ?? 'month');
  const [checkout, setCheckout] = useState(null); // { planId } or { cardOnly: true }
  const use = usage(state);
  const active = ent.status === 'active' || ent.status === 'past_due';
  const err = pstate.lastError && ['PLAN_CHANGE', 'SUBSCRIPTION_CANCEL', 'SUBSCRIPTION_RESUME', 'WORKSPACE_UPDATE', 'WORKSPACE_DELETE'].includes(pstate.lastError.type) ? pstate.lastError.message : null;
  const ok = pstate.lastOk && Date.now() - pstate.lastOk.ts < 6000 && ['CHECKOUT', 'PLAN_CHANGE', 'CARD_UPDATE', 'SUBSCRIPTION_CANCEL', 'SUBSCRIPTION_RESUME', 'WORKSPACE_UPDATE'].includes(pstate.lastOk.type) ? pstate.lastOk.summary : null;

  const choose = async (p) => {
    if (!active || ent.status === 'past_due') return setCheckout({ planId: p.id });
    const up = planPrice(p.id, interval) > planPrice(t.plan, t.interval);
    if (await dialog.confirm({ title: `${up ? 'Upgrade' : 'Switch'} to ${p.name}?`, message: up ? `You'll be charged the prorated difference today (card •••• ${t.card?.last4}). New limits apply immediately.` : 'The unused part of your current plan becomes credit on your next invoice. Make sure you are within the new limits.' })) pact('PLAN_CHANGE', { tenantId: t.id, planId: p.id, interval });
  };
  const ctaFor = (p) => {
    if (p.id === t.plan && active && interval === t.interval) return 'Current plan';
    if (!active) return `Choose ${p.name}`;
    return planPrice(p.id, interval) >= planPrice(t.plan, t.interval) ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
  };
  const cancel = async () => {
    const r = await dialog.form({ title: 'Cancel your subscription?', fields: [{ name: 'reason', label: `Your workspace stays active until ${fmtDate(t.currentPeriodEnd)}, then becomes read-only. Why are you leaving?`, type: 'select', options: ['Too expensive for our volume', 'Missing a feature we need', 'Switching to another tool', 'Business closed / paused', 'Other'], defaultValue: 'Missing a feature we need' }] });
    r && pact('SUBSCRIPTION_CANCEL', { tenantId: t.id, reason: r.reason });
  };
  const meters = [
    ['Team seats', use.seats, ent.limits.seats, 'Clients, vendors and day-of crew are free'],
    ['Active events', use.activeEvents, ent.limits.activeEvents, 'Archived, lost and cancelled events don\'t count'],
  ];
  return (
    <div className="stack">
      {err && <Alert tone="danger">{err}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      <div className="grid g2">
        <Card title="Subscription" actions={<Badge tone={STATUS_TONE[ent.status]}>{ent.status.replace('_', ' ')}</Badge>}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>{ent.plan.name}{ent.status === 'trialing' && ' trial'}</div>
          <div className="muted">
            {ent.status === 'trialing' && <>Trial ends {fmtDate(t.trialEndsAt)} ({ent.trialDaysLeft} days left). No card on file — pick a plan any time.</>}
            {ent.status === 'expired' && <>Trial ended {fmtDate(t.trialEndsAt)}. Read-only until you choose a plan.</>}
            {ent.status === 'active' && <>{usd(planPrice(t.plan, t.interval))} / {t.interval === 'year' ? 'year' : 'month'} · {t.cancelAtPeriodEnd ? `ends ${fmtDate(t.currentPeriodEnd)}` : `renews ${fmtDate(t.currentPeriodEnd)}`}{t.credit ? ` · ${usd(t.credit)} credit` : ''}</>}
            {ent.status === 'past_due' && <>Renewal failed {fmtDate(t.pastDueSince)}. Update the card before {fmtDate(ent.graceEnds)}.</>}
            {ent.status === 'canceled' && <>Ended {fmtDate(t.canceledAt ?? t.currentPeriodEnd)}{t.cancelReason ? ` (${t.cancelReason})` : ''}. Read-only — choose a plan to reactivate.</>}
          </div>
          <div className="row mt" style={{ gap: 8 }}>
            {!active && <Button variant="primary" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>Choose a plan</Button>}
            {ent.status === 'past_due' && <Button variant="primary" onClick={() => setCheckout({ cardOnly: true })}>Update card & pay</Button>}
            {ent.status === 'active' && !t.cancelAtPeriodEnd && <Button variant="ghost" onClick={cancel}>Cancel subscription</Button>}
            {t.cancelAtPeriodEnd && ent.status === 'active' && <Button variant="primary" onClick={() => pact('SUBSCRIPTION_RESUME', { tenantId: t.id })}>Resume plan</Button>}
          </div>
        </Card>
        <Card title="Usage">
          <div className="stack" style={{ gap: 14 }}>
            {meters.map(([label, n, lim, hint]) => (
              <div key={label} className="meter">
                <div className="meter-head"><b>{label}</b><span>{n} / {lim ?? '∞'}</span></div>
                <ProgressBar value={lim ? (n / lim) * 100 : 8} tone={lim && n >= lim ? 'danger' : lim && n / lim > 0.8 ? 'warn' : 'ok'} />
                <span className="faint text-xs">{hint}</span>
              </div>
            ))}
            <div className="faint text-sm">{use.portalUsers} portal & crew accounts (free) · {use.clients} clients · {use.vendors} vendors · {use.storageKb} KB stored</div>
          </div>
        </Card>
      </div>

      <Card title="Plans" className="mt">
        <div id="plans" />
        <IntervalToggle value={interval} onChange={setIv} />
        <PricingCards interval={interval} currentPlanId={active ? t.plan : null} ctaFor={ctaFor} onChoose={choose} />
      </Card>

      <div className="grid g2 mt">
        <Card title="Payment method" actions={t.card && <Button size="sm" onClick={() => setCheckout({ cardOnly: true })}>Update</Button>}>
          {t.card ? <div className="row" style={{ gap: 10 }}><Icon name="wallet" size={18} /><b>{t.card.brand} •••• {t.card.last4}</b><span className="faint">expires {t.card.exp}</span></div> : <div className="faint">No card on file.</div>}
          <div className="faint text-xs mt">Billed in USD by {PLATFORM.name}. Your clients pay you separately, in {state.settings.company.baseCurrency}.</div>
        </Card>
        <Card title="Invoices">
          {!(t.invoices || []).length ? <div className="faint">No invoices yet.</div> : (
            <table className="t"><tbody>{t.invoices.map((i) => (
              <tr key={i.id}><td className="nowrap">{fmtDate(i.date)}</td><td>{i.description}<div className="faint text-xs">{i.number}</div></td><td className="num">{usd(i.amount)}</td><td><Badge tone={i.status === 'paid' ? 'ok' : 'warn'}>{i.status}</Badge></td>
                <td><Button size="sm" variant="ghost" onClick={() => printDocument(i.number, `<h1>${escapeHtml(PLATFORM.name)} — Invoice ${escapeHtml(i.number)}</h1><p>${escapeHtml(t.name)} (${escapeHtml(t.slug)}.${PLATFORM.domain})</p><p>Date: ${escapeHtml(i.date)}</p><table><tr><td>${escapeHtml(i.description)}</td><td style="text-align:right">${usd(i.amount)}</td></tr></table><p>Status: ${escapeHtml(i.status)}</p>`)}>PDF</Button></td></tr>
            ))}</tbody></table>
          )}
        </Card>
      </div>

      <div className="grid g2 mt">
        <WorkspaceCard />
        <BrandingCard />
      </div>
      <DangerZone />
      {checkout && <Checkout planId={checkout.planId} cardOnly={checkout.cardOnly} interval={interval} onClose={() => setCheckout(null)} />}
    </div>
  );
}

function Checkout({ planId, cardOnly, interval, onClose }) {
  const { pstate, pact } = usePlatform();
  const { tenant: t } = useWorkspace();
  const [card, setCard] = useState({ name: t.ownerName, number: '', exp: '', cvc: '' });
  const [sent, setSent] = useState(false);
  const type = cardOnly ? 'CARD_UPDATE' : 'CHECKOUT';
  const err = sent && pstate.lastError?.type === type ? pstate.lastError.message : null;
  useEffect(() => { if (sent && pstate.lastOk?.type === type) onClose(); }, [sent, pstate.lastOk, type, onClose]);
  const p = planId ? planById(planId) : null;
  const set = (k) => (e) => setCard({ ...card, [k]: k === 'number' ? e.target.value.replace(/[^\d ]/g, '').slice(0, 23) : e.target.value });
  const pay = (e) => { e.preventDefault(); setSent(true); pact(type, cardOnly ? { tenantId: t.id, card } : { tenantId: t.id, planId, interval, card }); };
  return (
    <Modal title={cardOnly ? 'Payment method' : `Subscribe to ${p.name}`} onClose={onClose}>
      <form className="stack" style={{ gap: 12 }} onSubmit={pay}>
        {!cardOnly && <Callout tone="info" icon="wallet" title={`${usd(planPrice(planId, interval))} today, then every ${interval === 'year' ? 'year' : 'month'}`}>{p.name} · {p.limits.seats ?? 'unlimited'} seats · {p.features.map((f) => FEATURES[f].label).slice(0, 3).join(', ')}{p.features.length > 3 ? '…' : ''}. Cancel any time.</Callout>}
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label="Name on card"><input value={card.name} onChange={set('name')} autoComplete="cc-name" /></Field>
        <Field label="Card number"><input value={card.number} onChange={set('number')} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" /></Field>
        <div className="grid g2">
          <Field label="Expiry (MM/YY)"><input value={card.exp} onChange={set('exp')} autoComplete="cc-exp" placeholder="12/29" /></Field>
          <Field label="CVC"><input value={card.cvc} onChange={set('cvc')} inputMode="numeric" autoComplete="cc-csc" placeholder="123" /></Field>
        </div>
        <div className="faint text-xs">Mock checkout — no card is charged. Test cards: 4242 4242 4242 4242 (succeeds) · 4000 0000 0000 0002 (declined) · 4000 0000 0000 0341 (succeeds, then fails at renewal).</div>
        <Button variant="primary" type="submit" className="auth-submit">{cardOnly ? 'Save card' : `Pay ${usd(planPrice(planId, interval))}`}</Button>
      </form>
    </Modal>
  );
}

function WorkspaceCard() {
  const { pstate, pact } = usePlatform();
  const { tenant: t } = useWorkspace();
  const [name, setName] = useState(t.name);
  const [slug, setSlug] = useState(t.slug);
  return (
    <Card title="Workspace">
      <div className="stack" style={{ gap: 10 }}>
        <Field label="Workspace name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Workspace URL" hint="Old links keep redirecting for 30 days (mock)"><div className="slug-field"><input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} aria-label="Workspace URL" /><span>.{PLATFORM.domain}</span></div></Field>
        <div><Button disabled={name === t.name && slug === t.slug} onClick={() => pact('WORKSPACE_UPDATE', { tenantId: t.id, name, slug })}>Save</Button></div>
        <div className="faint text-xs">Region and currency are fixed at creation because invoices and taxes depend on them. Workspace ID: {t.id}</div>
      </div>
    </Card>
  );
}

function BrandingCard() {
  const { state, act } = useStore();
  const { ent } = useWorkspace();
  const [msg, setMsg] = useState(state.settings.company.portalWelcome ?? '');
  const can = ent.features.has('branding');
  return (
    <Card title="Branding" actions={!can && <Badge tone="brand">Studio+</Badge>}>
      <div className="swatches" role="radiogroup" aria-label="Brand color">
        {BRAND_COLORS.map((b) => <button key={b.id} type="button" role="radio" aria-checked={state.settings.company.brandColor === b.id} aria-label={b.label} disabled={!can} className={`swatch-btn ${(state.settings.company.brandColor ?? 'violet') === b.id ? 'on' : ''}`} style={{ background: b.brand, opacity: can ? 1 : 0.4 }} onClick={() => act('BRANDING_SET', { brandColor: b.id })} />)}
      </div>
      <Field label="Client portal welcome message" style={{ marginTop: 12 }}><textarea rows={2} value={msg} disabled={!can} maxLength={280} onChange={(e) => setMsg(e.target.value)} /></Field>
      <Button className="mt" disabled={!can || msg === (state.settings.company.portalWelcome ?? '')} onClick={() => act('BRANDING_SET', { portalWelcome: msg })}>Save message</Button>
      {!can && <div className="faint text-xs mt">Custom branding is included from Studio.</div>}
    </Card>
  );
}

function DangerZone() {
  const { pact } = usePlatform();
  const { tenant: t, isDemo } = useWorkspace();
  const dialog = useDialog();
  if (isDemo) return null;
  const del = async () => {
    const r = await dialog.form({ title: `Delete ${t.name}?`, fields: [{ name: 'confirm', label: `This erases every event, client, invoice and user in this workspace and cannot be undone. Type ${t.slug} to confirm.`, required: true }] });
    r && pact('WORKSPACE_DELETE', { tenantId: t.id, confirm: r.confirm.trim() });
  };
  return (
    <Card title="Danger zone" className="mt">
      <div className="row between"><span className="muted">Export first (Activity log → Export, reports → CSV). Deleting is permanent.</span><Button variant="danger" onClick={del}>Delete workspace</Button></div>
    </Card>
  );
}
