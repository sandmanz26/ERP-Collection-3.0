// Entitlements: what a workspace may do right now, from its subscription status and plan.
// Every tenant action passes through checkAction() before it reaches the tenant reducer.
import { addDays, diffDays } from '../lib/dates.js';
import { planById, FEATURES, TRIAL_PLAN, PAST_DUE_GRACE_DAYS, SEAT_ROLES } from './plans.js';

const ENDED_STAGES = ['archived', 'lost', 'cancelled_client', 'cancelled_eo'];

/** Usage that plans are metered on, read from a tenant's app state. */
export function usage(appState) {
  if (!appState) return { seats: 0, activeEvents: 0, events: 0, clients: 0, vendors: 0, portalUsers: 0, storageKb: 0 };
  const users = appState.users || [];
  return {
    seats: users.filter((u) => SEAT_ROLES.includes(u.role) && u.status !== 'suspended').length,
    activeEvents: (appState.events || []).filter((e) => !ENDED_STAGES.includes(e.stage)).length,
    events: (appState.events || []).length,
    clients: (appState.clients || []).length,
    vendors: (appState.vendors || []).length,
    portalUsers: users.filter((u) => ['client', 'vendor', 'crew'].includes(u.role)).length,
    storageKb: Math.round(JSON.stringify(appState).length / 1024),
  };
}

/**
 * Status machine → access:
 * trialing (writable, trial plan) · active (writable) · past_due (writable during grace, then read-only)
 * expired = trial ended without a plan (read-only) · canceled (read-only) · suspended (no access).
 */
export function entitlement(tenant, today) {
  if (!tenant) return null;
  let status = tenant.status;
  if (status === 'trialing' && tenant.trialEndsAt < today) status = 'expired';
  const planId = status === 'trialing' ? TRIAL_PLAN : tenant.plan;
  const plan = planById(planId);
  const graceEnds = tenant.pastDueSince ? addDays(tenant.pastDueSince, PAST_DUE_GRACE_DAYS) : null;
  const writable = status === 'trialing' || status === 'active' || (status === 'past_due' && graceEnds && today <= graceEnds);
  const trialDaysLeft = status === 'trialing' ? Math.max(0, diffDays(today, tenant.trialEndsAt)) : null;
  let banner = null;
  if (status === 'trialing') banner = { tone: trialDaysLeft <= 3 ? 'warning' : 'info', text: `Free trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left. Everything in ${plan.name} is unlocked.`, cta: 'Choose a plan' };
  else if (status === 'expired') banner = { tone: 'danger', text: 'Your free trial has ended. The workspace is read-only — your data is safe.', cta: 'Choose a plan' };
  else if (status === 'past_due') banner = { tone: writable ? 'warning' : 'danger', text: writable ? `We couldn't charge your card. Update it before ${graceEnds} to keep editing.` : 'Payment failed and the grace period is over. The workspace is read-only.', cta: 'Update card' };
  else if (status === 'canceled') banner = { tone: 'danger', text: 'Your subscription has ended. The workspace is read-only — reactivate any time.', cta: 'Reactivate' };
  else if (tenant.cancelAtPeriodEnd) banner = { tone: 'info', text: `Your plan is canceled and stays active until ${tenant.currentPeriodEnd}.`, cta: 'Resume plan' };
  return {
    status, plan, planId, writable, canEnter: status !== 'suspended', trialDaysLeft, graceEnds, banner, demo: !!tenant.demo,
    features: new Set(plan.features), limits: plan.limits,
  };
}

export const hasFeature = (ent, f) => !!ent?.features.has(f);

/** Actions that stay allowed in a read-only workspace (sign-in, preferences, exports). */
const READ_ONLY_OK = new Set(['LOGIN', 'LOGOUT', 'SET_USER', 'THEME_SET', 'NOTIFICATIONS_READ', 'SET_ONLINE', 'DOCUMENT_GENERATED']);
/** Feature needed by an action (beyond role-based permissions inside the app). */
const ACTION_FEATURE = {
  POSITION_ADD: 'workforce', POSITION_UPDATE: 'workforce', POSITION_ASSIGN_STAFF: 'workforce', WORKER_ADD: 'workforce', CREW_CHECKIN: 'workforce',
  AUTOMATION_TOGGLE: 'automation', TEMPLATE_UPDATE: 'automation',
  ACCOUNTING_SYNC: 'accounting',
  BRANDING_SET: 'branding',
  VENDOR_ARRIVED: 'dayOf', OVERTIME_APPROVE: 'dayOf',
};
const ROLE_FEATURE = { client: 'clientPortal', vendor: 'vendorPortal', crew: 'dayOf' };
const upgrade = (f) => `${FEATURES[f].label} is not included in your plan. Upgrade in Settings → Plan & billing.`;

/** Returns null when the action may run, otherwise the message shown to the user (and logged as rejected). */
export function checkAction(ent, type, payload = {}, appState) {
  if (!ent) return null;
  // Resetting replaces everything with the Lumière demo seed: never allowed in a customer's workspace.
  if (type === 'RESET_DEMO' && !ent.demo) return 'Only the demo workspace can be reset. To start over, delete this workspace in Plan & billing.';
  if (!ent.writable && !READ_ONLY_OK.has(type)) {
    return ent.status === 'expired' ? 'Your free trial has ended — choose a plan to keep working. Your data is safe and read-only.'
      : ent.status === 'past_due' ? 'Payment failed and the grace period is over — update the card in Plan & billing.'
        : 'This workspace is read-only until the subscription is reactivated.';
  }
  const f = ACTION_FEATURE[type];
  if (f && !hasFeature(ent, f)) return upgrade(f);
  const u = usage(appState);
  if (type === 'LOGIN') {
    const target = appState?.users.find((x) => x.email.toLowerCase() === String(payload.email || '').trim().toLowerCase());
    const need = target && ROLE_FEATURE[target.role];
    if (need && !hasFeature(ent, need)) return `${FEATURES[need].label} is not part of this workspace's plan, so ${target.role} accounts can't sign in. Ask the workspace owner to upgrade.`;
  }
  const newRole = type === 'USER_CREATE' ? payload.data?.role : type === 'USER_UPDATE' ? payload.patch?.role : null;
  if (newRole && ROLE_FEATURE[newRole] && !hasFeature(ent, ROLE_FEATURE[newRole])) return upgrade(ROLE_FEATURE[newRole]);
  const addsSeat = (type === 'USER_CREATE' && SEAT_ROLES.includes(payload.data?.role))
    || (type === 'USER_STATUS' && payload.status === 'active' && SEAT_ROLES.includes(appState?.users.find((x) => x.id === payload.userId)?.role))
    || (type === 'USER_UPDATE' && SEAT_ROLES.includes(payload.patch?.role) && !SEAT_ROLES.includes(appState?.users.find((x) => x.id === payload.userId)?.role));
  if (addsSeat && ent.limits.seats !== null && u.seats >= ent.limits.seats) return `Your ${ent.plan.name} plan includes ${ent.limits.seats} team seats and all are in use. Upgrade or suspend a user first.`;
  if (type === 'LEAD_CREATE' && ent.limits.activeEvents !== null && u.activeEvents >= ent.limits.activeEvents) return `Your ${ent.plan.name} plan includes ${ent.limits.activeEvents} active events. Archive finished events or upgrade to add more.`;
  return null;
}

/** Routes / workspace tabs that need a feature (shown with a lock + upgrade wall instead of hidden). */
export const ROUTE_FEATURE = { '/dayof': 'dayOf' };
export const TAB_FEATURE = { people: 'workforce' };
