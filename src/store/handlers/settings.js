import { assert } from './common.js';

// Admin configuration handlers.
export const settingsHandlers = {
  /** Company profile shown on proposals, invoices and the client portal. */
  COMPANY_UPDATE(ctx, { patch }) {
    const allowed = ['name', 'address', 'phone', 'email', 'website', 'taxId'];
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    assert(keys.length, 'Nothing to update');
    if ('name' in patch) assert(String(patch.name).trim().length >= 2, 'Company name is too short');
    keys.forEach((k) => { ctx.state.settings.company[k] = String(patch[k]).trim(); });
    return `Company profile updated (${keys.join(', ')})`;
  },
  BRANDING_SET(ctx, { brandColor, portalWelcome }) {
    const c = ctx.state.settings.company;
    if (brandColor) c.brandColor = brandColor;
    if (portalWelcome !== undefined) c.portalWelcome = String(portalWelcome).slice(0, 280);
    return `Branding updated${brandColor ? ` (${brandColor})` : ''}`;
  },
  /** Mock Stripe Connect onboarding so clients can pay invoices online. */
  PAYMENTS_CONNECT(ctx, { provider = 'stripe' }) {
    assert(!ctx.state.settings.paymentsConnected, 'Online payments are already connected');
    ctx.state.settings.paymentsConnected = { provider, at: new Date().toISOString(), account: `acct_mock_${Math.random().toString(36).slice(2, 10)}` };
    return `Online payments connected (${provider === 'stripe' ? 'Stripe' : provider}, test mode)`;
  },
  GETTING_STARTED_DISMISS(ctx) {
    ctx.state.settings.gettingStarted = { ...(ctx.state.settings.gettingStarted ?? {}), dismissed: true };
    return 'Getting-started checklist hidden';
  },
  USER_CREATE(ctx, { data }) {
    const u = { id: ctx.id('u'), permissions: data.role === 'client' ? ['view_all', 'message'] : undefined, status: 'invited', password: 'welcome123', lastLoginAt: null, ...data };
    ctx.state.users.push(u);
    return `User invited: ${u.name} (${u.role})`;
  },
  USER_UPDATE(ctx, { userId, patch }) {
    const u = ctx.state.users.find((x) => x.id === userId);
    Object.assign(u, patch);
    return `User ${u.name} updated (${Object.keys(patch).join(', ')})`;
  },
  USER_PASSWORD_RESET(ctx, { userId }) {
    const u = ctx.state.users.find((x) => x.id === userId);
    u.password = 'welcome123';
    delete (ctx.state.loginAttempts ?? {})[u.email.toLowerCase()];
    return `Password reset for ${u.name} (temporary password issued, lockout cleared)`;
  },
  USER_STATUS(ctx, { userId, status }) {
    const u = ctx.state.users.find((x) => x.id === userId);
    assert(status !== 'suspended' || u.id !== ctx.user.id, 'You cannot suspend your own account');
    u.status = status;
    return `${u.name} is now ${status}`;
  },
  CATALOG_ADD(ctx, { data }) {
    const c = { id: ctx.id('svc'), qty: 1, pct: 0, costPct: 0, ...data };
    ctx.state.settings.catalog.push(c);
    return `Catalog item added: ${c.name} (${c.pricing})`;
  },
  /** Manual email from a template (logged on the event + outbox). */
  EMAIL_SEND(ctx, { eventId, templateId, to, subject, body }) {
    const ev = ctx.ev(eventId);
    ctx.state.outbox.unshift({ id: ctx.id('mail'), key: null, ts: new Date().toISOString(), to, subject, body, eventId, templateId, automationId: null, status: 'sent (mock)', by: ctx.user.id });
    ev.interactions.unshift({ id: ctx.id('int'), type: 'email', at: new Date().toISOString(), by: ctx.user.id, summary: `Outbound email to ${to}: ${subject}` });
    return { summary: `Email sent to ${to}: "${subject}"`, eventId };
  },
  SETTINGS_SET(ctx, { key, value, label }) {
    ctx.state.settings[key] = value;
    return `Settings: ${label || key} updated`;
  },
  AUTOMATION_TOGGLE(ctx, { automationId }) {
    const a = ctx.state.settings.automations.find((x) => x.id === automationId);
    a.enabled = !a.enabled;
    return `Automation "${a.name}" ${a.enabled ? 'enabled' : 'disabled'}`;
  },
  TEMPLATE_UPDATE(ctx, { templateId, patch }) {
    const t = ctx.state.settings.emailTemplates.find((x) => x.id === templateId);
    Object.assign(t, patch);
    return `Email template "${t.name}" updated`;
  },
  CATALOG_UPDATE(ctx, { catalogId, patch }) {
    const c = ctx.state.settings.catalog.find((x) => x.id === catalogId);
    Object.assign(c, patch);
    return `Catalog item "${c.name}" updated (${Object.keys(patch).join(', ')})`;
  },
  EVENT_TYPE_UPDATE(ctx, { eventTypeId, patch }) {
    const t = ctx.state.settings.eventTypes.find((x) => x.id === eventTypeId);
    Object.assign(t, patch);
    return `Event type "${t.name}" configuration updated (${Object.keys(patch).join(', ')})`;
  },
  EMAIL_LOG(ctx, { eventId, direction, subject, from }) {
    const ev = ctx.ev(eventId);
    ev.interactions.unshift({ id: ctx.id('int'), type: 'email', at: new Date().toISOString(), by: ctx.user.id, summary: `${direction === 'in' ? 'Inbound' : 'Outbound'} email (${from}): ${subject}` });
    return { summary: `Email synced to ${ev.name}: ${subject}`, eventId };
  },
};
