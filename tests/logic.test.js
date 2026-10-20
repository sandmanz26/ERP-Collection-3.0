import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLines, calcTax, calcProposal } from '../src/lib/pricing.js';
import { generatePaymentSchedule, calcCancellation } from '../src/lib/contracts.js';
import { shiftTasks, generateTasks } from '../src/lib/tasks.js';
import { shiftCost, findConflicts } from '../src/lib/staff.js';
import { shiftFrom } from '../src/lib/ros.js';
import { availability } from '../src/lib/availability.js';
import { buildSeed } from '../src/data/seed.js';
import { reducer } from '../src/store/reducer.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { eventFinancials, leakage } from '../src/lib/derived.js';

const JUR = [
  { id: 'NY', region: 'US', rate: 10, taxServiceFees: true, name: 'NY' },
  { id: 'CA', region: 'US', rate: 10, taxServiceFees: false, name: 'CA' },
  { id: 'FR', region: 'EU', rate: 20, name: 'FR' },
];
const lines = [
  { id: 'a', pricing: 'fixed', qty: 2, unitPrice: 100, unitCost: 40, optional: false, selected: true },
  { id: 'b', pricing: 'per_guest', unitPrice: 10, unitCost: 5, optional: false, selected: true },
  { id: 'c', pricing: 'fixed', qty: 1, unitPrice: 500, unitCost: 0, optional: true, selected: false },
  { id: 'd', pricing: 'percentage', pct: 20, costPct: 0, optional: false, selected: true },
];

test('pricing: fixed, per-guest, percentage, optional', () => {
  const r = calcLines(lines, 50);
  assert.equal(r[0].amount, 200);
  assert.equal(r[1].amount, 500);
  assert.equal(r[2].active, false);
  assert.equal(r[3].amount, 140); // 20% of 700
});

test('tax: US service fee taxability differs per jurisdiction', () => {
  const r = calcLines(lines, 50);
  assert.equal(calcTax({ lines: r, jurisdiction: JUR[0] }).taxAmount, 84);
  assert.equal(calcTax({ lines: r, jurisdiction: JUR[1] }).taxAmount, 70);
});

test('tax: EU reverse charge for cross-border B2B', () => {
  const r = calcLines(lines, 50);
  const b2b = calcTax({ lines: r, jurisdiction: JUR[2], client: { type: 'company', vatId: 'DE1', country: 'DE' }, companyCountry: 'FR' });
  assert.equal(b2b.reverseCharge, true);
  assert.equal(b2b.taxAmount, 0);
  const b2c = calcTax({ lines: r, jurisdiction: JUR[2], client: { type: 'individual', country: 'DE' }, companyCountry: 'FR' });
  assert.equal(b2c.taxAmount, 168);
  const p = calcProposal({ lines, guestCount: 50, jurisdictionId: 'FR' }, { jurisdictions: JUR, client: {}, companyCountry: 'FR' });
  assert.equal(p.total, 1008);
});

test('payment schedule 30/40/30 sums to total; late booking due now', () => {
  const tpl = { installments: [{ label: 'd', pct: 30, due: 'signing' }, { label: 's', pct: 40, due: { daysBefore: 90 } }, { label: 'f', pct: 30, due: { daysBefore: 14 } }] };
  let i = 0;
  const s = generatePaymentSchedule({ total: 1000.01, eventDate: '2027-06-01', signDate: '2027-04-01', template: tpl, idFn: () => `x${i++}` });
  assert.equal(Math.round(s.reduce((a, x) => a + x.amount, 0) * 100) / 100, 1000.01);
  assert.equal(s[1].dueDate, '2027-04-01'); // T-90 before signing -> due at signing
  assert.equal(s[2].dueDate, '2027-05-18');
});

test('cancellation table', () => {
  const policy = { rows: [{ minDaysBefore: 180, forfeitPct: 30 }, { minDaysBefore: 90, forfeitPct: 50 }, { minDaysBefore: 0, forfeitPct: 100 }] };
  const r = calcCancellation({ policy, contractTotal: 10000, paid: 3000, eventDate: '2027-06-01', cancelDate: '2027-02-01' });
  assert.equal(r.forfeitPct, 50);
  assert.equal(r.fee, 5000);
  assert.equal(r.balanceDue, 2000);
  const eo = calcCancellation({ policy, contractTotal: 10000, paid: 3000, eventDate: '2027-06-01', cancelDate: '2027-02-01', byEO: true });
  assert.equal(eo.refund, 3000);
});

test('tasks shift when event date moves', () => {
  let i = 0;
  const t = generateTasks([{ key: 'a', title: 'A', offsetDays: -14 }], '2027-06-01', () => `t${i++}`);
  assert.equal(t[0].dueDate, '2027-05-18');
  assert.equal(shiftTasks(t, '2027-07-01')[0].dueDate, '2027-06-17');
});

test('overtime CA daily rules & conflicts', () => {
  const c = shiftCost({ start: '08:00', end: '22:00' }, { rate: 10, rateType: 'hourly', laborRegion: 'US-CA' });
  assert.equal(c.ot, 4);
  assert.equal(c.dt, 2);
  assert.equal(c.cost, 80 + 60 + 40);
  const conf = findConflicts([{ staffId: 's', date: 'd', start: '10:00', end: '14:00' }, { staffId: 's', date: 'd', start: '13:00', end: '18:00' }]);
  assert.equal(conf.length, 1);
});

test('run of show shift moves later items only', () => {
  const items = [{ id: '1', subEventId: 's', track: 'g', start: '10:00' }, { id: '2', subEventId: 's', track: 'g', start: '11:00' }, { id: '3', subEventId: 's', track: 'g', start: '09:00' }];
  const r = shiftFrom(items, '1', 15);
  assert.deepEqual(r.map((x) => x.start), ['10:15', '11:15', '09:00']);
});

function run(state, type, payload, userId) {
  if (userId) state = reducer(state, { type: 'SET_USER', payload: { userId } });
  return reducer(state, { type, payload });
}

test('store: lead -> proposal -> contract -> deposit locks date; all logged', () => {
  let s = { ...buildSeed(), effects: [] };
  const date = addDays(todayISO(), 200);
  s = run(s, 'LEAD_CREATE', { name: 'Test Wedding', eventTypeId: 'wedding', clientName: 'Jo Test', email: 'jo@x.com', source: 'Website form', date, guestCount: 100, budget: 50000 }, 'u_sales');
  const id = s.events[0].id;
  s = run(s, 'HOLD_CREATE', { eventId: id, date });
  assert.equal(s.events[0].dateStatus, 'hold');
  s = run(s, 'STAGE_CHANGE', { eventId: id, to: 'qualified' });
  assert.equal(s.events[0].stage, 'qualified');
  s = run(s, 'STAGE_CHANGE', { eventId: id, to: 'booked' });
  assert.ok(s.lastError, 'booking without contract must be rejected');
  assert.equal(s.activityLog[0].status, 'rejected');
  s = run(s, 'PROPOSAL_CREATE', { eventId: id });
  s = run(s, 'PROPOSAL_ACTIVATE', { eventId: id, versionId: s.events[0].proposals[0].id });
  assert.equal(s.events[0].stage, 'proposal_sent');
  s = run(s, 'PROPOSAL_ACCEPT', { eventId: id, versionId: s.events[0].proposals[0].id });
  s = run(s, 'CONTRACT_GENERATE', { eventId: id, signers: [{ name: 'Jo Test', email: 'jo@x.com', role: 'Client' }], paymentScheduleId: 'ps_social', cancellationPolicyId: 'cp_social' });
  s = run(s, 'CONTRACT_SEND', { eventId: id });
  s = run(s, 'CONTRACT_SIGN', { eventId: id, signerId: s.events[0].contract.signers[0].id, typedName: 'Jo Test' });
  let ev = s.events[0];
  assert.equal(ev.stage, 'booked');
  assert.equal(ev.contract.immutable, true);
  assert.equal(ev.dateStatus, 'hold', 'signed but not paid = still hold');
  assert.equal(ev.invoices.length, 1);
  s = run(s, 'PAYMENT_RECORD', { eventId: id, invoiceId: ev.invoices[0].id, amount: ev.invoices[0].amount, method: 'card' });
  ev = s.events[0];
  assert.equal(ev.dateStatus, 'locked');
  assert.equal(s.holds.find((h) => h.eventId === id).status, 'converted');
  const f = eventFinancials(s, ev);
  assert.ok(f.deferred > 0, 'deposit is deferred revenue');
  s = run(s, 'STAGE_CHANGE', { eventId: id, to: 'planning' });
  assert.equal(s.events[0].stage, 'planning');
  assert.ok(s.activityLog.length > 10);
});

test('store: hold release promotes second hold & notifies', () => {
  let s = { ...buildSeed(), effects: [] };
  const first = s.holds.find((h) => h.eventId === 'ev_lead_stellar');
  s = run(s, 'HOLD_RELEASE', { holdId: first.id }, 'u_sales');
  const second = s.holds.find((h) => h.eventId === 'ev_lead_nguyen');
  assert.equal(second.priority, 1);
  assert.ok(s.outbox.some((o) => o.key === `promoted:${second.id}`));
});

test('store: change order approval updates contract & leakage', () => {
  let s = { ...buildSeed(), effects: [] };
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const before = ev.contract.total;
  const co = ev.changeOrders.find((c) => c.status === 'sent');
  s = run(s, 'CO_APPROVE', { eventId: 'ev_carter', coId: co.id, method: 'click' }, 'u_client1');
  const after = s.events.find((e) => e.id === 'ev_carter');
  assert.ok(after.contract.total > before);
  assert.ok(after.paymentSchedule.some((p) => p.coId === co.id));
  assert.ok(leakage(s, todayISO()).some((l) => l.type === 'Unbilled change order'));
});

test('store: exception CO needs special approval', () => {
  let s = { ...buildSeed(), effects: [] };
  const co = s.events.find((e) => e.id === 'ev_acme').changeOrders[0];
  s = run(s, 'CO_APPROVE', { eventId: 'ev_acme', coId: co.id, method: 'click' }, 'u_client4');
  assert.ok(s.lastError);
  s = run(s, 'CO_SPECIAL_APPROVE', { eventId: 'ev_acme', coId: co.id, note: 'ok' }, 'u_admin');
  s = run(s, 'CO_APPROVE', { eventId: 'ev_acme', coId: co.id, method: 'click' }, 'u_client4');
  assert.equal(s.events.find((e) => e.id === 'ev_acme').changeOrders[0].status, 'approved');
});

test('availability respects capacity', () => {
  const s = buildSeed();
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const a = availability(ev.date, { events: s.events, holds: s.holds, capacity: s.settings.capacity });
  assert.equal(a.capacity, 2);
  assert.equal(a.booked.length, 1);
});

test('system tick auto-invoices & is idempotent', () => {
  let s = { ...buildSeed(), effects: [] };
  s = reducer(s, { type: 'SYSTEM_TICK', payload: {}, system: true });
  const n1 = s.outbox.length;
  s = reducer(s, { type: 'SYSTEM_TICK', payload: {}, system: true });
  assert.equal(s.outbox.length, n1);
});

test('weekly overtime across events (FLSA 40h)', async () => {
  const { weeklyCompliance } = await import('../src/lib/staff.js');
  const st = { rate: 20, rateType: 'hourly', laborRegion: 'US-NY' };
  const shifts = [
    { date: '2027-03-01', start: '08:00', end: '22:00' },
    { date: '2027-03-02', start: '08:00', end: '22:00' },
    { date: '2027-03-03', start: '08:00', end: '22:00' },
  ];
  const r = weeklyCompliance(st, shifts);
  assert.equal(r.length, 1);
  assert.equal(r[0].otHours, 2);
  assert.equal(r[0].premium, 20);
});

test('hold of a signed contract is not auto-released on expiry', () => {
  let s = { ...buildSeed(), effects: [] };
  const h = s.holds.find((x) => x.eventId === 'ev_laurent');
  h.expiresAt = addDays(todayISO(), -1);
  s = reducer(s, { type: 'SYSTEM_TICK', payload: {}, system: true });
  const after = s.holds.find((x) => x.eventId === 'ev_laurent');
  assert.equal(after.status, 'active');
  assert.equal(after.depositOverdue, true);
  assert.equal(s.events.find((e) => e.id === 'ev_laurent').dateStatus, 'hold');
});

test('catalog prices convert into the proposal currency', () => {
  let s = { ...buildSeed(), effects: [] };
  s = run(s, 'PROPOSAL_CREATE', { eventId: 'ev_lead_rossi' }, 'u_sales2');
  const ev = s.events.find((e) => e.id === 'ev_lead_rossi');
  const planning = ev.proposals[0].lines.find((l) => l.catalogId === 'svc_planning');
  assert.equal(ev.currency, 'EUR');
  assert.ok(planning.unitPrice < 12000, 'USD 12,000 must convert to fewer EUR');
});

test('booking with expired COI cannot be confirmed', () => {
  let s = { ...buildSeed(), effects: [] };
  const b = s.events.find((e) => e.id === 'ev_carter').vendorBookings.find((x) => x.vendorId === 'vd_groove');
  s = run(s, 'BOOKING_CONFIRM', { eventId: 'ev_carter', bookingId: b.id }, 'u_planner');
  assert.ok(s.lastError?.message.includes('COI'));
});

test('client notifications never leak across clients', async () => {
  const { visibleNotifications } = await import('../src/lib/permissions.js');
  let s = { ...buildSeed(), effects: [] };
  const co = s.events.find((e) => e.id === 'ev_acme').changeOrders[0];
  s = run(s, 'CO_SEND', { eventId: 'ev_acme', coId: co.id }, 'u_planner');
  const carterClient = s.users.find((u) => u.id === 'u_client1');
  const acmeClient = s.users.find((u) => u.id === 'u_client4');
  assert.equal(visibleNotifications(s, carterClient).some((n) => n.eventId === 'ev_acme'), false);
  assert.equal(visibleNotifications(s, acmeClient).some((n) => n.eventId === 'ev_acme'), true);
});

test('proposal diff lists added/removed/changed lines', async () => {
  const { diffProposals } = await import('../src/lib/pricing.js');
  const a = { guestCount: 100, jurisdictionId: 'X', lines: [{ catalogId: 'a', name: 'A', unitPrice: 1, qty: 1 }, { catalogId: 'b', name: 'B', unitPrice: 1, qty: 1 }] };
  const b = { guestCount: 120, jurisdictionId: 'X', lines: [{ catalogId: 'a', name: 'A', unitPrice: 2, qty: 1 }, { catalogId: 'c', name: 'C', unitPrice: 1, qty: 1 }] };
  const d = diffProposals(a, b);
  assert.deepEqual(d.map((x) => x.type).sort(), ['added', 'changed', 'changed', 'removed']);
});

// ---------- workforce & production timeline ----------
test('staffing: outsourced billed per booked head, freelance per confirmed person', async () => {
  const { positionCost, positionFill, coverage } = await import('../src/lib/workforce.js');
  const ev = { shifts: [], workers: [{ id: 'w1', positionId: 'f', status: 'confirmed' }, { id: 'w2', positionId: 'f', status: 'declined' }], positions: [] };
  const out = { id: 'o', qty: 10, start: '18:00', end: '22:00', source: 'outsourced', rate: 30, date: '2027-01-01' };
  const fr = { id: 'f', qty: 3, start: '18:00', end: '20:00', source: 'freelance', rate: 50, date: '2027-01-01' };
  ev.positions = [out, fr];
  assert.equal(positionCost(ev, out), 1200);
  assert.equal(positionCost(ev, fr), 100);
  assert.equal(positionFill(ev, fr).confirmed, 1);
  assert.equal(positionFill(ev, fr).unassigned, 2);
  const cov = coverage(ev, '2027-01-01', { slot: 60 });
  assert.equal(cov.find((c) => c.t === 18 * 60).required, 13);
  assert.equal(cov.find((c) => c.t === 18 * 60).filled, 1);
});

test('production engine flags dock clash, broken hand-off and curfew', async () => {
  const { productionIssues } = await import('../src/lib/timeline.js');
  const s = buildSeed();
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const issues = productionIssues(s, ev);
  assert.ok(issues.some((i) => i.kind === 'resource' && i.text.includes('Loading dock')));
  assert.ok(issues.some((i) => i.kind === 'dependency' && i.text.includes('centrepieces')));
  const toast = ev.ros.items.find((i) => i.activity === 'Dancing');
  toast.duration = 400; // runs far past the 00:00 curfew
  assert.ok(productionIssues(s, ev).some((i) => i.kind === 'curfew'));
});

test('moving the rental delivery off the dock window clears the clash', async () => {
  const { productionIssues } = await import('../src/lib/timeline.js');
  let s = { ...buildSeed(), effects: [] };
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const rental = ev.ros.items.find((i) => i.activity.startsWith('Rental delivery'));
  s = run(s, 'ROS_ITEM_UPDATE', { eventId: 'ev_carter', itemId: rental.id, patch: { start: '08:15' } }, 'u_prod');
  const after = productionIssues(s, s.events.find((e) => e.id === 'ev_carter'));
  assert.equal(after.some((i) => i.kind === 'resource' && i.text.includes('Rental')), false);
});

test('agency submits roster, crew checks in by QR code, agency cannot touch other vendors', () => {
  let s = { ...buildSeed(), effects: [] };
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const valet = ev.positions.find((p) => p.vendorId === 'vd_staffpro');
  s = run(s, 'WORKER_ADD', { eventId: 'ev_carter', positionId: valet.id, workers: [{ name: 'Val One' }, { name: 'Val Two', phone: '123' }] }, 'u_vendor3');
  let e2 = s.events.find((e) => e.id === 'ev_carter');
  const w = e2.workers.find((x) => x.name === 'Val Two');
  assert.ok(w.credentialCode.startsWith('CRW-'));
  assert.equal(w.company, 'StaffPro Events');
  const servers = e2.positions.find((p) => p.vendorId === 'vd_gourmet');
  s = run(s, 'WORKER_ADD', { eventId: 'ev_carter', positionId: servers.id, workers: [{ name: 'Intruder' }] }, 'u_vendor3');
  assert.ok(s.lastError);
  s = run(s, 'CREW_CHECKIN', { eventId: 'ev_carter', code: w.credentialCode.toLowerCase() }, 'u_crew');
  e2 = s.events.find((e) => e.id === 'ev_carter');
  assert.equal(e2.workers.find((x) => x.id === w.id).status, 'checked_in');
});

test('assigning staff to a position creates a linked shift; workforce cost flows into crew cost', async () => {
  const { crewCost } = await import('../src/lib/derived.js');
  let s = { ...buildSeed(), effects: [] };
  const before = crewCost(s, s.events.find((e) => e.id === 'ev_carter'));
  const stage = s.events.find((e) => e.id === 'ev_carter').positions.find((p) => p.role === 'Stagehand');
  s = run(s, 'POSITION_ASSIGN_STAFF', { eventId: 'ev_carter', positionId: stage.id, staffId: 'st_tom' }, 'u_prod');
  const ev = s.events.find((e) => e.id === 'ev_carter');
  assert.ok(ev.shifts.some((x) => x.positionId === stage.id && x.staffId === 'st_tom'));
  assert.ok(crewCost(s, ev) > before);
});

test('postponing moves staffing plan and access windows', () => {
  let s = { ...buildSeed(), effects: [] };
  const ev = s.events.find((e) => e.id === 'ev_carter');
  const newDate = addDays(ev.date, 14);
  s = run(s, 'EVENT_POSTPONE', { eventId: 'ev_carter', newDate, reason: 'test', fee: 0 }, 'u_admin');
  const after = s.events.find((e) => e.id === 'ev_carter');
  assert.ok(after.positions.every((p) => p.date === newDate));
  assert.equal(after.production.accessWindows[0].date, newDate);
});

// ---------- mock authentication ----------
test('login: success, wrong password counter, lockout, suspended account, logout', () => {
  let s = { ...buildSeed(), effects: [] };
  assert.equal(s.currentUserId, null, 'seed starts signed out');
  s = reducer(s, { type: 'LOGIN', payload: { email: 'OLIVIA@lumiere.events', password: 'demo1234' } });
  assert.equal(s.currentUserId, 'u_admin');
  assert.equal(s.activityLog[0].userName, 'Olivia Hart');
  s = reducer(s, { type: 'LOGOUT', payload: {} });
  assert.equal(s.currentUserId, null);
  for (let i = 0; i < 5; i++) s = reducer(s, { type: 'LOGIN', payload: { email: 'marcus@lumiere.events', password: 'nope' } });
  assert.ok(s.lastError.message.includes('locked'));
  assert.equal(s.activityLog[0].status, 'rejected');
  assert.equal(s.activityLog[0].userName, 'marcus@lumiere.events');
  s = reducer(s, { type: 'LOGIN', payload: { email: 'marcus@lumiere.events', password: 'demo1234' } });
  assert.equal(s.currentUserId, null, 'correct password is refused while locked');
  s = reducer(s, { type: 'LOGIN', payload: { email: 'tyler@lumiere.events', password: 'demo1234' } });
  assert.ok(s.lastError.message.includes('suspended'));
  s = reducer(s, { type: 'LOGIN', payload: { email: 'mei@lumiere.events', password: 'demo1234' } });
  assert.equal(s.users.find((u) => u.id === 'u_invited').status, 'active', 'first sign-in activates an invited account');
});

test('admin password reset clears a lockout', () => {
  let s = { ...buildSeed(), effects: [] };
  for (let i = 0; i < 5; i++) s = reducer(s, { type: 'LOGIN', payload: { email: 'hannah@lumiere.events', password: 'x' } });
  s = run(s, 'USER_PASSWORD_RESET', { userId: 'u_fin' }, 'u_admin');
  s = reducer(s, { type: 'LOGOUT', payload: {} });
  s = reducer(s, { type: 'LOGIN', payload: { email: 'hannah@lumiere.events', password: 'welcome123' } });
  assert.equal(s.currentUserId, 'u_fin');
});
