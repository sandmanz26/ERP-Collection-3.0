// Business-risk rules: the things that go wrong on real weddings & events, as pure functions over an event.
// Used by next actions, stage blockers, the closing checklist, Day-of and the client portal.
import { addDays, diffDays } from './dates.js';
import { round2 } from './money.js';
import { invoiceBalance } from './derived.js';

export const RISK_DEFAULTS = {
  finalPaymentCutoffDays: 14, // balance must be in before this many days out, or the event is at risk
  leadResponseHours: 24, // first reply SLA for new inquiries
  returnedPaymentFee: 35, // bank fee re-billed when a payment bounces / is charged back
  overtimeCrewMultiplier: 1.5, // overtime premium on crew hourly rates
  overtimeMarkupPct: 20, // EO margin on crew overtime billed to the client
  weatherCallHours: 48, // default "rain call" before an outdoor function
  vendorLateMinutes: 15, // grace before a vendor counts as late for load-in
  guaranteeReductionPct: 5, // after the guarantee date the count may drop at most this much (then only up)
  oversetPct: 3, // kitchen prepares this many % above the guarantee
  postponementFeePct: 10, // default rescheduling fee, % of the contract
  postponementMax: 1, // postponements allowed by the contract (more need an admin)
};
const S = (state, k) => state.settings?.[k] ?? RISK_DEFAULTS[k];

/** Categories left uncovered: a booking was cancelled and no live booking in that category replaced it. */
export function vendorGaps(ev) {
  const live = ev.vendorBookings.filter((b) => b.status !== 'cancelled');
  const cats = [...new Set(ev.vendorBookings.filter((b) => b.status === 'cancelled').map((b) => b.category))];
  return cats.filter((c) => !live.some((b) => b.category === c)).map((c) => {
    const cancelled = ev.vendorBookings.filter((b) => b.status === 'cancelled' && b.category === c).at(-1);
    const rfq = ev.rfqs.find((r) => r.id === cancelled.replacementRfqId);
    return { category: c, booking: cancelled, rfq, quotes: rfq?.responses.length ?? 0 };
  });
}

/** Deposits the EO already paid to vendors who then cancelled — money to recover. */
export function vendorRefundsDue(ev) {
  return ev.vendorBookings.filter((b) => b.status === 'cancelled' && b.refundDue > 0 && !b.refundRecovered);
}

/** Final balance rule: everything due before the event must be paid by the cutoff. */
export function finalPaymentRisk(state, ev, today) {
  if (!ev.date || !ev.contract) return null;
  const cutoff = addDays(ev.date, -S(state, 'finalPaymentCutoffDays'));
  const open = ev.paymentSchedule.filter((p) => p.status !== 'paid' && p.status !== 'cancelled' && p.dueDate <= ev.date);
  const balance = round2(open.reduce((a, p) => {
    const inv = ev.invoices.find((i) => i.id === p.invoiceId);
    return a + (inv ? invoiceBalance(ev, inv) : p.amount);
  }, 0));
  if (balance <= 0) return { status: 'ok', cutoff, balance: 0 };
  const days = diffDays(today, cutoff);
  return { status: days < 0 ? 'breach' : days <= 10 ? 'at_risk' : 'ok', cutoff, balance, days };
}

/** Outdoor functions need a weather call (Plan A / Plan B) before a deadline. */
export function weatherCall(state, ev, now = new Date()) {
  const c = ev.contingency;
  if (!c?.outdoor || !ev.date) return null;
  const se = ev.subEvents.find((s) => s.id === c.subEventId);
  const start = new Date(`${se?.date ?? ev.date}T${se?.start ?? '12:00'}:00`);
  const due = new Date(start.getTime() - (c.callHoursBefore ?? S(state, 'weatherCallHours')) * 3600e3);
  const hoursToDue = (due - now) / 3600e3;
  return { ...c, function: se?.name ?? ev.name, start: start.toISOString(), due: due.toISOString(), decided: !!c.decision, overdue: !c.decision && hoursToDue < 0, soon: !c.decision && hoursToDue >= 0 && hoursToDue <= 7 * 24, hoursToDue };
}

/** New inquiries must get a first reply fast — the first planner to answer usually wins the wedding. */
export function leadSla(state, ev, now = new Date()) {
  if (!['lead', 'qualified'].includes(ev.stage) || !ev.createdAt) return null;
  const replied = (ev.interactions || []).some((i) => i.direction !== 'inbound' && i.type !== 'note');
  if (replied) return null;
  const hours = (now - new Date(ev.createdAt)) / 3600e3;
  const limit = S(state, 'leadResponseHours');
  return { hours: Math.round(hours), limit, breached: hours > limit, dueAt: new Date(new Date(ev.createdAt).getTime() + limit * 3600e3).toISOString() };
}

/** Personal items in our custody (card box, gifts, heirlooms, marriage licence) not yet handed back. */
export function custodyOpen(ev) {
  return (ev.custody || []).filter((c) => c.status !== 'returned');
}

/** Vendor meals: crew of the photographer, band, planner team etc. must be in the caterer count. */
export function vendorMeals(ev) {
  const rows = ev.vendorBookings.filter((b) => b.status !== 'cancelled' && b.meals > 0).map((b) => ({ bookingId: b.id, category: b.category, meals: b.meals }));
  const staff = (ev.shifts || []).length;
  return { rows, vendors: rows.reduce((a, r) => a + r.meals, 0), staff, total: rows.reduce((a, r) => a + r.meals, 0) + staff };
}

/** On the day: vendors past their load-in (plus grace) without an arrival check-in. */
export function lateVendors(state, ev, now = new Date()) {
  const grace = S(state, 'vendorLateMinutes');
  return ev.vendorBookings.filter((b) => b.status !== 'cancelled' && b.loadIn && !b.arrivedAt)
    .map((b) => ({ booking: b, minutesLate: Math.round((now - new Date(b.loadIn)) / 60000) }))
    .filter((x) => x.minutesLate > grace);
}

/**
 * Overtime quote when the party runs late. Client prices only:
 * venue overtime rate, vendor overtime rates (sell), crew still on site at the end at OT premium + EO markup.
 */
export function overtimeQuote(state, ev, minutes) {
  const hours = round2(minutes / 60);
  const lines = [];
  if (ev.venue?.overtimeRatePerHour) lines.push({ label: `Venue — ${ev.venue.name}`, hours, rate: ev.venue.overtimeRatePerHour, amount: round2(ev.venue.overtimeRatePerHour * hours) });
  ev.vendorBookings.filter((b) => b.status !== 'cancelled' && b.overtimeRatePerHour).forEach((b) => {
    const v = state.vendors.find((x) => x.id === b.vendorId);
    lines.push({ label: `${v?.name ?? 'Vendor'} (${b.category})`, hours, rate: b.overtimeRatePerHour, amount: round2(b.overtimeRatePerHour * hours) });
  });
  const lastEnd = (ev.positions || []).filter((p) => p.rate && p.end >= '23:00');
  const mult = S(state, 'overtimeCrewMultiplier') * (1 + S(state, 'overtimeMarkupPct') / 100);
  lastEnd.forEach((p) => lines.push({ label: `Crew — ${p.qty} × ${p.role}`, hours, rate: round2(p.rate * p.qty * mult), amount: round2(p.rate * p.qty * mult * hours) }));
  return { minutes, hours, lines, total: round2(lines.reduce((a, l) => a + l.amount, 0)) };
}

/** People allowed to approve extra cost on the night: client users with approve_costs + the client's decision makers. */
export function overtimeApprovers(state, ev) {
  const client = state.clients.find((c) => c.id === ev.clientId);
  const users = state.users.filter((u) => u.role === 'client' && u.clientId === ev.clientId && (u.permissions || []).includes('approve_costs')).map((u) => u.name);
  const dms = (client?.decisionMakers || []).map((d) => d.split(' (')[0]);
  return [...new Set([...users, ...dms])];
}
