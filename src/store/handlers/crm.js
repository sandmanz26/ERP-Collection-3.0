import { addDays, fmtDate, diffDays } from '../../lib/dates.js';
import { stageLabel, transitionBlockers, isExit } from '../../lib/lifecycle.js';
import { nextPriority, availability } from '../../lib/availability.js';
import { shiftTasks } from '../../lib/tasks.js';
import { eventContext } from '../../lib/derived.js';
import { assert, promoteHolds, runStageAutomations } from './common.js';

function emptyParts() {
  return {
    subEvents: [], proposals: [], contract: null, paymentSchedule: [], invoices: [], payments: [], creditNotes: [], gratuities: [],
    tasks: [], forms: [], design: { palette: [], notes: '', references: [], decorItemIds: [] }, documents: [], decisions: [], messages: [],
    rfqs: [], vendorBookings: [], households: [], tables: [], seatingRules: [], changeOrders: [],
    ros: { status: 'draft', version: 1, items: [], history: [] }, shifts: [], incidents: [], decorRequests: [], decorReturn: null,
    closing: { venueDepositReturned: false, surveySent: false, survey: null, reviewRequested: false, vendorRatingsDone: false, damageBilled: false },
    payers: [], clientBudget: {}, finalHeadcount: null, cancellation: null, postponements: [], interactions: [], accountingSync: [], approvals: [],
  };
}

export const crmHandlers = {
  /** Capture a new inquiry (web form, email, marketplace, referral, manual). Creates client + event at stage "lead". */
  LEAD_CREATE(ctx, p) {
    const { state } = ctx;
    let clientId = p.clientId;
    if (!clientId) {
      clientId = ctx.id('cl');
      state.clients.push({ id: clientId, name: p.clientName, type: p.clientType || 'individual', email: p.email, phone: p.phone || '', country: p.country || 'US', vatId: p.vatId || '', decisionMakers: [] });
    }
    const et = state.settings.eventTypes.find((t) => t.id === p.eventTypeId);
    const ev = {
      ...emptyParts(),
      id: ctx.id('ev'), name: p.name, eventTypeId: p.eventTypeId, segment: et.segment, clientId, date: p.date || null, dateStatus: 'none', stage: 'lead',
      source: p.source, plannerId: null, salesId: ctx.user.role === 'sales' ? ctx.user.id : p.salesId || 'u_sales', guestCount: Number(p.guestCount) || null,
      budget: Number(p.budget) || null, currency: p.currency || 'USD', jurisdictionId: p.jurisdictionId || 'US-NY-NYC', probability: 10, createdAt: new Date().toISOString(),
      venue: { name: p.venue || 'TBD', address: '', parking: '', accessCode: '', emergencyContact: '', nearestHospital: '', curfew: '' },
    };
    ev.interactions.push({ id: ctx.id('int'), type: 'note', at: new Date().toISOString(), by: ctx.user.id, summary: `Inquiry captured from ${p.source}${p.message ? `: "${p.message}"` : ''}` });
    state.events.unshift(ev);
    return { summary: `New lead "${ev.name}" from ${p.source}`, eventId: ev.id };
  },
  EVENT_UPDATE(ctx, { eventId, patch }) {
    const ev = ctx.ev(eventId);
    assert(!('date' in patch) || !ev.contract?.immutable || patch.date === ev.date, 'Date of a signed event can only change via Postpone.');
    Object.assign(ev, patch);
    return { summary: `Updated ${ev.name}: ${Object.keys(patch).join(', ')}`, eventId };
  },
  CLIENT_UPDATE(ctx, { clientId, patch }) {
    const c = ctx.state.clients.find((x) => x.id === clientId);
    Object.assign(c, patch);
    return `Updated client ${c.name}: ${Object.keys(patch).join(', ')}`;
  },
  INTERACTION_ADD(ctx, { eventId, type, summary }) {
    const ev = ctx.ev(eventId);
    ev.interactions.unshift({ id: ctx.id('int'), type, at: new Date().toISOString(), by: ctx.user.id, summary });
    return { summary: `Logged ${type} on ${ev.name}: ${summary}`, eventId };
  },
  STAGE_CHANGE(ctx, { eventId, to, force }) {
    const ev = ctx.ev(eventId);
    const blockers = transitionBlockers(ev, to, eventContext(ctx.state, ev, ctx.today));
    assert(force || blockers.length === 0, `Cannot move to ${stageLabel(to)}: ${blockers.join('; ')}`);
    const from = ev.stage;
    ev.prevStage = from;
    ev.stage = to;
    if (to === 'qualified' && ev.probability < 25) ev.probability = 25;
    if (to === 'proposal_sent') ev.probability = Math.max(ev.probability, 40);
    if (to === 'negotiation') ev.probability = Math.max(ev.probability, 60);
    if (to === 'booked') ev.probability = 100;
    runStageAutomations(ctx, ev, to);
    return { summary: `Stage ${stageLabel(from)} → ${stageLabel(to)} for ${ev.name}${force && blockers.length ? ' (FORCED by admin)' : ''}`, eventId };
  },
  MARK_LOST(ctx, { eventId, reason }) {
    const ev = ctx.ev(eventId);
    assert(!ev.contract?.immutable, 'Signed events must be cancelled, not marked lost.');
    ev.prevStage = ev.stage;
    ev.stage = 'lost';
    ev.lostReason = reason;
    ev.probability = 0;
    ctx.state.holds.filter((h) => h.eventId === eventId && h.status === 'active').forEach((h) => {
      h.status = 'released';
      promoteHolds(ctx, h.date);
    });
    ev.dateStatus = 'none';
    return { summary: `Marked ${ev.name} as LOST (${reason})`, eventId };
  },
  HOLD_CREATE(ctx, { eventId, date }) {
    const { state } = ctx;
    const ev = ctx.ev(eventId);
    assert(date, 'Pick a date to hold');
    assert(!state.holds.some((h) => h.eventId === eventId && h.status === 'active' && h.date === date), 'This event already holds that date');
    const av = availability(date, { events: state.events.filter((e) => e.id !== eventId), holds: state.holds, capacity: state.settings.capacity, planners: state.users.filter((u) => u.role === 'planner') });
    assert(av.free > 0, `Date ${fmtDate(date)} is at full capacity (${av.capacity} booked).`);
    const priority = nextPriority(date, state.holds);
    state.holds.push({ id: ctx.id('hold'), eventId, date, priority, createdAt: new Date().toISOString(), expiresAt: addDays(ctx.today, state.settings.holdExpiryDays), status: 'active' });
    ev.date = date;
    if (ev.dateStatus !== 'locked') ev.dateStatus = 'hold';
    if (priority > av.free) ctx.notify({ toRoles: ['sales'], eventId, level: 'info', text: `${ev.name} placed as hold #${priority} on ${fmtDate(date)} (waitlisted).` });
    return { summary: `Hold #${priority} placed on ${fmtDate(date)} for ${ev.name}, expires ${fmtDate(addDays(ctx.today, state.settings.holdExpiryDays))}`, eventId };
  },
  HOLD_RELEASE(ctx, { holdId, reason }) {
    const h = ctx.state.holds.find((x) => x.id === holdId);
    h.status = 'released';
    const ev = ctx.state.events.find((e) => e.id === h.eventId);
    if (ev && ev.dateStatus === 'hold') ev.dateStatus = 'none';
    promoteHolds(ctx, h.date);
    return { summary: `Released hold #${h.priority} on ${fmtDate(h.date)} for ${ev?.name}${reason ? ` (${reason})` : ''}`, eventId: h.eventId };
  },
  HOLD_EXTEND(ctx, { holdId, days }) {
    const h = ctx.state.holds.find((x) => x.id === holdId);
    h.expiresAt = addDays(h.expiresAt, days);
    const ev = ctx.state.events.find((e) => e.id === h.eventId);
    return { summary: `Extended hold for ${ev?.name} by ${days} days → ${fmtDate(h.expiresAt)}`, eventId: h.eventId };
  },
  /** Postpone: moves date, shifts all relative task due dates, re-holds the new date, records history. */
  EVENT_POSTPONE(ctx, { eventId, newDate, reason, fee }) {
    const { state } = ctx;
    const ev = ctx.ev(eventId);
    const old = ev.date;
    assert(newDate && newDate !== old, 'Choose a new date');
    const av = availability(newDate, { events: state.events.filter((e) => e.id !== eventId), holds: state.holds.filter((h) => h.eventId !== eventId), capacity: state.settings.capacity, planners: state.users.filter((u) => u.role === 'planner') });
    assert(av.free > 0, `New date ${fmtDate(newDate)} has no capacity`);
    const delta = diffDays(old, newDate);
    ev.date = newDate;
    ev.tasks = shiftTasks(ev.tasks, newDate);
    ev.subEvents.forEach((s) => { if (s.date) s.date = addDays(s.date, delta); });
    ev.shifts.forEach((s) => { s.date = addDays(s.date, delta); });
    ev.paymentSchedule.filter((p) => p.status === 'scheduled' && p.source === 'contract' && !p.isDeposit).forEach((p) => { p.dueDate = addDays(p.dueDate, delta); });
    ev.postponements.push({ from: old, to: newDate, at: new Date().toISOString(), by: ctx.user.id, reason, fee: Number(fee) || 0 });
    state.holds.filter((h) => h.eventId === eventId && h.status === 'active').forEach((h) => { h.status = 'released'; promoteHolds(ctx, h.date); });
    if (Number(fee) > 0) {
      ev.paymentSchedule.push({ id: ctx.id('pay'), label: 'Rescheduling fee', pct: null, dueDate: ctx.today, amount: Number(fee), status: 'scheduled', invoiceId: null, source: 'postponement' });
      ev.contract && (ev.contract.total = Math.round((ev.contract.total + Number(fee)) * 100) / 100);
    }
    ev.decisions.unshift({ id: ctx.id('dec'), decision: `Event postponed from ${fmtDate(old)} to ${fmtDate(newDate)}${reason ? ` — ${reason}` : ''}`, decidedBy: state.clients.find((c) => c.id === ev.clientId)?.name, approvedAt: new Date().toISOString(), recordedBy: ctx.user.id, reference: 'Postponement' });
    ctx.notify({ toRoles: ['planner', 'production', 'finance', 'vendor', 'crew', 'client'], eventId, level: 'warning', text: `${ev.name} POSTPONED to ${fmtDate(newDate)}. Tasks, shifts, load-in dates & payment due dates shifted.` });
    ev.vendorBookings.forEach((b) => { if (b.loadIn) b.loadIn = addDays(b.loadIn.slice(0, 10), delta) + b.loadIn.slice(10); if (b.loadOut) b.loadOut = addDays(b.loadOut.slice(0, 10), delta) + b.loadOut.slice(10); b.status = b.status === 'confirmed' ? 'requested' : b.status; });
    ctx.sideEffects.push({ type: 'decor.move', eventId, newDate });
    return { summary: `Postponed ${ev.name} ${fmtDate(old)} → ${fmtDate(newDate)}; ${ev.tasks.length} tasks shifted`, eventId };
  },
  EVENT_CANCEL(ctx, { eventId, by, reason, calc }) {
    const ev = ctx.ev(eventId);
    assert(!isExit(ev.stage), 'Event already closed');
    ev.prevStage = ev.stage;
    ev.stage = by === 'eo' ? 'cancelled_eo' : 'cancelled_client';
    ev.cancellation = { at: new Date().toISOString(), by, reason, ...calc };
    ev.dateStatus = 'none';
    ctx.state.holds.filter((h) => h.eventId === eventId && h.status === 'active').forEach((h) => { h.status = 'released'; promoteHolds(ctx, h.date); });
    ev.paymentSchedule.filter((p) => p.status === 'scheduled').forEach((p) => (p.status = 'cancelled'));
    ev.invoices.filter((i) => i.status !== 'paid').forEach((i) => {
      const paid = ev.payments.filter((x) => x.invoiceId === i.id).reduce((a, x) => a + x.amount, 0);
      if (paid === 0) i.status = 'void';
    });
    if (calc.refund > 0) {
      ev.creditNotes.push({ id: ctx.id('cn'), number: `CN-${ctx.next('creditNote')}`, amount: calc.refund, reason: `Cancellation refund (${by === 'eo' ? 'by EO' : `${calc.forfeitPct}% forfeited`})`, refund: true, at: new Date().toISOString(), status: 'issued' });
    }
    if (calc.balanceDue > 0) {
      ev.invoices.push({ id: ctx.id('inv'), number: `INV-${ctx.next('invoice')}`, eventId, kind: 'cancellation', label: `Cancellation fee balance (${calc.forfeitPct}%)`, payerId: ev.payers[0]?.id ?? null, amount: calc.balanceDue, currency: ev.currency, fxRateToUSD: ctx.state.settings.fxRates[ev.currency], issuedAt: ctx.today, dueDate: addDays(ctx.today, 14), status: 'sent', lateFeeApplied: 0 });
    }
    ctx.sideEffects.push({ type: 'decor.cancel', eventId });
    ctx.notify({ toRoles: ['planner', 'finance', 'production', 'admin'], eventId, level: 'danger', text: `${ev.name} CANCELLED by ${by === 'eo' ? 'EO' : 'client'}. Fee ${calc.fee}, refund ${calc.refund}.` });
    return { summary: `Cancelled ${ev.name} by ${by.toUpperCase()} (${reason}) — ${calc.daysBefore} days out, forfeit ${calc.forfeitPct}%, fee ${calc.fee}, refund ${calc.refund}`, eventId };
  },
};
