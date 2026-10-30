import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../src/data/seed.js';
import { reducer } from '../src/store/reducer.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { eventContext } from '../src/lib/derived.js';
import { transitionBlockers } from '../src/lib/lifecycle.js';
import { nextActions } from '../src/lib/eventGuide.js';
import { roomBlockStatus, allergySheet, permitPlan, capacityIssues, postponementTerms, guaranteeCheck } from '../src/lib/obligations.js';

const seed = () => ({ ...buildSeed(), effects: [] });
const as = (s, userId) => reducer(s, { type: 'SET_USER', payload: { userId } });
const run = (s, type, payload) => reducer(s, { type, payload });
const carter = (s) => s.events.find((e) => e.id === 'ev_carter');
const today = todayISO();

test('room block: attrition exposure, release before cutoff, settle after cutoff into a change order', () => {
  let s = as(seed(), 'u_planner');
  const b = carter(s).roomBlocks[0];
  const st = roomBlockStatus(b, today);
  assert.equal(st.minRooms, 16);
  assert.equal(st.shortfall, 5);
  assert.equal(st.exposure, 5 * 289 * 2);
  assert.equal(st.level, 'warning', '18 days to cutoff and short');
  assert.ok(nextActions(s, carter(s), today).some((a) => /Hotel Hugo/.test(a.title)), 'shows up as a next step');

  s = run(s, 'ROOM_BLOCK_PICKUP', { eventId: 'ev_carter', blockId: b.id, pickedUp: 25 });
  assert.match(s.lastError.message, /Only 20 rooms/);
  s = run(s, 'ROOM_BLOCK_SETTLE', { eventId: 'ev_carter', blockId: b.id });
  assert.match(s.lastError.message, /Settle after the cutoff/);
  s = run(s, 'ROOM_BLOCK_RELEASE', { eventId: 'ev_carter', blockId: b.id, rooms: 10 });
  assert.match(s.lastError.message, /11 rooms are already booked/);
  s = run(s, 'ROOM_BLOCK_RELEASE', { eventId: 'ev_carter', blockId: b.id, rooms: 6 });
  assert.equal(carter(s).roomBlocks[0].rooms, 14);
  assert.equal(roomBlockStatus(carter(s).roomBlocks[0], today).shortfall, 1, 'releasing rooms shrinks the exposure');

  // jump past the cutoff
  carter(s).roomBlocks[0].cutoffDate = addDays(today, -1);
  s = run(s, 'ROOM_BLOCK_RELEASE', { eventId: 'ev_carter', blockId: b.id, rooms: 1 });
  assert.match(s.lastError.message, /cutoff .* has passed/);
  const cos = carter(s).changeOrders.length;
  s = run(s, 'ROOM_BLOCK_SETTLE', { eventId: 'ev_carter', blockId: b.id, passToClient: true });
  const rb = carter(s).roomBlocks[0];
  assert.equal(rb.status, 'settled');
  assert.equal(rb.attritionCharge, 289 * 2);
  assert.equal(carter(s).changeOrders.length, cos + 1, 'attrition passed to the client as a draft CO');
  s = run(s, 'ROOM_BLOCK_PICKUP', { eventId: 'ev_carter', blockId: b.id, pickedUp: 12 });
  assert.match(s.lastError.message, /already settled/);
});

test('audit clause: rooms booked outside the block count only when the contract says so', () => {
  const b = { rooms: 100, nights: 1, rate: 100, attritionPct: 80, pickedUp: 70, outsideBookings: 15, cutoffDate: addDays(today, 30), status: 'open' };
  assert.equal(roomBlockStatus({ ...b, auditClause: false }, today).shortfall, 10);
  assert.equal(roomBlockStatus({ ...b, auditClause: true }, today).shortfall, 0);
});

test('guarantee: below a vendor minimum needs acknowledgement; after the guarantee date the count only drops 5%', () => {
  let s = as(seed(), 'u_planner');
  const ev = carter(s);
  const cat = ev.vendorBookings.find((b) => b.minGuarantee);
  assert.ok(cat, 'the caterer has a minimum guarantee');
  {
    const low = cat.minGuarantee - 10;
    s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: low });
    assert.match(s.lastError.message, /Below the minimum guarantee/);
    s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: low, acknowledgeShortfall: true });
    assert.equal(carter(s).finalHeadcount, low);
    assert.match(carter(s).decisions[0].decision, /below guarantee/);
  }
  s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: 999, acknowledgeShortfall: true });
  assert.match(s.lastError.message, /licensed capacity of 180/);
  // after the guarantee date (admin only), a big drop needs the venue's written agreement
  s = as(s, 'u_admin');
  s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: 160, acknowledgeShortfall: true });
  carter(s).date = addDays(today, 5);
  const g = guaranteeCheck(s, carter(s), 140);
  assert.equal(g.reductionFloor, 152);
  s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: 140, acknowledgeShortfall: true });
  assert.match(s.lastError.message, /can drop at most 5%/);
  s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: 155, acknowledgeShortfall: true });
  assert.equal(carter(s).finalHeadcount, 155, 'within tolerance');
  s = run(s, 'FINAL_HEADCOUNT_SET', { eventId: 'ev_carter', count: 140, acknowledgeShortfall: true, override: 'Venue email 12 Jan agrees to 140' });
  assert.equal(carter(s).finalHeadcount, 140);
});

test('severe allergy: sheet per table, caterer sign-off goes stale on change, blocks Pre-Event until signed', () => {
  let s = as(seed(), 'u_planner');
  let sheet = allergySheet(carter(s));
  assert.equal(sheet.severe.length, 1);
  assert.ok(sheet.severe[0].table, 'seated');
  const ctx = () => eventContext(s, carter(s), today);
  assert.ok(transitionBlockers(carter(s), 'pre_event', ctx()).some((b) => /allergy sheet not signed/i.test(b)));
  s = run(s, 'ALLERGY_SIGNOFF', { eventId: 'ev_carter', by: '' });
  assert.match(s.lastError.message, /Who signed/);
  s = run(s, 'ALLERGY_SIGNOFF', { eventId: 'ev_carter', by: 'Chef Marco (Gourmet Table)' });
  assert.ok(allergySheet(carter(s)).signed);
  assert.ok(!transitionBlockers(carter(s), 'pre_event', ctx()).some((b) => /allergy/i.test(b)));
  // a second severe case after sign-off → stale
  const g = carter(s).households.flatMap((h) => h.guests).find((x) => x.tableId && !x.allergySeverity);
  s = run(s, 'GUEST_UPDATE', { eventId: 'ev_carter', guestId: g.id, patch: { dietary: 'Shellfish (anaphylaxis)', allergySeverity: 'severe' } });
  sheet = allergySheet(carter(s));
  assert.ok(sheet.stale && !sheet.signed);
  assert.ok(transitionBlockers(carter(s), 'pre_event', ctx()).some((b) => /changed since/.test(b)));
  // an unseated severe case cannot be signed off
  s = run(s, 'GUEST_UPDATE', { eventId: 'ev_carter', guestId: g.id, patch: { tableId: null } });
  s = run(s, 'ALLERGY_SIGNOFF', { eventId: 'ev_carter', by: 'Chef Marco' });
  assert.match(s.lastError.message, /Seat every guest/);
});

test('capacity: public RSVP cannot overfill a licensed room; over-capacity blocks Pre-Event', () => {
  let s = as(seed(), 'u_planner');
  const ev = carter(s);
  const se = ev.subEvents.find((x) => x.name === 'Welcome Dinner');
  const yes = ev.households.flatMap((h) => h.guests).filter((g) => g.rsvp[se.id] === 'yes').length;
  s = run(s, 'CAPACITY_SET', { eventId: 'ev_carter', subEventId: se.id, capacity: yes });
  const h = carter(s).households.find((x) => x.invitedSubEventIds.includes(se.id) && x.guests.some((g) => g.rsvp[se.id] !== 'yes'));
  const g = h.guests.find((x) => x.rsvp[se.id] !== 'yes');
  s = run(s, 'RSVP_SET', { eventId: 'ev_carter', guestId: g.id, subEventId: se.id, value: 'yes', viaPublic: true });
  assert.match(s.lastError.message, /at capacity/);
  s = run(s, 'RSVP_SET', { eventId: 'ev_carter', guestId: g.id, subEventId: se.id, value: 'yes' });
  assert.equal(s.lastError, null, 'staff can still confirm (e.g. after moving rooms)');
  assert.ok(capacityIssues(carter(s)).some((c) => c.subEventId === se.id));
  assert.ok(transitionBlockers(carter(s), 'pre_event', eventContext(s, carter(s), today)).some((b) => /licensed for/.test(b)));
});

test('permits: rules by country and plan; approval needs a reference', () => {
  let s = as(seed(), 'u_planner');
  let plan = permitPlan(s, carter(s), today);
  assert.ok(plan.rows.some((p) => p.kind === 'pyro'), 'sparkler send-off CO → pyrotechnics approval');
  assert.ok(!plan.rows.some((p) => p.kind === 'crowd'), 'crowd permit is an Indonesian rule');
  const id = { ...carter(s), jurisdictionId: 'ID-JKT', guestCount: 1200, finalHeadcount: null };
  const crowd = permitPlan(s, id, today).rows.find((p) => p.kind === 'crowd');
  assert.match(crowd.authority, /Polres/);
  assert.match(permitPlan(s, { ...id, guestCount: 400 }, today).rows.find((p) => p.kind === 'crowd').authority, /Polsek/);
  s = run(s, 'PERMIT_SET', { eventId: 'ev_carter', kind: 'pyro', status: 'approved' });
  assert.match(s.lastError.message, /permit number/);
  s = run(s, 'PERMIT_SET', { eventId: 'ev_carter', kind: 'pyro', status: 'approved', reference: 'FDNY-PY-2291' });
  plan = permitPlan(s, carter(s), today);
  assert.ok(!plan.open.some((p) => p.kind === 'pyro'));
});

test('postponement: one allowed by contract, a second needs an admin; fee suggestion follows the terms', () => {
  let s = as(seed(), 'u_planner');
  const t = postponementTerms(s, carter(s));
  assert.equal(t.suggestedFee, Math.round(carter(s).contract.total * 10) / 100);
  const d1 = addDays(carter(s).date, 7);
  s = run(s, 'EVENT_POSTPONE', { eventId: 'ev_carter', newDate: d1, reason: 'Venue flood', fee: 0 });
  assert.equal(s.lastError, null);
  {
    s = run(s, 'EVENT_POSTPONE', { eventId: 'ev_carter', newDate: addDays(d1, 7), reason: 'Again', fee: 0 });
    assert.match(s.lastError.message, /allows 1 postponement/);
  }
});

test('templates: akad + resepsi functions are added once, relative to the date', () => {
  let s = as(seed(), 'u_planner');
  const n = carter(s).subEvents.length;
  s = run(s, 'FUNCTIONS_FROM_TEMPLATE', { eventId: 'ev_carter', templateId: 'id_akad_resepsi' });
  assert.equal(carter(s).subEvents.length, n + 3);
  assert.ok(carter(s).subEvents.some((x) => x.name === 'Akad nikah' && x.date === carter(s).date));
  s = run(s, 'FUNCTIONS_FROM_TEMPLATE', { eventId: 'ev_carter', templateId: 'id_akad_resepsi' });
  assert.match(s.lastError.message, /already exist/);
});
