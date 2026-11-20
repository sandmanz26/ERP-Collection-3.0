import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../src/data/seed.js';
import { reducer } from '../src/store/reducer.js';
import { todayISO } from '../src/lib/dates.js';
import { eventHealth, vendorBadges, whatsappLink, agencyRecap, recapText, recentMilestone, paymentReminderText } from '../src/lib/growth.js';

const seed = () => ({ ...buildSeed(), effects: [] });
const as = (s, userId) => reducer(s, { type: 'SET_USER', payload: { userId } });
const run = (s, type, payload) => reducer(s, { type, payload });
const today = todayISO();

test('event health: booked events only, real risks lower it, fixing a risk raises it', () => {
  let s = as(seed(), 'u_planner');
  const carter = () => s.events.find((e) => e.id === 'ev_carter');
  const h = eventHealth(s, carter(), today);
  assert.ok(h.score >= 0 && h.score <= 100);
  assert.ok(h.score < 85, 'the seeded wedding has overdue payment, COI, conflicts → not on track');
  assert.ok(h.drivers.length > 0, 'every point lost is explained');
  const lead = s.events.find((e) => e.stage === 'lead');
  assert.equal(eventHealth(s, lead, today), null, 'sales deals are not scored');
  s = run(s, 'ALLERGY_SIGNOFF', { eventId: 'ev_carter', by: 'Chef Marco' });
  assert.ok(eventHealth(s, carter(), today).score >= h.score, 'resolving a risk never lowers the score');
});

test('vendor badges are earned from recorded data; a vendor who cancels loses them', () => {
  let s = as(seed(), 'u_planner');
  const groove = s.vendors.find((v) => v.name.startsWith('Groove'));
  const lens = s.vendors.find((v) => v.id === 'vd_lens');
  assert.ok(vendorBadges(s, lens, today).some((b) => b.id === 'quick'), 'quoted within 3 days of the RFQ');
  const band = s.events.find((e) => e.id === 'ev_carter').vendorBookings.find((b) => b.vendorId === groove.id);
  s = run(s, 'BOOKING_CANCEL', { eventId: 'ev_carter', bookingId: band.id, initiatedBy: 'vendor', reason: 'Band split up' });
  const badges = vendorBadges(s, s.vendors.find((v) => v.id === groove.id), today);
  assert.ok(badges.some((b) => b.id === 'cancelled' && b.negative));
});

test('whatsapp links use digits only and refuse a missing number', () => {
  assert.equal(whatsappLink('+62 812-3456-7890', 'Halo'), 'https://wa.me/6281234567890?text=Halo');
  assert.equal(whatsappLink('', 'x'), null);
  const s = seed();
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const inv = ev.invoices.find((i) => i.dueDate < today && i.status !== 'paid') ?? ev.invoices[0];
  assert.match(paymentReminderText(s, ev, inv, today), new RegExp(inv.number));
});

test('monthly recap adds up and reads as a shareable summary', () => {
  let s = as(seed(), 'u_fin');
  const before = agencyRecap(s, today);
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const inv = ev.invoices.find((i) => i.status !== 'paid');
  s = run(s, 'PAYMENT_RECORD', { eventId: 'ev_carter', invoiceId: inv.id, amount: 1000, method: 'card' });
  const after = agencyRecap(s, today);
  assert.equal(s.lastError, null);
  assert.ok(after.collected > before.collected, 'a payment today counts toward collected');
  assert.match(recapText(s, after), /the last 30 days/);
});

test('client milestone: the latest step done in the last two weeks', () => {
  const steps = [{ id: 'a', status: 'done', date: '2026-01-01' }, { id: 'b', status: 'done', date: today }, { id: 'c', status: 'current', date: null }];
  assert.equal(recentMilestone(steps, today).id, 'b');
  assert.equal(recentMilestone(steps.slice(0, 1), today), null);
});
