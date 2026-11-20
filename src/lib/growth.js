// Product bets from the competitive research (docs/COMPETITIVE_STRATEGY.md):
// Event Health score, vendor reliability badges earned from data, WhatsApp deep links,
// the agency's monthly recap and client milestones. Pure functions.
import { diffDays, addDays, fmtDate } from './dates.js';
import { stageIndex } from './lifecycle.js';
import { readiness, nextActions } from './eventGuide.js';
import { vendorScore, invoiceStatus, invoiceBalance, toBase, baseCurrency } from './derived.js';
import { fmtMoney } from './money.js';

/* ---------- Event Health (0–100) ----------
 * Not points for clicking: every deduction is a real risk on the event, so "100 before T-7" is the goal
 * the business actually wants. Only for booked events (sales deals have their own pipeline signals). */
export function eventHealth(state, ev, today) {
  if (!ev.date || stageIndex(ev.stage) < stageIndex('booked') || stageIndex(ev.stage) > stageIndex('event_day')) return null;
  const drivers = [];
  readiness(state, ev, today).forEach((a) => {
    if (a.status === 'blocked') drivers.push({ pts: 15, text: `${a.label}: ${a.summary}` });
    else if (a.status === 'attention') drivers.push({ pts: 8, text: `${a.label}: ${a.summary}` });
  });
  nextActions(state, ev, today).forEach((a) => {
    if (a.severity === 'danger') drivers.push({ pts: 10, text: a.title });
    else if (a.severity === 'warning') drivers.push({ pts: 4, text: a.title });
  });
  // the closer the date, the heavier the same problem weighs
  const days = diffDays(today, ev.date);
  const weight = days <= 7 ? 1.5 : days <= 30 ? 1.2 : 1;
  const lost = drivers.reduce((a, d) => a + d.pts, 0) * weight;
  const score = Math.max(0, Math.min(100, Math.round(100 - lost)));
  const tone = score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'danger';
  return { score, tone, label: score >= 85 ? 'On track' : score >= 60 ? 'Watch' : 'At risk', drivers: drivers.sort((a, b) => b.pts - a.pts).map((d) => d.text), days };
}

/* ---------- Vendor reliability badges ----------
 * Earned only from what the system recorded — never self-declared, never bought. */
export function vendorBadges(state, v, today) {
  const out = [];
  const bookings = state.events.flatMap((e) => e.vendorBookings.filter((b) => b.vendorId === v.id).map((b) => ({ b, e })));
  const live = bookings.filter(({ b }) => b.status !== 'cancelled');
  // compliance is table stakes (its own column), so it is not a badge; badges only mark what sets a vendor apart
  const arrivals = bookings.filter(({ b }) => b.arrivedAt && b.loadIn);
  const onTimeArrivals = arrivals.filter(({ b }) => (new Date(b.arrivedAt) - new Date(b.loadIn)) / 60000 <= (state.settings.vendorLateMinutes ?? 15));
  const perf = v.performance || [];
  const onTimeReviews = perf.filter((p) => p.onTime >= 4.5).length;
  if ((arrivals.length >= 1 && onTimeArrivals.length === arrivals.length) || (perf.length >= 2 && onTimeReviews === perf.length)) out.push({ id: 'ontime', label: 'On time', why: arrivals.length ? `${onTimeArrivals.length}/${arrivals.length} recorded load-ins on time` : `On-time rated 4.5+ on ${perf.length} events` });
  const quotes = state.events.flatMap((e) => (e.rfqs || []).flatMap((r) => (r.responses || []).filter((x) => x.vendorId === v.id && x.at).map((x) => ({ r, x }))));
  const fast = quotes.filter(({ r, x }) => (new Date(x.at) - new Date(r.createdAt)) / 3600000 <= 72);
  if (quotes.length && fast.length === quotes.length) out.push({ id: 'quick', label: 'Quick quotes', why: `${fast.length} quote(s) within 3 days` });
  const events = new Set(live.map(({ e }) => e.id));
  if (events.size >= 3) out.push({ id: 'repeat', label: 'Repeat partner', why: `Booked on ${events.size} events` });
  if (perf.length >= 3 && vendorScore(v) >= 4.7) out.push({ id: 'top', label: 'Top rated', why: `${vendorScore(v)} across ${perf.length} reviews` });
  if (bookings.some(({ b }) => b.status === 'cancelled' && b.cancelledBy === 'vendor')) return out.filter((x) => x.id !== 'repeat' && x.id !== 'top').concat([{ id: 'cancelled', label: 'Cancelled on us', why: 'Withdrew from a confirmed booking', negative: true }]);
  return out;
}

/* ---------- WhatsApp ----------
 * Clients and vendors live in WhatsApp; wa.me links open the chat with the message filled in. */
export function whatsappLink(phone, text) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function paymentReminderText(state, ev, inv, today) {
  const st = invoiceStatus(ev, inv, today);
  const bal = fmtMoney(invoiceBalance(ev, inv), inv.currency);
  const who = state.settings.company?.name ?? 'your planner';
  return st === 'overdue'
    ? `Hi! A friendly reminder from ${who}: invoice ${inv.number} for ${ev.name} (${bal}) was due on ${fmtDate(inv.dueDate)}. You can pay it in your client portal. Thank you!`
    : `Hi! ${who} here: invoice ${inv.number} for ${ev.name} (${bal}) is due on ${fmtDate(inv.dueDate)}. You can pay it in your client portal.`;
}

export function vendorConfirmText(state, ev, b) {
  const v = state.vendors.find((x) => x.id === b.vendorId);
  return `Hi ${v?.contact?.split(' ')[0] ?? ''}, ${state.settings.company?.name ?? 'we'} here about ${ev.name} on ${fmtDate(ev.date)} at ${ev.venue?.name ?? 'the venue'}.${b.loadIn ? ` Load-in ${fmtDate(b.loadIn.slice(0, 10))} ${b.loadIn.slice(11, 16)}.` : ''} Please confirm in the vendor portal.`;
}

/* ---------- monthly recap for the agency (shareable) ---------- */
export function agencyRecap(state, today, days = 30) {
  const from = addDays(today, -days);
  const held = state.events.filter((e) => e.date && e.date >= from && e.date <= today && stageIndex(e.stage) >= stageIndex('event_day'));
  const day = (iso) => (iso || '').slice(0, 10);
  const payments = state.events.flatMap((e) => (e.payments || []).filter((p) => day(p.at) >= from && day(p.at) <= today && p.amount > 0).map((p) => ({ p, e })));
  const base = baseCurrency(state);
  const collected = payments.reduce((a, { p, e }) => a + toBase(state, p.amount, e.currency), 0);
  const invoicesDue = state.events.flatMap((e) => e.invoices.filter((i) => i.dueDate >= from && i.dueDate <= today && i.kind !== 'fee').map((i) => ({ i, e })));
  const paidOnTime = invoicesDue.filter(({ i, e }) => (e.payments || []).filter((p) => p.invoiceId === i.id).some((p) => day(p.at) <= i.dueDate) && invoiceBalance(e, i) <= 0.5).length;
  const vendorCancels = state.events.flatMap((e) => e.vendorBookings.filter((b) => b.status === 'cancelled' && b.cancelledBy === 'vendor' && day(b.cancelledAt) >= from)).length;
  const signedOn = (e) => (e.contract?.immutable ? e.contract.signers.map((x) => day(x.signedAt)).sort().pop() : '');
  const booked = state.events.filter((e) => signedOn(e) >= from && signedOn(e) <= today).length;
  const health = state.events.map((e) => eventHealth(state, e, today)).filter(Boolean);
  const avgHealth = health.length ? Math.round(health.reduce((a, h) => a + h.score, 0) / health.length) : null;
  return { days, held: held.length, booked, collected, base, onTimeRate: invoicesDue.length ? Math.round((paidOnTime / invoicesDue.length) * 100) : null, invoicesDue: invoicesDue.length, vendorCancels, avgHealth, upcoming: health.length };
}

export function recapText(state, r) {
  return [
    `${state.settings.company?.name ?? 'Our agency'} — the last ${r.days} days`,
    `${r.held} event(s) delivered, ${r.booked} new booking(s)`,
    `${fmtMoney(r.collected, r.base, { whole: true })} collected`,
    r.onTimeRate === null ? null : `${r.onTimeRate}% of invoices paid on time`,
    `${r.vendorCancels} vendor cancellation(s)`,
    r.avgHealth === null ? null : `Upcoming events average ${r.avgHealth}/100 health`,
  ].filter(Boolean).join('\n');
}

/* ---------- client milestones ---------- */
/** A milestone the client reached in the last `withinDays` days — the portal celebrates it once. */
export function recentMilestone(steps, today, withinDays = 14) {
  const done = steps.filter((s) => s.status === 'done' && s.date && diffDays(s.date, today) <= withinDays && diffDays(s.date, today) >= 0);
  return done.length ? done[done.length - 1] : null;
}
