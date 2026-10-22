import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { platformReducer, buildPlatformSeed, tenantMrr, validateCard } from '../src/platform/platformReducer.js';
import { entitlement, checkAction, usage } from '../src/platform/entitlements.js';
import { buildWorkspace, slugError } from '../src/platform/workspace.js';
import { reducer } from '../src/store/reducer.js';
import { calcTax } from '../src/lib/pricing.js';
import { addDays, todayISO } from '../src/lib/dates.js';

const today = todayISO();
const run = (s, type, payload, extra = {}) => platformReducer(s, { type, payload }, { today, ...extra });
const T = (s, id) => s.tenants.find((t) => t.id === id);
const owner = { name: 'Putri Ayu', email: 'putri@example.id', password: 'secret123' };

test('sign-up validates input and starts a trial without a card', () => {
  let s = buildPlatformSeed(today);
  s = run(s, 'SIGNUP', { name: 'P', email: 'bad', password: 'x', company: 'Bali Bliss', acceptTerms: true });
  assert.ok(s.lastError, 'invalid sign-up is rejected');
  assert.equal(s.log[0].status, 'rejected');
  s = run(s, 'SIGNUP', { name: 'Putri', email: 'putri@example.id', password: 'secret123', company: 'Bali Bliss', slug: 'lumiere', acceptTerms: true });
  assert.match(s.lastError.message, /taken/);
  assert.equal(slugError('admin'), 'That URL is reserved');
  s = run(s, 'SIGNUP', { name: 'Putri', email: 'Putri@Example.id', password: 'secret123', company: 'Bali Bliss Studio', acceptTerms: true });
  const t = s.tenants.at(-1);
  assert.equal(t.slug, 'bali-bliss-studio');
  assert.equal(t.status, 'trialing');
  assert.equal(t.card, null);
  assert.equal(t.trialEndsAt, addDays(today, 14));
  assert.equal(s.session.onboardingTenantId, t.id);
});

test('onboarding builds a configured, isolated workspace and signs the owner in', () => {
  let s = buildPlatformSeed(today);
  s = run(s, 'SIGNUP', { name: 'Putri Ayu', email: 'putri@example.id', password: 'secret123', company: 'Bali Bliss', acceptTerms: true });
  const id = s.session.onboardingTenantId;
  s = run(s, 'ONBOARDING_SAVE', { tenantId: id, step: 1, patch: { region: 'ID', eventTypeIds: ['wedding'], jurisdictionId: 'ID-BALI', invites: [{ email: 'made@example.id', role: 'planner' }], sample: true } });
  s = run(s, 'ONBOARDING_COMPLETE', { tenantId: id });
  const ws = s.effects.find((e) => e.type === 'saveTenantState').state;
  assert.equal(s.session.tenantId, id, 'owner lands in the new workspace');
  assert.equal(ws.settings.company.baseCurrency, 'IDR');
  assert.equal(ws.settings.defaults.jurisdictionId, 'ID-BALI');
  assert.deepEqual(ws.settings.eventTypes.map((e) => e.id), ['wedding']);
  assert.equal(ws.users.find((u) => u.id === ws.currentUserId).email, 'putri@example.id');
  assert.equal(ws.users.find((u) => u.email === 'made@example.id').status, 'invited');
  assert.equal(ws.events[0].currency, 'IDR');
  assert.equal(ws.events[0].dateStatus, 'hold', 'sample lead went through the real reducer (hold placed)');
  assert.ok(!JSON.stringify(T(s, id)).includes('secret123'), 'the owner password is not kept in the platform record');
  assert.ok(ws.settings.catalog.find((c) => c.id === 'svc_planning').unitPrice > 1_000_000, 'catalog priced in rupiah');
});

test('new leads use the workspace currency, tax and owner — not the demo defaults', () => {
  let ws = buildWorkspace({ owner, company: { name: 'Bali Bliss' }, profile: { region: 'ID', eventTypeIds: ['wedding'], sample: false } }, today);
  ws = reducer(ws, { type: 'LEAD_CREATE', payload: { name: 'Ayu & Bram', eventTypeId: 'wedding', clientName: 'Ayu', email: 'ayu@x.id', source: 'WhatsApp' } });
  const ev = ws.events[0];
  assert.equal(ev.currency, 'IDR');
  assert.equal(ev.jurisdictionId, 'ID-JKT');
  assert.equal(ev.salesId, 'u_owner');
  assert.equal(ws.clients[0].country, 'ID');
});

test('PPN/GST are always charged; VAT reverse charge stays EU/UK/CH only', () => {
  const lines = [{ active: true, amount: 1000, pricing: 'fixed' }];
  const company = { type: 'company', vatId: 'X1', country: 'SG' };
  const id = calcTax({ lines, jurisdiction: { region: 'ID', rate: 11, name: 'Indonesia', taxLabel: 'PPN' }, client: company, companyCountry: 'ID' });
  assert.equal(id.taxAmount, 110);
  assert.match(id.label, /^PPN 11%/);
  const eu = calcTax({ lines, jurisdiction: { region: 'EU', rate: 20, name: 'France' }, client: { ...company, country: 'DE' }, companyCountry: 'FR' });
  assert.equal(eu.reverseCharge, true);
});

test('entitlements: an expired trial is read-only but sign-in and exports still work', () => {
  const s = buildPlatformSeed(today);
  const ent = entitlement(T(s, 'tn_sunset'), today);
  assert.equal(ent.writable, false);
  assert.match(checkAction(ent, 'LEAD_CREATE', {}, null), /trial has ended/);
  assert.equal(checkAction(ent, 'LOGIN', { email: 'x' }, { users: [] }), null);
  assert.equal(checkAction(ent, 'DOCUMENT_GENERATED', {}, null), null);
  const trial = entitlement(T(s, 'tn_balibliss'), today);
  assert.equal(trial.writable, true);
  assert.equal(trial.planId, 'studio');
});

test('plan limits: seats, portal roles and features are enforced per plan', () => {
  const ws = buildWorkspace({ owner, company: { name: 'Petal' }, profile: { region: 'AU', invites: [{ email: 'a@x.au', role: 'planner' }] } }, today);
  const starter = entitlement({ status: 'active', plan: 'starter', currentPeriodEnd: addDays(today, 10) }, today);
  assert.equal(usage(ws).seats, 2);
  assert.match(checkAction(starter, 'USER_CREATE', { data: { role: 'sales' } }, ws), /2 team seats/);
  assert.match(checkAction(starter, 'USER_CREATE', { data: { role: 'client' } }, ws), /Client portal/);
  assert.match(checkAction(starter, 'POSITION_ADD', {}, ws), /Workforce/);
  assert.equal(checkAction(starter, 'USER_CREATE', { data: { role: 'crew' } }, ws)?.includes('Day-of'), true);
  const studio = entitlement({ status: 'active', plan: 'studio', currentPeriodEnd: addDays(today, 10) }, today);
  assert.equal(checkAction(studio, 'USER_CREATE', { data: { role: 'client' } }, ws), null);
  assert.match(checkAction(studio, 'ACCOUNTING_SYNC', {}, ws), /QuickBooks/);
});

test('a denied action is logged as rejected and changes nothing', () => {
  const ws = buildWorkspace({ owner, company: { name: 'X' }, profile: { region: 'US', sample: false } }, today);
  const next = reducer(ws, { type: 'LEAD_CREATE', payload: { name: 'A', eventTypeId: 'wedding', clientName: 'A', email: 'a@a.com' }, denied: 'Your free trial has ended' });
  assert.equal(next.events.length, 0);
  assert.equal(next.activityLog[0].status, 'rejected');
  assert.match(next.lastError.message, /trial has ended/);
});

test('demo reset can never overwrite a customer workspace', () => {
  const s = buildPlatformSeed(today);
  assert.match(checkAction(entitlement(T(s, 'tn_balibliss'), today), 'RESET_DEMO', {}, null), /Only the demo workspace/);
  assert.equal(checkAction(entitlement(T(s, 'tn_lumiere'), today), 'RESET_DEMO', {}, null), null);
});

test('checkout: declined card, then success; downgrade blocked when over the new limits', () => {
  let s = buildPlatformSeed(today);
  assert.match(validateCard({ number: '4242 4242 4242 4241', exp: '12/30', cvc: '123' }, today), /not valid/);
  s = run(s, 'CHECKOUT', { tenantId: 'tn_sunset', planId: 'studio', card: { number: '4000 0000 0000 0002', exp: '12/30', cvc: '123' } });
  assert.match(s.lastError.message, /declined/);
  s = run(s, 'CHECKOUT', { tenantId: 'tn_sunset', planId: 'studio', interval: 'year', card: { number: '4242 4242 4242 4242', exp: '12/30', cvc: '123' } });
  const t = T(s, 'tn_sunset');
  assert.equal(t.status, 'active');
  assert.equal(t.invoices[0].amount, 990);
  assert.equal(entitlement(t, today).writable, true);
  s = run(s, 'PLAN_CHANGE', { tenantId: 'tn_sunset', planId: 'starter' }, { usage: () => ({ seats: 5, activeEvents: 3 }) });
  assert.match(s.lastError.message, /Starter includes 2 seats/);
});

test('billing run: trials expire, failing cards go past due with a grace period, card update recovers', () => {
  let s = buildPlatformSeed(today);
  T(s, 'tn_balibliss').trialEndsAt = addDays(today, -1);
  const lumi = T(s, 'tn_lumiere');
  lumi.currentPeriodEnd = today;
  lumi.card.failsRenewal = true;
  s = run(s, 'PLATFORM_TICK', {});
  assert.equal(T(s, 'tn_balibliss').status, 'expired');
  assert.equal(T(s, 'tn_lumiere').status, 'past_due');
  assert.equal(entitlement(T(s, 'tn_lumiere'), today).writable, true, 'writable during grace');
  assert.equal(entitlement(T(s, 'tn_lumiere'), addDays(today, 8)).writable, false, 'read-only after grace');
  s = run(s, 'CARD_UPDATE', { tenantId: 'tn_lumiere', card: { number: '4242424242424242', exp: '10/31', cvc: '321' } });
  assert.equal(T(s, 'tn_lumiere').status, 'active');
  assert.equal(T(s, 'tn_lumiere').invoices[0].status, 'paid');
});

test('operator: suspension needs an operator and a reason; suspended workspaces cannot be entered', () => {
  let s = buildPlatformSeed(today);
  s = run(s, 'OP_SUSPEND', { tenantId: 'tn_petal', reason: 'Fraud' });
  assert.match(s.lastError.message, /Operator sign-in required/);
  s = run(s, 'OPERATOR_LOGIN', { email: 'operator@eventos.app', password: 'demo1234' });
  s = run(s, 'OP_SUSPEND', { tenantId: 'tn_lumiere', reason: 'x' });
  assert.match(s.lastError.message, /demo workspace cannot be suspended/);
  s = run(s, 'OP_SUSPEND', { tenantId: 'tn_petal', reason: 'Suspected fraud' });
  assert.equal(entitlement(T(s, 'tn_petal'), today).canEnter, false);
  s = run(s, 'ENTER_WORKSPACE', { tenantId: 'tn_petal' });
  assert.match(s.lastError.message, /suspended/);
  s = run(s, 'OP_REACTIVATE', { tenantId: 'tn_petal' });
  assert.equal(T(s, 'tn_petal').status, 'past_due', 'returns to its previous status');
  assert.ok(tenantMrr(T(s, 'tn_northwind')) > 200);
});
