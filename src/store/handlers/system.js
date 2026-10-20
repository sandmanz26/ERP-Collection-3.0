import { buildSeed } from '../../data/seed.js';
import { visibleNotifications } from '../../lib/permissions.js';
import { MAX_FAILED_LOGINS, LOCKOUT_MINUTES } from '../../data/accounts.js';
import { assert } from './common.js';
import { addDays, diffDays, fmtDate } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { invoiceStatus, invoiceBalance } from '../../lib/derived.js';
import { ACTIVE_BOOKED_STAGES } from '../../lib/lifecycle.js';
import { automationsFor, sendTemplateEmail, eventVars, clientEmail, promoteHolds } from './common.js';
import { createInvoiceForSchedule } from './finance.js';

export const systemHandlers = {
  /**
   * Mock sign-in. Wrong credentials are counted per e-mail; after MAX_FAILED_LOGINS the account is locked for
   * LOCKOUT_MINUTES. Failures return { error } so the attempt counter persists while the UI shows the message.
   */
  LOGIN(ctx, { email, password }) {
    const { state } = ctx;
    const key = String(email || '').trim().toLowerCase();
    const u = state.users.find((x) => x.email.toLowerCase() === key);
    const att = (state.loginAttempts ??= {})[key] ?? { count: 0, lockedUntil: null };
    if (att.lockedUntil && new Date(att.lockedUntil) > new Date()) {
      return { summary: `Sign-in blocked for ${key}: account temporarily locked`, error: `Too many failed attempts. Try again after ${new Date(att.lockedUntil).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} or ask an admin to reset your password.`, actor: key };
    }
    if (!u || u.password !== password) {
      att.count += 1;
      if (att.count >= MAX_FAILED_LOGINS) att.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
      state.loginAttempts[key] = att;
      const left = MAX_FAILED_LOGINS - att.count;
      return { summary: `Failed sign-in for ${key} (${att.count}/${MAX_FAILED_LOGINS})`, error: left > 0 ? `That email and password don't match. ${left} attempt${left === 1 ? '' : 's'} left before the account is locked.` : `Too many failed attempts. The account is locked for ${LOCKOUT_MINUTES} minutes.`, actor: key };
    }
    if (u.status === 'suspended') return { summary: `Sign-in refused for ${u.name}: account suspended`, error: 'This account is suspended. Contact your administrator.', actor: key };
    delete state.loginAttempts[key];
    if (u.status === 'invited') u.status = 'active';
    u.lastLoginAt = new Date().toISOString();
    state.currentUserId = u.id;
    return { summary: `${u.name} signed in (${u.role})`, actorId: u.id };
  },
  LOGOUT(ctx) {
    const name = ctx.user?.name;
    ctx.state.currentUserId = null;
    return `${name} signed out`;
  },
  /** Demo-only shortcut from the user menu: jump to another seeded account without typing a password. */
  SET_USER(ctx, { userId }) {
    const u = ctx.state.users.find((x) => x.id === userId);
    assert(u && u.status !== 'suspended', 'That account is suspended');
    ctx.state.currentUserId = userId;
    u.lastLoginAt = new Date().toISOString();
    return { summary: `Switched to demo account ${u.name} (${u.role})`, actorId: u.id };
  },
  THEME_SET(ctx, { theme }) {
    ctx.state.theme = theme;
    return { skipLog: true };
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
    const visible = new Set(visibleNotifications(ctx.state, ctx.user).map((n) => n.id));
    ctx.state.notifications.forEach((n) => {
      if (visible.has(n.id)) n.read = true;
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
      const ev = state.events.find((e) => e.id === h.eventId);
      if (ev?.contract?.immutable) {
        // Signed but deposit unpaid: keep the hold (contractual), but escalate instead of silently releasing the date.
        if (!h.depositOverdue) {
          h.depositOverdue = true;
          done.push(`Deposit overdue: ${ev.name} — date at risk`);
          ctx.notify({ toRoles: ['finance', 'sales', 'admin'], eventId: ev.id, level: 'danger', text: `${ev.name}: contract signed but deposit still unpaid after hold expiry — date ${fmtDate(h.date)} at risk.` });
        }
        return;
      }
      h.status = 'expired';
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
