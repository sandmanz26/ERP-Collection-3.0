// Platform (SaaS) reducer: workspaces, sign-up & onboarding, subscriptions & mock billing, operator actions.
// Same conventions as the tenant reducer: validated actions, rejected attempts logged, an audit trail of everything.
import { addDays, diffDays, todayISO } from '../lib/dates.js';
import { round2 } from '../lib/money.js';
import { PLANS, planById, planPrice, TRIAL_DAYS, TRIAL_PLAN, PLATFORM } from './plans.js';
import { slugError, slugify, buildWorkspace, DEFAULT_PROFILE } from './workspace.js';
import { DEMO_PASSWORD } from '../data/accounts.js';

export const PLATFORM_VERSION = 1;
class PlatformError extends Error {}
const must = (cond, msg) => { if (!cond) throw new PlatformError(msg); };
let seq = 0;
const pid = (p) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Mock card validation (Luhn + expiry + CVC). Test cards behave like Stripe's. */
export function validateCard(card = {}, today = todayISO()) {
  const num = String(card.number || '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(num)) return 'Enter a valid card number';
  let sum = 0;
  for (let i = 0; i < num.length; i++) { let d = Number(num[num.length - 1 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  if (sum % 10) return 'That card number is not valid';
  const m = String(card.exp || '').match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return 'Expiry must be MM/YY';
  const expEnd = `20${m[2]}-${m[1]}-28`;
  if (expEnd < today) return 'This card has expired';
  if (!/^\d{3,4}$/.test(String(card.cvc || ''))) return 'Enter the 3–4 digit security code';
  if (num === '4000000000000002') return 'Your card was declined (test card: generic decline)';
  return null;
}
const cardOf = (card) => {
  const num = String(card.number).replace(/\s+/g, '');
  return { brand: num.startsWith('4') ? 'Visa' : num.startsWith('5') ? 'Mastercard' : num.startsWith('3') ? 'Amex' : 'Card', last4: num.slice(-4), exp: card.exp, name: card.name || '', failsRenewal: num === '4000000000000341' };
};
const periodEnd = (from, interval) => addDays(from, interval === 'year' ? 365 : 30);

function invoice(t, { amount, description, date, status = 'paid' }) {
  const n = 1000 + (t.invoices?.length ?? 0) + 1;
  const inv = { id: pid('pin'), number: `${PLATFORM.name.toUpperCase().slice(0, 3)}-${t.slug.toUpperCase().slice(0, 4)}-${n}`, date, amount: round2(amount), currency: 'USD', description, status };
  (t.invoices ??= []).unshift(inv);
  return inv;
}

/** Monthly recurring revenue of one workspace (annual plans normalised to a month). */
export function tenantMrr(t) {
  if (!['active', 'past_due'].includes(t.status)) return 0;
  return round2(planPrice(t.plan, t.interval) / (t.interval === 'year' ? 12 : 1));
}

const H = {
  SIGNUP(st, { name, email, password, company, slug, acceptTerms }, ctx) {
    const mail = String(email || '').trim().toLowerCase();
    must(name && name.trim().length >= 2, 'Tell us your name');
    must(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail), 'Enter a valid work email');
    must(String(password || '').length >= 8, 'Use at least 8 characters for your password');
    must(company && company.trim().length >= 2, 'Enter your company name');
    const s = slugify(slug || company);
    const err = slugError(s, st.tenants.map((t) => t.slug));
    must(!err, err);
    must(acceptTerms, 'Please accept the terms to continue');
    const t = {
      id: pid('tn'), slug: s, name: company.trim(), ownerName: name.trim(), ownerEmail: mail, createdAt: ctx.today,
      plan: TRIAL_PLAN, interval: 'month', status: 'trialing', trialEndsAt: addDays(ctx.today, TRIAL_DAYS), currentPeriodEnd: null, cancelAtPeriodEnd: false,
      card: null, invoices: [], region: 'US', demo: false,
      onboarding: { completed: false, step: 0, profile: { ...DEFAULT_PROFILE }, owner: { name: name.trim(), email: mail, password } },
    };
    st.tenants.push(t);
    st.session.onboardingTenantId = t.id;
    return { summary: `Sign-up: ${t.name} (${t.slug}.${PLATFORM.domain}) by ${mail} — ${TRIAL_DAYS}-day trial started`, tenantId: t.id, actor: mail };
  },
  ONBOARDING_SAVE(st, { tenantId, step, patch }) {
    const t = tenant(st, tenantId);
    must(!t.onboarding.completed, 'Onboarding already completed');
    t.onboarding.profile = { ...t.onboarding.profile, ...patch };
    if (patch.region) t.region = patch.region;
    t.onboarding.step = Math.max(t.onboarding.step, step ?? 0);
    return { summary: `Onboarding step ${(step ?? 0) + 1} saved for ${t.name}`, tenantId, skipToast: true };
  },
  ONBOARDING_COMPLETE(st, { tenantId }, ctx) {
    const t = tenant(st, tenantId);
    must(!t.onboarding.completed, 'Onboarding already completed');
    const p = t.onboarding.profile;
    must(p.eventTypeIds?.length, 'Pick at least one type of event you run');
    const state = buildWorkspace({ owner: t.onboarding.owner, company: { name: t.name }, profile: p }, ctx.today);
    ctx.effects.push({ type: 'saveTenantState', tenantId, state });
    t.onboarding = { completed: true, completedAt: ctx.today, step: 6, profile: { ...p, invites: (p.invites || []).map((i) => ({ email: i.email, role: i.role })) } }; // the owner password lives only in the workspace
    t.region = p.region;
    st.session.onboardingTenantId = null;
    st.session.tenantId = tenantId;
    return { summary: `Workspace ready: ${t.name} (${p.region}, ${p.eventTypeIds.length} event types, ${(p.invites || []).length} invites${p.sample ? ', sample event' : ''})`, tenantId };
  },
  ENTER_WORKSPACE(st, { tenantId }) {
    const t = tenant(st, tenantId);
    must(t.status !== 'suspended', `${t.name} is suspended. Contact ${PLATFORM.supportEmail}.`);
    must(t.onboarding?.completed !== false, 'Finish setting up this workspace first');
    st.session.tenantId = tenantId;
    return { summary: `Opened workspace ${t.name}`, tenantId, skipToast: true, skipLog: true };
  },
  LEAVE_WORKSPACE(st) {
    st.session.tenantId = null;
    return { skipLog: true };
  },
  CHECKOUT(st, { tenantId, planId, interval = 'month', card }, ctx) {
    const t = tenant(st, tenantId);
    must(PLANS.some((p) => p.id === planId), 'Unknown plan');
    must(t.status !== 'suspended', 'This workspace is suspended');
    const usageNow = ctx.usage?.(tenantId);
    const lim = planById(planId).limits;
    if (usageNow && lim.seats !== null) must(usageNow.seats <= lim.seats, `You have ${usageNow.seats} team seats in use; ${planById(planId).name} includes ${lim.seats}. Suspend users first or pick a bigger plan.`);
    if (usageNow && lim.activeEvents !== null) must(usageNow.activeEvents <= lim.activeEvents, `You have ${usageNow.activeEvents} active events; ${planById(planId).name} includes ${lim.activeEvents}.`);
    if (card) { const e = validateCard(card, ctx.today); must(!e, e); t.card = cardOf(card); }
    must(t.card, 'Add a payment method');
    const amount = planPrice(planId, interval);
    invoice(t, { amount, description: `${planById(planId).name} plan — ${interval === 'year' ? 'annual' : 'monthly'}`, date: ctx.today });
    Object.assign(t, { plan: planId, interval, status: 'active', currentPeriodEnd: periodEnd(ctx.today, interval), cancelAtPeriodEnd: false, pastDueSince: null, convertedAt: t.convertedAt ?? ctx.today });
    return { summary: `${t.name} subscribed to ${planById(planId).name} (${interval}ly) — $${amount} charged to ${t.card.brand} •••• ${t.card.last4}`, tenantId };
  },
  PLAN_CHANGE(st, { tenantId, planId, interval }, ctx) {
    const t = tenant(st, tenantId);
    must(t.status === 'active', 'Choose a plan with checkout first');
    const to = planById(planId);
    const iv = interval ?? t.interval;
    must(to.id !== t.plan || iv !== t.interval, `You are already on ${to.name}`);
    const usageNow = ctx.usage?.(tenantId);
    if (usageNow && to.limits.seats !== null) must(usageNow.seats <= to.limits.seats, `${to.name} includes ${to.limits.seats} seats but ${usageNow.seats} are in use. Suspend users first.`);
    if (usageNow && to.limits.activeEvents !== null) must(usageNow.activeEvents <= to.limits.activeEvents, `${to.name} includes ${to.limits.activeEvents} active events but you have ${usageNow.activeEvents}.`);
    // Proration: charge the difference for the rest of the period now; downgrades become credit.
    const total = t.interval === 'year' ? 365 : 30;
    const left = Math.max(0, diffDays(ctx.today, t.currentPeriodEnd));
    const diff = round2(((planPrice(to.id, iv) / (iv === 'year' ? 365 : 30)) - (planPrice(t.plan, t.interval) / total)) * left);
    const from = planById(t.plan).name;
    if (diff > 0) invoice(t, { amount: diff, description: `Upgrade ${from} → ${to.name} (prorated, ${left} days)`, date: ctx.today });
    else if (diff < 0) t.credit = round2((t.credit ?? 0) - diff);
    const intervalChanged = iv !== t.interval;
    Object.assign(t, { plan: to.id, interval: iv });
    if (intervalChanged) t.currentPeriodEnd = periodEnd(ctx.today, iv); // switching monthly ↔ annual starts a new period
    return { summary: `${t.name}: ${from} → ${to.name} (${iv}ly)${diff > 0 ? ` — prorated $${diff} charged` : diff < 0 ? ` — $${-diff} credit for next invoice` : ''}`, tenantId };
  },
  CARD_UPDATE(st, { tenantId, card }, ctx) {
    const t = tenant(st, tenantId);
    const e = validateCard(card, ctx.today);
    must(!e, e);
    t.card = cardOf(card);
    let extra = '';
    if (t.status === 'past_due') {
      const open = t.invoices.find((i) => i.status === 'open');
      if (open) open.status = 'paid';
      Object.assign(t, { status: 'active', pastDueSince: null, currentPeriodEnd: periodEnd(ctx.today, t.interval) });
      extra = ` — outstanding invoice paid, workspace active again`;
    }
    return { summary: `Payment method updated to ${t.card.brand} •••• ${t.card.last4}${extra}`, tenantId };
  },
  SUBSCRIPTION_CANCEL(st, { tenantId, reason }) {
    const t = tenant(st, tenantId);
    must(t.status === 'active', 'There is no active subscription to cancel');
    must(reason, 'Tell us why — it helps us improve');
    Object.assign(t, { cancelAtPeriodEnd: true, cancelReason: reason });
    return { summary: `${t.name} canceled (${reason}) — access until ${t.currentPeriodEnd}`, tenantId };
  },
  SUBSCRIPTION_RESUME(st, { tenantId }) {
    const t = tenant(st, tenantId);
    must(t.cancelAtPeriodEnd, 'The subscription is not set to cancel');
    Object.assign(t, { cancelAtPeriodEnd: false, cancelReason: null });
    return { summary: `${t.name} resumed its ${planById(t.plan).name} plan`, tenantId };
  },
  WORKSPACE_UPDATE(st, { tenantId, name, slug }) {
    const t = tenant(st, tenantId);
    if (name !== undefined) { must(name.trim().length >= 2, 'Workspace name is too short'); t.name = name.trim(); }
    if (slug !== undefined && slug !== t.slug) {
      const err = slugError(slug, st.tenants.filter((x) => x.id !== t.id).map((x) => x.slug));
      must(!err, err);
      t.previousSlugs = [...(t.previousSlugs ?? []), t.slug];
      t.slug = slug;
    }
    return { summary: `Workspace updated: ${t.name} (${t.slug}.${PLATFORM.domain})`, tenantId };
  },
  WORKSPACE_DELETE(st, { tenantId, confirm }, ctx) {
    const t = tenant(st, tenantId);
    must(!t.demo, 'The demo workspace cannot be deleted (use "Reset demo data" instead)');
    must(confirm === t.slug, `Type ${t.slug} to confirm`);
    st.tenants = st.tenants.filter((x) => x.id !== tenantId);
    st.session.tenantId = null;
    ctx.effects.push({ type: 'deleteTenantState', tenantId });
    return { summary: `Workspace ${t.name} deleted by its owner (data erased)`, tenantId };
  },
  /** Daily billing run: trials expire, renewals charge, scheduled cancellations end. */
  PLATFORM_TICK(st, _p, ctx) {
    const notes = [];
    st.tenants.forEach((t) => {
      if (t.status === 'trialing' && t.trialEndsAt < ctx.today) { t.status = 'expired'; notes.push(`${t.name} trial expired`); }
      if (t.status === 'active' && t.currentPeriodEnd && t.currentPeriodEnd <= ctx.today) {
        if (t.cancelAtPeriodEnd) { t.status = 'canceled'; t.canceledAt = ctx.today; notes.push(`${t.name} canceled at period end`); return; }
        const amount = Math.max(0, round2(planPrice(t.plan, t.interval) - (t.credit ?? 0)));
        t.credit = Math.max(0, round2((t.credit ?? 0) - planPrice(t.plan, t.interval)));
        if (!t.card || t.card.failsRenewal) {
          invoice(t, { amount, description: `${planById(t.plan).name} renewal`, date: ctx.today, status: 'open' });
          Object.assign(t, { status: 'past_due', pastDueSince: ctx.today });
          notes.push(`${t.name} renewal failed → past due`);
        } else {
          invoice(t, { amount, description: `${planById(t.plan).name} renewal`, date: ctx.today });
          t.currentPeriodEnd = periodEnd(t.currentPeriodEnd, t.interval);
          notes.push(`${t.name} renewed`);
        }
      }
    });
    return notes.length ? { summary: `Billing run: ${notes.join('; ')}`, actor: 'system' } : { skipLog: true };
  },
  OPERATOR_LOGIN(st, { email, password }) {
    const op = st.operators.find((o) => o.email === String(email || '').trim().toLowerCase());
    must(op && op.password === password, "That email and password don't match an operator account");
    st.session.operator = op.email;
    return { summary: `Operator ${op.email} signed in`, actor: op.email };
  },
  OPERATOR_LOGOUT(st) {
    const who = st.session.operator;
    st.session.operator = null;
    return { summary: `Operator ${who} signed out`, actor: who };
  },
  OP_EXTEND_TRIAL(st, { tenantId, days = 7 }, ctx) {
    opOnly(st);
    const t = tenant(st, tenantId);
    must(['trialing', 'expired'].includes(t.status), 'Only trials can be extended');
    t.trialEndsAt = addDays(t.trialEndsAt < ctx.today ? ctx.today : t.trialEndsAt, days);
    t.status = 'trialing';
    return { summary: `Trial of ${t.name} extended by ${days} days (now ends ${t.trialEndsAt})`, tenantId, actor: st.session.operator };
  },
  OP_SUSPEND(st, { tenantId, reason }) {
    opOnly(st);
    const t = tenant(st, tenantId);
    must(!t.demo, 'The demo workspace cannot be suspended');
    must(reason, 'A reason is required (abuse, fraud, legal request…)');
    Object.assign(t, { statusBeforeSuspend: t.status, status: 'suspended', suspendReason: reason });
    if (st.session.tenantId === tenantId) st.session.tenantId = null;
    return { summary: `Workspace ${t.name} SUSPENDED: ${reason}`, tenantId, actor: st.session.operator };
  },
  OP_REACTIVATE(st, { tenantId }) {
    opOnly(st);
    const t = tenant(st, tenantId);
    must(t.status === 'suspended', 'Workspace is not suspended');
    Object.assign(t, { status: t.statusBeforeSuspend ?? 'active', suspendReason: null });
    return { summary: `Workspace ${t.name} reactivated`, tenantId, actor: st.session.operator };
  },
  OP_SET_PLAN(st, { tenantId, planId }, ctx) {
    opOnly(st);
    const t = tenant(st, tenantId);
    must(PLANS.some((p) => p.id === planId), 'Unknown plan');
    const from = planById(t.plan).name;
    Object.assign(t, { plan: planId, comped: true });
    if (['expired', 'canceled'].includes(t.status)) Object.assign(t, { status: 'active', currentPeriodEnd: periodEnd(ctx.today, t.interval) });
    return { summary: `${t.name} plan set by operator: ${from} → ${planById(planId).name} (complimentary)`, tenantId, actor: st.session.operator };
  },
  PLATFORM_RESET(st, _p, ctx) {
    const fresh = buildPlatformSeed(ctx.today);
    Object.assign(st, fresh);
    ctx.effects.push({ type: 'resetAllTenants' });
    return { summary: 'Platform demo data reset', actor: 'system' };
  },
};

function tenant(st, id) {
  const t = st.tenants.find((x) => x.id === id);
  must(t, 'Workspace not found');
  return t;
}
function opOnly(st) { must(st.session.operator, 'Operator sign-in required'); }

/** ctx.usage(tenantId) is injected by the provider (it reads tenant storage) so plan limits can be checked. */
export function platformReducer(state, action, extra = {}) {
  const h = H[action.type];
  if (!h) return state;
  const draft = structuredClone(state);
  const ctx = { today: extra.today ?? todayISO(), effects: [], usage: extra.usage };
  try {
    const r = h(draft, action.payload || {}, ctx) || {};
    draft.effects = ctx.effects;
    if (!r.skipLog) draft.log.unshift({ id: pid('plog'), ts: new Date().toISOString(), type: action.type, tenantId: r.tenantId ?? action.payload?.tenantId ?? null, actor: r.actor ?? (state.session.operator || 'workspace owner'), summary: r.summary ?? action.type, status: 'ok' });
    draft.log = draft.log.slice(0, 500);
    draft.lastError = null;
    draft.lastOk = r.skipToast || r.skipLog ? null : { type: action.type, summary: r.summary, ts: Date.now() };
    return draft;
  } catch (err) {
    if (!(err instanceof PlatformError)) console.error(err);
    const next = { ...state, effects: [] };
    next.log = [{ id: pid('plog'), ts: new Date().toISOString(), type: action.type, tenantId: action.payload?.tenantId ?? null, actor: state.session.operator || action.payload?.email || 'visitor', summary: `REJECTED: ${err.message}`, status: 'rejected' }, ...state.log].slice(0, 500);
    next.lastError = { type: action.type, message: err.message, ts: Date.now() };
    next.lastOk = null;
    return next;
  }
}

/** Demo platform: the rich demo workspace plus customers in every subscription state (for the operator console). */
export function buildPlatformSeed(today = todayISO()) {
  const monthly = (t, planId, months, from) => {
    for (let i = months - 1; i >= 0; i--) invoice(t, { amount: planPrice(planId, 'month'), description: `${planById(planId).name} plan — monthly`, date: addDays(from, -30 * i) });
  };
  const owner = (name, email) => ({ name, email, password: DEMO_PASSWORD });
  const tenants = [];
  const lumiere = { id: PLATFORM.demoTenantId, slug: 'lumiere', name: 'Lumière Events Co.', ownerName: 'Olivia Hart', ownerEmail: 'olivia@lumiere.events', createdAt: addDays(today, -270), plan: 'studio', interval: 'month', status: 'active', trialEndsAt: addDays(today, -256), convertedAt: addDays(today, -256), currentPeriodEnd: addDays(today, 12), cancelAtPeriodEnd: false, card: { brand: 'Visa', last4: '4242', exp: '08/28', name: 'Olivia Hart' }, invoices: [], region: 'US', demo: true, onboarding: { completed: true, completedAt: addDays(today, -270) } };
  monthly(lumiere, 'studio', 9, addDays(today, -18));
  tenants.push(lumiere);
  const lazy = (o) => ({ cancelAtPeriodEnd: false, invoices: [], demo: false, card: null, interval: 'month', currentPeriodEnd: null, ...o, onboarding: { completed: true, completedAt: o.createdAt, profile: { ...DEFAULT_PROFILE, ...o.profile } } });
  const bali = lazy({ id: 'tn_balibliss', slug: 'balibliss', name: 'Bali Bliss Weddings', ownerName: 'Putri Ayu', ownerEmail: 'putri@balibliss.id', createdAt: addDays(today, -5), plan: TRIAL_PLAN, status: 'trialing', trialEndsAt: addDays(today, 9), region: 'ID', profile: { region: 'ID', eventTypeIds: ['wedding', 'birthday'], jurisdictionId: 'ID-BALI', brandColor: 'emerald' }, seedOwner: owner('Putri Ayu', 'putri@balibliss.id') });
  const north = lazy({ id: 'tn_northwind', slug: 'northwind', name: 'Northwind Corporate Events', ownerName: 'Oliver Grant', ownerEmail: 'oliver@northwind-events.co.uk', createdAt: addDays(today, -420), plan: 'agency', interval: 'year', status: 'active', trialEndsAt: addDays(today, -406), convertedAt: addDays(today, -406), currentPeriodEnd: addDays(today, 40), card: { brand: 'Mastercard', last4: '4444', exp: '11/27' }, region: 'UK', profile: { region: 'UK', eventTypeIds: ['conference', 'product_launch', 'offsite'], brandColor: 'ocean', paymentScheduleId: 'ps_corporate' }, seedOwner: owner('Oliver Grant', 'oliver@northwind-events.co.uk') });
  invoice(north, { amount: planPrice('agency', 'year'), description: 'Agency plan — annual', date: addDays(today, -390) });
  invoice(north, { amount: planPrice('agency', 'year'), description: 'Agency plan — annual', date: addDays(today, -25) });
  const petal = lazy({ id: 'tn_petal', slug: 'petalandpine', name: 'Petal & Pine Studio', ownerName: 'Grace Lee', ownerEmail: 'grace@petalandpine.com.au', createdAt: addDays(today, -95), plan: 'starter', status: 'past_due', pastDueSince: addDays(today, -3), trialEndsAt: addDays(today, -81), convertedAt: addDays(today, -81), currentPeriodEnd: addDays(today, -3), card: { brand: 'Visa', last4: '0341', exp: '02/27', failsRenewal: true }, region: 'AU', profile: { region: 'AU', eventTypeIds: ['wedding'], brandColor: 'rose' }, seedOwner: owner('Grace Lee', 'grace@petalandpine.com.au') });
  monthly(petal, 'starter', 2, addDays(today, -33));
  invoice(petal, { amount: planPrice('starter'), description: 'Starter renewal', date: addDays(today, -3), status: 'open' });
  const oldtown = lazy({ id: 'tn_oldtown', slug: 'oldtown', name: 'Old Town Parties', ownerName: 'Lena Vogel', ownerEmail: 'lena@oldtown-parties.de', createdAt: addDays(today, -160), plan: 'starter', status: 'canceled', canceledAt: addDays(today, -30), cancelReason: 'Too expensive for our volume', trialEndsAt: addDays(today, -146), convertedAt: addDays(today, -146), currentPeriodEnd: addDays(today, -30), card: { brand: 'Visa', last4: '1881', exp: '05/27' }, region: 'EU', profile: { region: 'EU', eventTypeIds: ['birthday', 'wedding'], jurisdictionId: 'EU-DE' }, seedOwner: owner('Lena Vogel', 'lena@oldtown-parties.de') });
  monthly(oldtown, 'starter', 4, addDays(today, -60));
  const sunset = lazy({ id: 'tn_sunset', slug: 'sunsetcoast', name: 'Sunset Coast Events', ownerName: 'Marco Diaz', ownerEmail: 'marco@sunsetcoast.events', createdAt: addDays(today, -16), plan: TRIAL_PLAN, status: 'expired', trialEndsAt: addDays(today, -2), region: 'US', profile: { region: 'US', eventTypeIds: ['wedding', 'birthday'], jurisdictionId: 'US-FL-MIA' }, seedOwner: owner('Marco Diaz', 'marco@sunsetcoast.events') });
  tenants.push(bali, north, petal, oldtown, sunset);
  return {
    version: PLATFORM_VERSION,
    tenants,
    operators: [{ email: `operator@${PLATFORM.domain}`, password: DEMO_PASSWORD, name: 'Platform Ops' }],
    session: { tenantId: null, operator: null, onboardingTenantId: null },
    log: [{ id: 'plog_seed', ts: new Date().toISOString(), type: 'SEED', tenantId: null, actor: 'system', summary: `${PLATFORM.name} demo platform loaded (${tenants.length} workspaces)`, status: 'ok' }],
    effects: [],
  };
}
