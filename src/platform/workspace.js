// Builds a brand-new tenant (workspace) app state from the onboarding answers.
// The result has exactly the shape of the demo seed (state version 6), so every screen works on day one.
import { addDays, todayISO } from '../lib/dates.js';
import { convert } from '../lib/money.js';
import { reducer } from '../store/reducer.js';
import { FX_RATES_TO_USD, JURISDICTIONS, CATALOG, PAYMENT_SCHEDULES, CANCELLATION_POLICIES, CONTRACT_TEMPLATES, EVENT_TYPES, LEAD_SOURCES, EMAIL_TEMPLATES, AUTOMATIONS, ACCOUNT_MAPPING } from '../data/config.js';
import { RISK_DEFAULTS } from '../lib/risk.js';
import { regionById, RESERVED_SLUGS, BRAND_COLORS, DEFAULT_BRAND } from './plans.js';

export const STATE_VERSION = 6;

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

/** Returns an error message, or null when the workspace URL is usable. */
export function slugError(slug, takenSlugs = []) {
  if (!slug) return 'Pick a workspace URL';
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(slug)) return 'Use 3–32 lowercase letters, numbers or dashes';
  if (RESERVED_SLUGS.includes(slug)) return 'That URL is reserved';
  if (takenSlugs.includes(slug)) return 'That URL is already taken';
  return null;
}

/** Round a converted price to something a planner would actually quote (2 significant digits above 1,000). */
function nicePrice(n) {
  if (!n) return 0;
  if (n < 100) return Math.round(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

const REGION_SOURCES = { ID: ['WhatsApp', 'Instagram', 'Bridestory', 'Referral', 'Website form', 'Wedding fair', 'Manual'] };

export const DEFAULT_PROFILE = {
  businessType: 'full_service',
  region: 'US',
  eventTypeIds: ['wedding', 'birthday', 'conference'],
  eventsPerYear: '25-50',
  paymentScheduleId: 'ps_social',
  holdExpiryDays: 7,
  finalHeadcountDays: 14,
  lateFeePct: 1.5,
  jurisdictionId: null,
  invites: [],
  brandColor: DEFAULT_BRAND,
  portalWelcome: '',
  sample: true,
};

/**
 * owner: { name, email, password }, company: { name }, profile: onboarding answers (see DEFAULT_PROFILE).
 * Returns the tenant app state, signed in as the owner.
 */
export function buildWorkspace({ owner, company, profile: p0 = {} }, today = todayISO()) {
  const p = { ...DEFAULT_PROFILE, ...p0 };
  const region = regionById(p.region);
  const cur = region.currency;
  const jurisdictions = JURISDICTIONS.filter((j) => region.jurisdictionIds.includes(j.id));
  const eventTypes = EVENT_TYPES.filter((t) => p.eventTypeIds.includes(t.id)).map((t) => (t.segment === 'social' && p.paymentScheduleId ? { ...t, paymentScheduleId: p.paymentScheduleId } : t));
  const catalog = CATALOG.map((c) => ({ ...c, unitPrice: nicePrice(convert(c.unitPrice ?? 0, 'USD', cur, FX_RATES_TO_USD)), unitCost: nicePrice(convert(c.unitCost ?? 0, 'USD', cur, FX_RATES_TO_USD)) }));
  const ownerUser = { id: 'u_owner', name: owner.name, role: 'admin', email: owner.email.trim().toLowerCase(), password: owner.password, status: 'active', title: 'Owner', lastLoginAt: new Date().toISOString(), mfa: false };
  const invites = (p.invites || []).filter((i) => i.email).map((i, k) => ({
    id: `u_inv${k + 1}`, name: i.name || i.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), role: i.role || 'planner',
    email: i.email.trim().toLowerCase(), password: i.tempPassword || 'welcome123', status: 'invited', lastLoginAt: null,
  }));
  const settings = {
    company: {
      name: company.name, country: region.country, state: '', euVatCountry: region.vat ? region.country : null, baseCurrency: cur, address: '',
      timezone: region.timezone, brandColor: BRAND_COLORS.some((b) => b.id === p.brandColor) ? p.brandColor : DEFAULT_BRAND, portalWelcome: p.portalWelcome || '',
    },
    fxRates: FX_RATES_TO_USD,
    jurisdictions,
    catalog,
    paymentSchedules: PAYMENT_SCHEDULES,
    cancellationPolicies: CANCELLATION_POLICIES,
    contractTemplates: CONTRACT_TEMPLATES,
    eventTypes: eventTypes.length ? eventTypes : [EVENT_TYPES[0]],
    leadSources: REGION_SOURCES[region.id] ?? LEAD_SOURCES,
    emailTemplates: EMAIL_TEMPLATES,
    automations: AUTOMATIONS,
    accountMapping: ACCOUNT_MAPPING,
    capacity: { default: 1, byWeekday: { 5: 2, 6: 2, 0: 1 }, plannerBased: false },
    holdExpiryDays: Number(p.holdExpiryDays) || 7,
    holdReminderDays: 2,
    proposalValidityDays: 21,
    lateFeePct: Number(p.lateFeePct) || 0,
    finalHeadcountDays: Number(p.finalHeadcountDays) || 14,
    rsvpDeadlineDays: 30,
    ...RISK_DEFAULTS,
    returnedPaymentFee: nicePrice(convert(RISK_DEFAULTS.returnedPaymentFee, 'USD', cur, FX_RATES_TO_USD)),
    accountingProvider: 'quickbooks',
    defaults: { currency: cur, jurisdictionId: p.jurisdictionId && jurisdictions.some((j) => j.id === p.jurisdictionId) ? p.jurisdictionId : jurisdictions[0]?.id, country: region.country },
    gettingStarted: { dismissed: false },
    paymentsConnected: false,
    counters: { invoice: 1000, changeOrder: 100, creditNote: 500 },
  };
  let state = {
    version: STATE_VERSION,
    seededAt: new Date().toISOString(),
    currentUserId: ownerUser.id,
    loginAttempts: {},
    theme: 'system',
    online: true,
    offlineQueue: [],
    settings,
    users: [ownerUser, ...invites],
    clients: [],
    vendors: [],
    staff: [{ id: 'st_owner', userId: ownerUser.id, name: ownerUser.name, type: 'employee', skills: ['Lead planner'], rate: 0, rateType: 'hourly', region: region.label, laborRegion: region.id === 'US' ? 'US-NY' : region.id, phone: '' }],
    events: [],
    holds: [],
    notifications: [],
    outbox: [],
    activityLog: [{ id: 'log_created', ts: new Date().toISOString(), userId: ownerUser.id, userName: ownerUser.name, role: 'admin', type: 'WORKSPACE_CREATED', eventId: null, summary: `Workspace "${company.name}" created (${region.label}, ${cur}${invites.length ? `, ${invites.length} teammate(s) invited` : ''})`, status: 'ok' }],
    decorReservations: [],
    effects: [],
  };
  if (p.sample) state = addSampleEvent(state, today);
  const { effects, lastOk, lastError, ...clean } = state;
  return clean;
}

/** A realistic sample lead, created through the real reducer so it behaves exactly like user data. */
function addSampleEvent(state, today) {
  const et = state.settings.eventTypes.find((t) => t.id === 'wedding') ?? state.settings.eventTypes[0];
  const cur = state.settings.company.baseCurrency;
  const date = addDays(today, 150 - new Date(`${addDays(today, 150)}T00:00:00`).getDay() + 6); // a Saturday ~5 months out
  const run = (s, type, payload) => reducer(s, { type, payload });
  let s = run(state, 'LEAD_CREATE', {
    name: `Sample — ${et.segment === 'social' ? 'Rivera & Tan Wedding' : 'Northstar Annual Kickoff'}`, eventTypeId: et.id, clientName: et.segment === 'social' ? 'Maya Rivera & Daniel Tan (sample)' : 'Northstar Ltd. (sample)',
    clientType: et.segment === 'social' ? 'individual' : 'company', email: 'sample.client@gmail.com', source: state.settings.leadSources[0], date, guestCount: 120,
    budget: nicePrice(convert(60000, 'USD', cur, state.settings.fxRates)), venue: 'Garden venue (sample)', message: 'This is sample data to explore — delete it any time.',
  });
  const ev = s.events[0];
  s = run(s, 'HOLD_CREATE', { eventId: ev.id, date });
  s = run(s, 'STAGE_CHANGE', { eventId: ev.id, to: 'qualified' });
  s = run(s, 'PROPOSAL_CREATE', { eventId: ev.id });
  s.events[0].sample = true;
  return { ...s, lastOk: null, lastError: null };
}
