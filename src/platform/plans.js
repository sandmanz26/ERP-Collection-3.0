// SaaS platform definition: product identity, plans, feature matrix, limits.
// The platform bills workspaces (tenants) in USD; each workspace bills ITS clients in its own currency.

export const PLATFORM = {
  name: 'EventOS',
  tagline: 'The operating system for event & wedding planners',
  domain: 'eventos.app',
  supportEmail: 'support@eventos.app',
  demoTenantId: 'tn_lumiere',
};

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN = 'studio'; // a trial unlocks Studio so teams see the full product
export const PAST_DUE_GRACE_DAYS = 7; // a failed renewal keeps the workspace writable this long
export const ANNUAL_DISCOUNT_MONTHS = 2; // annual = 10 × monthly

/** Feature keys used by entitlements, nav locks and upgrade walls. */
export const FEATURES = {
  clientPortal: { label: 'Client portal', desc: 'Couples & clients sign, pay, approve and follow their event' },
  vendorPortal: { label: 'Vendor portal', desc: 'Vendors quote, confirm bookings, upload COIs and crew rosters' },
  dayOf: { label: 'Day-of mode (offline)', desc: 'Mobile run of show, QR check-in, overtime and incidents on site' },
  workforce: { label: 'Workforce & outsourced crew', desc: 'Staffing plans, agency rosters, credentials, coverage' },
  automation: { label: 'Automations & email', desc: 'Reminders, auto-invoicing, hold expiry, surveys' },
  accounting: { label: 'QuickBooks / Xero sync', desc: 'Push invoices, payments and deferred revenue' },
  branding: { label: 'Custom branding', desc: 'Your colors on the app and the client portal' },
  auditExport: { label: 'Audit log export', desc: 'Export the full activity log as Markdown' },
  sso: { label: 'SSO (SAML)', desc: 'Sign in with Google Workspace / Microsoft Entra' },
};

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 39,
    blurb: 'For solo planners getting organised.',
    limits: { seats: 2, activeEvents: 15 },
    features: [],
  },
  {
    id: 'studio',
    name: 'Studio',
    price: 99,
    blurb: 'For growing teams that run events with clients and vendors.',
    limits: { seats: 8, activeEvents: null },
    features: ['clientPortal', 'vendorPortal', 'dayOf', 'workforce', 'automation', 'branding'],
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 249,
    blurb: 'For agencies with several teams, finance and compliance needs.',
    limits: { seats: null, activeEvents: null },
    features: ['clientPortal', 'vendorPortal', 'dayOf', 'workforce', 'automation', 'branding', 'accounting', 'auditExport', 'sso'],
  },
];

export const planById = (id) => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Price for a billing interval in USD. */
export function planPrice(planId, interval = 'month') {
  const p = planById(planId);
  return interval === 'year' ? p.price * (12 - ANNUAL_DISCOUNT_MONTHS) : p.price;
}

/** Roles that consume a paid seat. Clients, vendors and day-of crew logins are free. */
export const SEAT_ROLES = ['admin', 'sales', 'planner', 'production', 'finance'];

/** Regions offered at sign-up: drives currency, tax jurisdictions, payment rails and examples. */
export const REGIONS = [
  { id: 'US', label: 'United States', currency: 'USD', jurisdictionIds: ['US-NY-NYC', 'US-CA-LA', 'US-FL-MIA', 'US-TX-AUS'], country: 'US', timezone: 'America/New_York' },
  { id: 'EU', label: 'European Union', currency: 'EUR', jurisdictionIds: ['EU-FR', 'EU-DE', 'EU-IT', 'EU-NL'], country: 'FR', timezone: 'Europe/Paris', vat: true },
  { id: 'UK', label: 'United Kingdom', currency: 'GBP', jurisdictionIds: ['UK'], country: 'GB', timezone: 'Europe/London', vat: true },
  { id: 'CH', label: 'Switzerland', currency: 'CHF', jurisdictionIds: ['CH'], country: 'CH', timezone: 'Europe/Zurich', vat: true },
  { id: 'ID', label: 'Indonesia', currency: 'IDR', jurisdictionIds: ['ID-JKT', 'ID-BALI'], country: 'ID', timezone: 'Asia/Jakarta' },
  { id: 'SG', label: 'Singapore', currency: 'SGD', jurisdictionIds: ['SG'], country: 'SG', timezone: 'Asia/Singapore' },
  { id: 'AU', label: 'Australia', currency: 'AUD', jurisdictionIds: ['AU'], country: 'AU', timezone: 'Australia/Sydney' },
];
export const regionById = (id) => REGIONS.find((r) => r.id === id) ?? REGIONS[0];

/** Brand colors a workspace can pick (curated so contrast stays accessible in both themes).
 *  'lagoon' is the token default; an unknown id (e.g. the retired 'violet') falls back to it. */
export const DEFAULT_BRAND = 'lagoon';
export const BRAND_COLORS = [
  { id: 'lagoon', label: 'Lagoon', brand: '#1b6c80', strong: '#134f5e' }, // the product default (design tokens)
  { id: 'rose', label: 'Rose', brand: '#c2185b', strong: '#8e0f42' },
  { id: 'emerald', label: 'Emerald', brand: '#0f7a55', strong: '#0a5a3e' },
  { id: 'ocean', label: 'Ocean', brand: '#0b63c9', strong: '#084b99' },
  { id: 'gold', label: 'Gold', brand: '#9a6b00', strong: '#704e00' },
  { id: 'ink', label: 'Ink', brand: '#2b2838', strong: '#14121c' },
];

export const RESERVED_SLUGS = ['www', 'app', 'api', 'admin', 'operator', 'login', 'signup', 'help', 'support', 'billing', 'status', 'mail', 'eventos'];
