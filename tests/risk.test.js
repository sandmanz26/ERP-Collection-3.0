import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../src/data/seed.js';
import { reducer } from '../src/store/reducer.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { eventFinancials, eventContext, closingChecklist } from '../src/lib/derived.js';
import { transitionBlockers } from '../src/lib/lifecycle.js';
import { vendorGaps, finalPaymentRisk, leadSla, vendorMeals, overtimeQuote, weatherCall } from '../src/lib/risk.js';
import { nextActions } from '../src/lib/eventGuide.js';
import { clientUpdates, clientTeam, clientJourney } from '../src/lib/clientView.js';

const seed = () => ({ ...buildSeed(), effects: [] });
const as = (s, userId) => reducer(s, { type: 'SET_USER', payload: { userId } });
const run = (s, type, payload) => reducer(s, { type, payload });
const carter = (s) => s.events.find((e) => e.id === 'ev_carter');
const today = todayISO();

test('vendor cancels: booking stops, replacement RFQ goes out, gap blocks the event, client is told', () => {
  let s = as(seed(), 'u_planner');
  const band = carter(s).vendorBookings.find((b) => b.category === 'Entertainment');
  s = run(s, 'BOOKING_CANCEL', { eventId: 'ev_carter', bookingId: band.id, initiatedBy: 'vendor', reason: '' });
  assert.ok(s.lastError, 'a reason is required');
  s = run(s, 'BOOKING_CANCEL', { eventId: 'ev_carter', bookingId: band.id, initiatedBy: 'vendor', reason: 'Band split up' });
  const ev = carter(s);
  const b = ev.vendorBookings.find((x) => x.id === band.id);
  assert.equal(b.status, 'cancelled');
  assert.ok(b.payments.every((p) => p.status === 'paid' || p.status === 'cancelled'), 'unpaid installments stop');
  const rfq = ev.rfqs.find((r) => r.replacementFor === b.id);
  if (rfq) assert.ok(!rfq.vendorIds.includes(b.vendorId), 'the cancelling vendor is not asked again');
  assert.equal(vendorGaps(ev)[0].category, 'Entertainment');
  assert.ok(transitionBlockers(ev, 'pre_event', eventContext(s, ev, today)).some((x) => /No Entertainment vendor/.test(x)));
  assert.ok(nextActions(s, ev, today).some((a) => a.severity === 'danger' && /No Entertainment vendor/.test(a.title)));
  const emily = s.users.find((u) => u.id === 'u_client1');
  assert.ok(clientUpdates(s, ev, emily, 20).some((u) => /no longer available/.test(u.text)), 'client gets a neutral notice');
  assert.ok(clientTeam(s, ev).vendors.some((v) => v.replacing && v.category === 'Entertainment'), 'client sees the gap, not a silently shorter list');
  s = run(s, 'BOOKING_CANCEL', { eventId: 'ev_carter', bookingId: band.id, initiatedBy: 'vendor', reason: 'again' });
  assert.match(s.lastError?.message, /already cancelled/);
  s = run(s, 'BOOKING_CONFIRM', { eventId: 'ev_carter', bookingId: band.id });
  assert.match(s.lastError?.message, /cancelled booking cannot be confirmed/);
  s = run(s, 'BOOKING_UPDATE', { eventId: 'ev_carter', bookingId: band.id, patch: { status: 'confirmed' } });
  assert.ok(s.lastError, 'status cannot be patched around the rules');
});

test('vendor who was paid and then cancels leaves a deposit to recover before financial close', () => {
  let s = as(seed(), 'u_planner');
  const caterer = carter(s).vendorBookings.find((b) => b.category === 'Catering');
  s = run(s, 'BOOKING_CANCEL', { eventId: 'ev_carter', bookingId: caterer.id, initiatedBy: 'vendor', reason: 'Kitchen fire' });
  const b = carter(s).vendorBookings.find((x) => x.id === caterer.id);
  assert.equal(b.refundDue, 9900);
  assert.equal(closingChecklist(s, carter(s), today).find((c) => c.key === 'vendorRefunds').done, false);
  s = run(s, 'VENDOR_REFUND_RECOVERED', { eventId: 'ev_carter', bookingId: caterer.id });
  assert.equal(closingChecklist(s, carter(s), today).find((c) => c.key === 'vendorRefunds').done, true);
});

test('bounced deposit: opposite ledger entry, date back on hold, fee re-billed, finance only, once only', () => {
  let s = seed();
  const ev0 = carter(s);
  const dep = ev0.paymentSchedule.find((p) => p.isDeposit);
  const pay = ev0.payments.find((p) => p.invoiceId === dep.invoiceId);
  const paidBefore = eventFinancials(s, ev0).paid;
  s = run(as(s, 'u_planner'), 'PAYMENT_REVERSE', { eventId: 'ev_carter', paymentId: pay.id, reason: 'Card chargeback' });
  assert.match(s.lastError?.message, /Only finance/);
  s = run(as(s, 'u_fin'), 'PAYMENT_REVERSE', { eventId: 'ev_carter', paymentId: pay.id, reason: 'ACH return — insufficient funds', chargeFee: true });
  const ev = carter(s);
  assert.equal(ev.dateStatus, 'hold', 'an unpaid deposit no longer secures the date');
  assert.equal(eventFinancials(s, ev).paid, Math.round((paidBefore - pay.amount) * 100) / 100);
  assert.ok(ev.payments.some((p) => p.reversalOf === pay.id && p.amount === -pay.amount), 'reversal is an entry, not a deletion');
  assert.ok(ev.invoices.some((i) => i.kind === 'fee' && i.amount === 35));
  assert.ok(nextActions(s, ev, today).some((a) => /Collect the deposit/.test(a.title)));
  assert.equal(clientJourney(s, ev).current.id, 'secured', 'the client is not told the date is secured');
  const emily = s.users.find((u) => u.id === 'u_client1');
  assert.ok(!clientUpdates(s, ev, emily, 30).some((u) => u.money < 0), 'a reversal is never shown as a payment received');
  s = run(s, 'PAYMENT_REVERSE', { eventId: 'ev_carter', paymentId: pay.id, reason: 'Card chargeback' });
  assert.match(s.lastError?.message, /already reversed/);
});

test('final balance cutoff blocks pre-event; admin override needs a written reason and is kept', () => {
  let s = seed();
  const ev = carter(s);
  ev.date = addDays(today, 10); // inside the 14-day cutoff with the balance still open
  ev.finalHeadcount = 140;
  ev.stage = 'details_locked';
  const fp = finalPaymentRisk(s, ev, today);
  assert.equal(fp.status, 'breach');
  assert.ok(transitionBlockers(ev, 'pre_event', eventContext(s, ev, today)).some((b) => /Final balance/.test(b)));
  s = run(as(s, 'u_planner'), 'STAGE_CHANGE', { eventId: 'ev_carter', to: 'pre_event', force: true, reason: 'client wiring today' });
  assert.match(s.lastError?.message, /Only an admin/);
  s = run(as(s, 'u_admin'), 'STAGE_CHANGE', { eventId: 'ev_carter', to: 'pre_event', force: true, reason: '' });
  assert.match(s.lastError?.message, /reason/);
  s = run(s, 'STAGE_CHANGE', { eventId: 'ev_carter', to: 'pre_event', force: true, reason: 'Wire confirmed by the bank, lands Monday' });
  assert.equal(carter(s).stage, 'pre_event');
  assert.equal(carter(s).overrides.at(-1).reason, 'Wire confirmed by the bank, lands Monday');
});

test('overtime on the night: priced first, only an authorized client rep can approve, invoiced and counted', () => {
  let s = as(seed(), 'u_crew');
  const q = overtimeQuote(s, carter(s), 60);
  assert.ok(q.lines.some((l) => /Venue/.test(l.label)) && q.lines.some((l) => /Crew/.test(l.label)));
  s = run(s, 'OVERTIME_APPROVE', { eventId: 'ev_carter', minutes: 60, approverName: 'The best man' });
  assert.match(s.lastError?.message, /authorized client representative/);
  s = run(s, 'OVERTIME_APPROVE', { eventId: 'ev_carter', minutes: 60, approverName: 'Emily Carter' });
  const ev = carter(s);
  const inv = ev.invoices.find((i) => i.kind === 'overtime');
  assert.equal(inv.amount, q.total);
  assert.equal(eventFinancials(s, ev).extraCharges, q.total);
  assert.ok(ev.decisions.some((d) => /extended by 60 min/.test(d.decision)));
});

test('weather call: outdoor plan needs a Plan B; the call is recorded and shared', () => {
  let s = as(seed(), 'u_planner');
  s = run(s, 'WEATHER_PLAN_SET', { eventId: 'ev_carter', outdoor: true, subEventId: 'se_c1', planA: 'Roof', planB: '', callHoursBefore: 48 });
  assert.match(s.lastError?.message, /Plan B/);
  const ev0 = carter(s);
  ev0.date = addDays(today, 3); ev0.subEvents.find((x) => x.id === 'se_c1').date = addDays(today, 2);
  assert.ok(nextActions(s, ev0, today).some((a) => /Weather call/.test(a.title)), 'call due soon is surfaced');
  s = run(s, 'WEATHER_CALL', { eventId: 'ev_carter', decision: 'B', note: '70% rain' });
  const w = weatherCall(s, carter(s));
  assert.equal(w.decision, 'B');
  assert.ok(carter(s).decisions[0].decision.includes('Plan B'));
  s = run(s, 'WEATHER_CALL', { eventId: 'ev_acme', decision: 'A' });
  assert.match(s.lastError?.message, /No outdoor function/);
});

test('personal items: received → handed back with names; open items block close-out', () => {
  let s = as(seed(), 'u_crew');
  const harper = s.events.find((e) => e.id === 'ev_harper');
  assert.equal(closingChecklist(s, harper, today).find((c) => c.key === 'custody').done, false);
  const item = harper.custody[0];
  s = run(s, 'CUSTODY_UPDATE', { eventId: 'ev_harper', itemId: item.id, status: 'returned', person: ' ' });
  assert.match(s.lastError?.message, /Who received/);
  s = run(s, 'CUSTODY_UPDATE', { eventId: 'ev_harper', itemId: item.id, status: 'returned', person: 'Diane Harper' });
  const h = s.events.find((e) => e.id === 'ev_harper');
  assert.equal(closingChecklist(s, h, today).find((c) => c.key === 'custody').done, true);
  s = run(s, 'CUSTODY_UPDATE', { eventId: 'ev_carter', itemId: carter(s).custody[0].id, status: 'returned', person: 'Emily' });
  assert.match(s.lastError?.message, /Cannot go from expected to returned/);
});

test('lead SLA, vendor meals', () => {
  const s = seed();
  const lead = s.events.find((e) => e.stage === 'lead');
  const sla = leadSla(s, lead, new Date(Date.parse(lead.createdAt) + 30 * 3600e3));
  assert.equal(sla.breached, true);
  const replied = s.events.find((e) => e.id === 'ev_lead_nguyen');
  assert.equal(leadSla(s, replied), null, 'a logged call counts as a reply');
  const m = vendorMeals(carter(s));
  assert.equal(m.vendors, 13);
  assert.ok(m.total > m.vendors, 'our own staff eat too');
});
