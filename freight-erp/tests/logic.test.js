import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRfq, fieldsNeedingReview, parseNumber } from '../src/lib/extract.js';
import { applyMargin, findMarginRule, compareRates } from '../src/lib/pricing.js';
import { buildApprovalChain, canApprove, chainStatus } from '../src/lib/approvals.js';
import { validateDocument } from '../src/lib/validation.js';
import { reconcileAp, buildArLines } from '../src/lib/reconcile.js';
import { universalShipment, universalEvent, universalTransaction } from '../src/lib/connectors/cargowise.js';
import { dispatch } from '../src/lib/connectors/registry.js';
import { buildSeed } from '../src/data/seed.js';
import * as ops from '../src/store/ops.js';
import { seededRng } from '../src/lib/util.js';

const NOW = new Date('2026-10-21T08:00:00Z');

test('parseNumber handles thousands separators and decimals', () => {
  assert.equal(parseNumber('12,500'), 12500);
  assert.equal(parseNumber('12.500'), 12500);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('8.78'), 8.78);
});

test('extracts a well-formed email RFQ with high confidence', () => {
  const ex = extractRfq('Please quote 2x40HC from Shanghai to Jakarta.\nCommodity: Furniture, non-DG\nGross weight 36,500 kg, 48 pallets.\nTerms: FOB.\nCargo ready 18 Nov 2026.', { now: NOW });
  const f = ex.fields;
  assert.equal(f.origin.value, 'CNSHA');
  assert.equal(f.destination.value, 'IDJKT');
  assert.equal(f.mode.value, 'SEA_FCL');
  assert.equal(f.containerType.value, '40HC');
  assert.equal(f.containerCount.value, 2);
  assert.equal(f.weightKg.value, 36500);
  assert.equal(f.packages.value, 48);
  assert.equal(f.incoterm.value, 'FOB');
  assert.equal(f.cargoReadyDate.value, '2026-11-18');
  assert.equal(f.commodity.value, 'Furniture');
  assert.equal(f.hazardous.value, false);
  assert.deepEqual(fieldsNeedingReview(ex, 0.9), []);
});

test('WhatsApp shorthand: tons are converted, missing incoterm is flagged for review', () => {
  const ex = extractRfq('hi pls quote 1x20GP surabaya to hamburg, garments 12 ton, ready 5 dec', { now: NOW });
  assert.equal(ex.fields.origin.value, 'IDSUB');
  assert.equal(ex.fields.destination.value, 'DEHAM');
  assert.equal(ex.fields.weightKg.value, 12000);
  assert.equal(ex.fields.incoterm.value, null);
  assert.ok(ex.missing.includes('incoterm'));
  assert.ok(fieldsNeedingReview(ex, 0.9).includes('incoterm'));
});

test('Excel rows: labelled mode and LCL volume', () => {
  const ex = extractRfq([{ Origin: 'Singapore', Destination: 'Jakarta', Mode: 'Sea LCL', Commodity: 'Toys', 'Gross weight': '1200 kg', Volume: '6.5 cbm', Incoterm: 'FCA', 'Cargo ready': '2026-11-02' }], { now: NOW });
  assert.equal(ex.fields.mode.value, 'SEA_LCL');
  assert.equal(ex.fields.volumeCbm.value, 6.5);
  assert.equal(ex.fields.cargoReadyDate.value, '2026-11-02');
});

test('dates without a year roll into next year when already past', () => {
  const ex = extractRfq('Air shipment Hong Kong to Chicago, 300 kg, FCA, cargo ready 10 Jan', { now: NOW });
  assert.equal(ex.fields.mode.value, 'AIR');
  assert.equal(ex.fields.cargoReadyDate.value, '2027-01-10');
});

const RULES = [
  { id: 'a', name: 'Tier A FCL', priority: 1, match: { modes: ['SEA_FCL'], customerTiers: ['A'] }, markupPct: 8, minProfit: 150, roundTo: 5, fixedFees: [], overrides: { THO: 0 } },
  { id: 'b', name: 'FCL', priority: 2, match: { modes: ['SEA_FCL'] }, markupPct: 12, minProfit: 0, roundTo: 0, fixedFees: [{ code: 'HDL', desc: 'Handling', amount: 35 }], overrides: {} },
  { id: 'z', name: 'Default', priority: 99, match: {}, markupPct: 15, minProfit: 0, roundTo: 0, fixedFees: [], overrides: {} },
  { id: 'off', name: 'Inactive', priority: 0, active: false, match: {}, markupPct: 99 },
];

test('margin rule selection respects priority, conditions and active flag', () => {
  assert.equal(findMarginRule(RULES, { mode: 'SEA_FCL', customerTier: 'A' }).id, 'a');
  assert.equal(findMarginRule(RULES, { mode: 'SEA_FCL', customerTier: 'B' }).id, 'b');
  assert.equal(findMarginRule(RULES, { mode: 'AIR', customerTier: 'A' }).id, 'z');
});

test('applyMargin: overrides, rounding, fixed fees and minimum profit top-up', () => {
  const buy = [{ code: 'FRT', desc: 'Freight', buy: 1000 }, { code: 'THO', desc: 'THC', buy: 100 }];
  const a = applyMargin(buy, RULES[0]);
  assert.equal(a.lines.find((l) => l.code === 'THO').sell, 100); // override 0%
  assert.equal(a.profit, 150); // 80 from markup (1080) topped up to the 150 minimum
  assert.equal(a.toppedUp, 70);
  const b = applyMargin(buy, RULES[1]);
  assert.equal(b.lines.length, 3);
  assert.equal(b.sellTotal, 1120 + 112 + 35);
});

test('compareRates picks cheapest, fastest and best value', () => {
  const r = compareRates([
    { id: '1', status: 'replied', partnerRating: 4, reply: { total: 1000, transitDays: 30 } },
    { id: '2', status: 'replied', partnerRating: 5, reply: { total: 1100, transitDays: 20 } },
    { id: '3', status: 'declined', reply: null },
  ]);
  assert.equal(r.cheapestId, '1');
  assert.equal(r.fastestId, '2');
  assert.equal(r.rows.length, 2);
});

test('approval chain is built from conditions and enforces roles', () => {
  const steps = [
    { id: '1', name: 'Pricing', role: 'pricing', condition: { type: 'always' } },
    { id: '2', name: 'Manager', role: 'manager', condition: { type: 'marginBelow', value: 10 } },
    { id: '3', name: 'Director', role: 'admin', condition: { type: 'valueAbove', value: 20000 } },
  ];
  assert.equal(buildApprovalChain(steps, { marginPct: 12, value: 5000 }).length, 1);
  const chain = buildApprovalChain(steps, { marginPct: 8, value: 25000 });
  assert.deepEqual(chain.map((s) => s.role), ['pricing', 'manager', 'admin']);
  assert.ok(canApprove({ role: 'admin' }, chain[1]));
  assert.ok(!canApprove({ role: 'sales' }, chain[0]));
  assert.equal(chainStatus(chain), 'pending');
  assert.equal(chainStatus([]), 'approved');
});

test('document validation tolerates formatting but flags real mismatches', () => {
  const shipment = { shipper: 'PT Sinar Mebel Jepara', consignee: 'Global Import Partners BV', origin: 'IDJKT', destination: 'NLRTM', containerNo: 'MSKU1234567', packages: 40, weightKg: 20000, vessel: 'EVER ACE' };
  const ok = validateDocument({ type: 'BL', fields: { ...shipment, shipper: 'SINAR MEBEL JEPARA', weightKg: 20100 } }, shipment);
  assert.deepEqual(ok, []);
  const bad = validateDocument({ type: 'BL', fields: { ...shipment, containerNo: 'MSKU7654321', weightKg: 21600, destination: 'BEANR' } }, shipment);
  assert.deepEqual(bad.map((i) => i.field).sort(), ['containerNo', 'destination', 'weightKg']);
  assert.equal(bad.find((i) => i.field === 'containerNo').severity, 'high');
});

test('AP reconciliation flags overcharges and unexpected charges', () => {
  const expected = [{ code: 'FRT', amount: 2000 }, { code: 'BAF', amount: 200 }];
  assert.equal(reconcileAp([{ code: 'FRT', amount: 2010 }, { code: 'BAF', amount: 200 }], expected).withinTolerance, true);
  const over = reconcileAp([{ code: 'FRT', amount: 2000 }, { code: 'BAF', amount: 275 }], expected, { pct: 5, abs: 50 });
  assert.equal(over.withinTolerance, false, 'a 75 overcharge on one line must be flagged even if the total is within 5%');
  assert.equal(over.rows.find((r) => r.code === 'BAF').status, 'over');
  const extra = reconcileAp([...expected.map((e) => ({ ...e })), { code: 'DEM', amount: 600 }], expected);
  assert.equal(extra.rows.find((r) => r.code === 'DEM').status, 'unexpected');
  assert.equal(extra.withinTolerance, false);
  const ar = buildArLines([{ code: 'FRT', desc: 'Freight', sell: 2500 }], [{ code: 'DEM', desc: 'Demurrage', amount: 600 }], 10);
  assert.equal(ar[1].amount, 660);
});

test('CargoWise Universal XML builders produce well-formed messages', () => {
  const ctx = { config: { enterpriseId: 'NFI', serverId: 'PRD', companyCode: 'JKT', branchCode: 'JKT' }, currency: 'USD', customer: { cwCode: 'CUSTJKT', name: 'Cust & Co' }, partner: { cwCode: 'MAEUXXJKT', name: 'Maersk' } };
  const s = universalShipment({ mode: 'SEA_FCL', origin: 'CNSHA', destination: 'IDJKT', commodity: 'Furniture <wood>', cwKey: 'S00001', containerType: '40HC', containerCount: 2, sellLines: [{ code: 'FRT', desc: 'Freight', buy: 100, sell: 120 }] }, ctx);
  assert.match(s.body, /<UniversalShipment xmlns="http:\/\/www\.cargowise\.com\/Schemas\/Universal\/2011\/11"/);
  assert.match(s.body, /<Code>CNSHA<\/Code>/);
  assert.match(s.body, /Furniture &lt;wood&gt;/);
  assert.match(universalEvent({ cwKey: 'S00001', code: 'DEP', name: 'Departed', at: '2026-10-21' }, ctx).body, /<EventType>DEP<\/EventType>/);
  const t = universalTransaction({ ledger: 'AR', ref: 'INV-1', date: '2026-10-21', dueDate: '2026-11-20', total: 120, cwKey: 'S00001', lines: [{ code: 'FRT', desc: 'Freight', amount: 120 }] }, ctx);
  assert.match(t.body, /<Ledger>AR<\/Ledger>/);
  // balanced tags
  const opens = (t.body.match(/<[A-Za-z][^>]*>/g) || []).length - (t.body.match(/<[^>]*\/>/g) || []).length;
  const closes = (t.body.match(/<\/[^>]+>/g) || []).length;
  assert.equal(opens, closes);
});

test('connector dispatch routes by tenant and capability only', () => {
  const instances = [
    { id: 'a', tenantId: 't1', connectorKey: 'cargowise', name: 'CW', status: 'connected', enabledCapabilities: ['shipment.create'], config: {} },
    { id: 'b', tenantId: 't2', connectorKey: 'magaya', name: 'MG', status: 'connected', enabledCapabilities: ['shipment.create'], config: {} },
    { id: 'c', tenantId: 't3', connectorKey: 'cargowise', name: 'CW off', status: 'disabled', enabledCapabilities: ['shipment.create'], config: {} },
  ];
  const ctx = { currency: 'USD' };
  assert.equal(dispatch(instances, 't1', 'shipment.create', { mode: 'AIR' }, ctx).messageType, 'UniversalShipment');
  assert.equal(dispatch(instances, 't2', 'shipment.create', { mode: 'AIR' }, ctx).format, 'json');
  assert.equal(dispatch(instances, 't3', 'shipment.create', {}, ctx), null);
  assert.equal(dispatch(instances, 't1', 'transaction.ar.post', {}, ctx), null);
});

test('seed: every record references entities of its own tenant (isolation)', () => {
  const s = buildSeed(NOW.getTime());
  const tenantOfId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x.tenantId]));
  const cust = tenantOfId(s.customers);
  const part = tenantOfId(s.partners);
  const ship = tenantOfId(s.shipments);
  for (const r of s.rfqs) {
    assert.equal(cust[r.customerId], r.tenantId);
    for (const rr of r.rateRequests) assert.equal(part[rr.partnerId], r.tenantId);
  }
  for (const q of s.quotes) assert.equal(part[q.partnerId], q.tenantId);
  for (const d of s.documents) assert.equal(ship[d.shipmentId], d.tenantId);
  for (const a of [...s.arInvoices, ...s.apInvoices]) assert.equal(ship[a.shipmentId], a.tenantId);
  assert.equal(s.tenants.length, 3);
  assert.ok(s.shipments.every((x) => x.status === 'booking_pending' || x.cwKey));
});

test('ops: full RFQ → invoice flow with approvals enforced', () => {
  const d = buildSeed(NOW.getTime());
  const users = d.users.filter((u) => u.tenantId === 't-nfi');
  const by = (role) => users.find((u) => u.role === role);
  const ctx = (actor) => ({ now: NOW.getTime(), actor, rng: seededRng(5) });
  const customer = d.customers.find((c) => c.tenantId === 't-nfi');
  const rfq = ops.receiveRfq(d, { tenantId: 't-nfi', channel: 'email', customerId: customer.id, subject: 'x', raw: { body: 'Quote 1x40HC Shanghai to Jakarta. Commodity: Toys. Gross weight 15,000 kg. FOB. Cargo ready 2026-11-20.' } }, ctx(ops.SYSTEM_ACTOR));
  ops.extractRfq(d, { rfqId: rfq.id }, ctx(ops.AI_ACTOR));
  if (rfq.status === 'review') ops.confirmExtraction(d, { rfqId: rfq.id, data: { ...rfq.data, packages: 20 } }, ctx(by('pricing')));
  const partners = ops.partnersForMode(d, 't-nfi', 'SEA_FCL').slice(0, 2);
  ops.sendRateRequests(d, { rfqId: rfq.id, partnerIds: partners.map((p) => p.id) }, ctx(ops.AI_ACTOR));
  const rr = rfq.rateRequests[0];
  ops.recordRateReply(d, { rfqId: rfq.id, rrId: rr.id, reply: { currency: 'USD', charges: [{ code: 'FRT', desc: 'Freight', amount: 1500 }, { code: 'DOC', desc: 'Doc', amount: 45 }], total: 1545, transitDays: 10, validUntil: '2026-11-30', routing: 'Direct', rawText: '', parseConfidence: 0.95 } }, ctx(ops.AI_ACTOR));
  const q = ops.createQuote(d, { rfqId: rfq.id, rrId: rr.id }, ctx(ops.AI_ACTOR));
  ops.submitQuote(d, { quoteId: q.id }, ctx(by('pricing')));
  assert.throws(() => ops.decide(d, { kind: 'quote', id: q.id, approve: true }, ctx(by('sales'))), /needs the pricing role/);
  while (q.status === 'pending_approval') ops.decide(d, { kind: 'quote', id: q.id, approve: true }, ctx(by('admin')));
  assert.equal(q.status, 'approved');
  ops.sendQuote(d, { quoteId: q.id }, ctx(by('sales')));
  const s = ops.customerDecision(d, { quoteId: q.id, accepted: true }, ctx(by('sales')));
  assert.equal(s.status, 'booking_pending');
  ops.decide(d, { kind: 'booking', id: s.id, approve: true }, ctx(by('ops')));
  assert.equal(s.status, 'booked');
  assert.match(s.cwKey, /^S\d{8}$/);
  assert.ok(d.messages.some((m) => m.messageType === 'UniversalShipment' && m.entityRef === s.ref));
  ops.recordMilestone(d, { shipmentId: s.id, code: 'DLV' }, ctx(ops.SYSTEM_ACTOR));
  assert.equal(s.status, 'delivered');
  assert.ok(s.milestones.every((m) => m.actual));
  const ap = ops.receiveApInvoice(d, { shipmentId: s.id, vendorRef: 'V1', lines: s.expectedCosts.map((c) => ({ code: c.code, desc: c.desc, amount: c.amount })) }, ctx(ops.AI_ACTOR));
  assert.equal(ap.status, 'posted');
  const ar = ops.createArInvoice(d, { shipmentId: s.id }, ctx(ops.AI_ACTOR));
  assert.equal(ar.total, q.sellTotal);
  ops.decide(d, { kind: 'arInvoice', id: ar.id, approve: true }, ctx(by('finance')));
  assert.equal(ar.status, 'posted');
  assert.ok(d.audit.filter((a) => a.tenantId === 't-nfi' && a.actorType === 'ai').length > 5);
});
