// Admin configuration handlers.
export const settingsHandlers = {
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
