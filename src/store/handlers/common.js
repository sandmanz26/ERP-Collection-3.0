// Shared helpers used by action handlers. Handlers mutate a deep-cloned draft state.
import { renderTemplate } from '../../lib/contracts.js';
import { fmtDate } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { activeHoldsOn } from '../../lib/availability.js';

export class BusinessError extends Error {}

export function assert(cond, msg) {
  if (!cond) throw new BusinessError(msg);
}

export function userName(state, uid) {
  return state.users.find((u) => u.id === uid)?.name ?? 'System';
}

export function eventVars(state, ev, extra = {}) {
  const client = state.clients.find((c) => c.id === ev?.clientId);
  return {
    client_name: client?.name ?? '',
    event_name: ev?.name ?? '',
    event_date: ev?.date ? fmtDate(ev.date) : 'TBD',
    planner_name: userName(state, ev?.plannerId) || 'Your planner',
    ...extra,
  };
}

/** Queue an automated email into the outbox (deduplicated by key). Returns true if created. */
export function sendTemplateEmail(ctx, { key, templateId, to, vars, eventId, automationId }) {
  const { state } = ctx;
  if (key && state.outbox.some((o) => o.key === key)) return false;
  const tpl = state.settings.emailTemplates.find((t) => t.id === templateId);
  if (!tpl) return false;
  state.outbox.unshift({
    id: ctx.id('mail'),
    key,
    ts: new Date().toISOString(),
    to,
    subject: renderTemplate(tpl.subject, vars),
    body: renderTemplate(tpl.body, vars),
    eventId: eventId ?? null,
    templateId,
    automationId: automationId ?? null,
    status: 'sent (mock)',
  });
  return true;
}

export function automationsFor(state, trigger) {
  return state.settings.automations.filter((a) => a.enabled && a.trigger === trigger);
}

export function clientEmail(state, ev) {
  return state.clients.find((c) => c.id === ev.clientId)?.email ?? 'client@gmail.com';
}

/** Hold release / expiry -> re-number remaining holds on the date and notify the new first hold. */
export function promoteHolds(ctx, date) {
  const { state } = ctx;
  const remaining = activeHoldsOn(date, state.holds);
  remaining.forEach((h, i) => {
    const wasPriority = h.priority;
    h.priority = i + 1;
    if (wasPriority !== 1 && h.priority === 1) {
      const ev = state.events.find((e) => e.id === h.eventId);
      ctx.notify({ toRoles: ['sales', 'admin'], eventId: h.eventId, level: 'info', text: `${ev?.name}: now FIRST hold on ${fmtDate(date)} (previous hold released).` });
      automationsFor(state, 'hold_promoted').forEach((a) =>
        sendTemplateEmail(ctx, { key: `promoted:${h.id}`, templateId: a.templateId, to: clientEmail(state, ev), vars: eventVars(state, ev), eventId: ev.id, automationId: a.id }));
    }
  });
}

export function runStageAutomations(ctx, ev, to) {
  automationsFor(ctx.state, 'stage_change')
    .filter((a) => a.config.to === to)
    .forEach((a) => sendTemplateEmail(ctx, { key: `stage:${ev.id}:${to}`, templateId: a.templateId, to: clientEmail(ctx.state, ev), vars: eventVars(ctx.state, ev), eventId: ev.id, automationId: a.id }));
}

export function money(ev, n) {
  return fmtMoney(n, ev.currency);
}
