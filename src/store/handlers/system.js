import { buildSeed } from '../../data/seed.js';
import { addDays, diffDays, fmtDate } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { invoiceStatus, invoiceBalance } from '../../lib/derived.js';
import { ACTIVE_BOOKED_STAGES } from '../../lib/lifecycle.js';
import { automationsFor, sendTemplateEmail, eventVars, clientEmail, promoteHolds } from './common.js';
import { createInvoiceForSchedule } from './finance.js';

export const systemHandlers = {
  SET_USER(ctx, { userId }) {
    ctx.state.currentUserId = userId;
    return `Switched active user to ${ctx.state.users.find((u) => u.id === userId)?.name}`;
  },
  SET_ONLINE(ctx, { online }) {
    ctx.state.online = online;
    if (online && ctx.state.offlineQueue.length) {
      const n = ctx.state.offlineQueue.length;
      ctx.state.activityLog.forEach((l) => { if (l.sync === 'pending') l.sync = 'synced'; });
      ctx.state.offlineQueue = [];
      return `Back online — synced ${n} offline action(s) to server`;
    }
    return online ? 'Device back online' : 'Device went OFFLINE — actions will be queued locally';
  },
  NOTIFICATIONS_READ(ctx) {
    const me = ctx.user;
    ctx.state.notifications.forEach((n) => {
      if (n.toRoles?.includes(me.role) || n.toUserIds?.includes(me.id) || me.role === 'admin') n.read = true;
    });
    return 'Marked notifications as read';
  },
  /**
   * Automation engine. Runs on app load and every minute. Only logs if something happened.
   */
  SYSTEM_TICK(ctx) {
    const { state, today } = ctx;
    const done = [];
    // 1) expire holds
    state.holds.filter((h) => h.status === 'active' && h.expiresAt < today).forEach((h) => {
      h.status = 'expired';
      const ev = state.events.find((e) => e.id === h.eventId);
      if (ev && ev.dateStatus === 'hold') ev.dateStatus = 'none';
      done.push(`Hold expired: ${ev?.name} (${fmtDate(h.date)})`);
      ctx.notify({ toRoles: ['sales', 'admin'], eventId: h.eventId, level: 'warning', text: `Hold for ${ev?.name} on ${fmtDate(h.date)} EXPIRED.` });
      promoteHolds(ctx, h.date);
    });
    // 2) hold expiry reminders
    automationsFor(state, 'hold_expiring').forEach((a) => {
      state.holds.filter((h) => h.status === 'active' && diffDays(today, h.expiresAt) <= a.config.daysBefore).forEach((h) => {
        const ev = state.events.find((e) => e.id === h.eventId);
        if (sendTemplateEmail(ctx, { key: `holdexp:${h.id}`, templateId: a.templateId, to: clientEmail(state, ev), vars: eventVars(state, ev, { days_left: diffDays(today, h.expiresAt), hold_expires: fmtDate(h.expiresAt) }), eventId: ev.id, automationId: a.id }))
          done.push(`Hold reminder sent: ${ev.name}`);
      });
    });
    // 3) auto-invoice schedule items due within 30 days
    state.events.filter((e) => e.contract?.status === 'signed' && !['cancelled_client', 'cancelled_eo'].includes(e.stage)).forEach((ev) => {
      ev.paymentSchedule.filter((p) => p.status === 'scheduled' && diffDays(today, p.dueDate) <= 30).forEach((p) => {
        const inv = createInvoiceForSchedule(ctx, ev, p);
        done.push(`Auto-invoice ${inv.number} created for ${ev.name}`);
      });
    });
    // 4) payment due / overdue reminders
    state.events.forEach((ev) => {
      ev.invoices.forEach((inv) => {
        const st = invoiceStatus(ev, inv, today);
        const vars = eventVars(state, ev, { invoice_number: inv.number, amount: fmtMoney(invoiceBalance(ev, inv), inv.currency), due_date: fmtDate(inv.dueDate) });
        if (st === 'sent' || st === 'partial') {
          automationsFor(state, 'payment_due').forEach((a) => {
            if (diffDays(today, inv.dueDate) <= a.config.daysBefore && sendTemplateEmail(ctx, { key: `due:${inv.id}`, templateId: a.templateId, to: clientEmail(state, ev), vars, eventId: ev.id, automationId: a.id }))
              done.push(`Payment reminder ${inv.number}`);
          });
        }
        if (st === 'overdue') {
          automationsFor(state, 'payment_overdue').forEach((a) => {
            if (sendTemplateEmail(ctx, { key: `overdue:${inv.id}`, templateId: a.templateId, to: clientEmail(state, ev), vars, eventId: ev.id, automationId: a.id })) {
              done.push(`Overdue notice ${inv.number}`);
              ctx.notify({ toRoles: ['finance', 'admin'], eventId: ev.id, level: 'danger', text: `Invoice ${inv.number} (${ev.name}) is OVERDUE.` });
            }
          });
        }
      });
    });
    // 5) vendor COI expiry
    automationsFor(state, 'doc_expiry').forEach((a) => {
      state.vendors.filter((v) => v.coiExpiry && diffDays(today, v.coiExpiry) <= a.config.daysBefore).forEach((v) => {
        if (sendTemplateEmail(ctx, { key: `coi:${v.id}:${v.coiExpiry}`, templateId: a.templateId, to: v.email, vars: { vendor_name: v.name, expiry: fmtDate(v.coiExpiry) }, automationId: a.id }))
          done.push(`COI reminder sent to ${v.name}`);
      });
    });
    // 6) relative-date automations (e.g. RSVP reminder at T-37)
    automationsFor(state, 'relative_date').forEach((a) => {
      state.events.filter((e) => e.date && ACTIVE_BOOKED_STAGES.includes(e.stage) && e.households.length).forEach((ev) => {
        const fireOn = addDays(ev.date, a.config.offsetDays);
        if (today >= fireOn && today <= ev.date) {
          const pending = ev.households.filter((h) => h.guests.some((g) => Object.values(g.rsvp).includes('pending')));
          if (sendTemplateEmail(ctx, { key: `rel:${a.id}:${ev.id}`, templateId: a.templateId, to: `${pending.length} pending households`, vars: eventVars(state, ev, { rsvp_deadline: fmtDate(addDays(ev.date, -30)) }), eventId: ev.id, automationId: a.id }))
            done.push(`RSVP reminder to ${pending.length} households (${ev.name})`);
        }
      });
    });
    if (!done.length) return { skipLog: true };
    return `Automation run: ${done.length} action(s) — ${done.slice(0, 4).join('; ')}${done.length > 4 ? '…' : ''}`;
  },
  RESET_DEMO(ctx) {
    const fresh = buildSeed();
    Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
    Object.assign(ctx.state, fresh);
    ctx.state.effects = [{ type: 'decor.reset', reservations: fresh.decorReservations }];
    return 'Demo data reset to seed';
  },
};
