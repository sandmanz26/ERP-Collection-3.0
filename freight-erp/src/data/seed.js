// Builds the demo state by replaying real domain operations over the past ~90 days,
// so every record (audit log, eAdaptor messages, usage meters) is internally consistent.
import { TENANT_DEFS } from './tenants.js';
import * as ops from '../store/ops.js';
import { renderRfq, makeReply, makeDocFields, makeApLines } from '../lib/simulate.js';
import { compareRates } from '../lib/pricing.js';
import { currentStepIndex } from '../lib/approvals.js';
import { PLANS } from '../lib/reference.js';
import { seededRng, DAY, iso, monthKey } from '../lib/util.js';

export const STATE_VERSION = 3;

const HOUR = 3600000;
const CITY_CODE = { 't-nfi': 'JKT', 't-rhl': 'HAM', 't-pgf': 'LAX' };

function baseTenant(def) {
  const { users, customers, partners, lanes, seed, cw, ...tenant } = def;
  return { ...tenant, lanes, status: 'active', cwSeq: 41000 + seed * 100 };
}

function buildReferenceData(state, def, rng) {
  def.users.forEach(([name, email, role], i) => state.users.push({ id: `${def.id}-u${i + 1}`, tenantId: def.id, name, email, role, active: true, mfa: i < 2, lastLoginAt: iso(Date.now() - rng.int(1, 72) * HOUR) }));
  def.customers.forEach(([name, short, tier, country, contact, preferredChannel], i) =>
    state.customers.push({
      id: `${def.id}-c${i + 1}`,
      tenantId: def.id,
      name,
      short,
      tier,
      country,
      contact,
      preferredChannel,
      email: `${contact.split(' ')[0].toLowerCase()}@${short.toLowerCase()}.example.com`,
      whatsapp: `${{ ID: '+62 812', DE: '+49 151', NL: '+31 6', US: '+1 310' }[country] || '+1'} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)}`,
      cwCode: `${short}${CITY_CODE[def.id]}`,
      paymentTermsDays: { A: 45, B: 30, C: 14 }[tier],
      creditLimit: { A: 250000, B: 100000, C: 25000 }[tier],
    }));
  def.partners.forEach(([name, type, modes, scac, rating, priceFactor, transitAdj], i) =>
    state.partners.push({
      id: `${def.id}-p${i + 1}`,
      tenantId: def.id,
      name,
      type,
      modes,
      scac,
      rating,
      priceFactor,
      transitAdj,
      email: `rates@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.example.com`,
      channel: type === 'agent' && rng.chance(0.4) ? 'whatsapp' : 'email',
      cwCode: `${scac.padEnd(6, 'X')}${CITY_CODE[def.id]}`,
    }));
}

function buildConnectors(state, def) {
  const add = (connectorKey, name, status, enabledCapabilities, config) =>
    state.connectors.push({ id: `${def.id}-con-${connectorKey}`, tenantId: def.id, connectorKey, name, status, enabledCapabilities, config, createdAt: def.createdAt, lastSyncAt: null, lastTest: null });
  add('cargowise', 'CargoWise One — production', 'connected', ['shipment.create', 'shipment.update', 'event.inbound', 'transaction.ar.post', 'transaction.ap.post', 'document.attach'], { ...def.cw, password: '••••••••••', inboundQueue: `${def.cw.enterpriseId}_INBOUND` });
  add('email', 'Shared mailbox', 'connected', ['rfq.inbound', 'notify.customer', 'document.attach'], { mailbox: `ops@${def.users[0][1].split('@')[1]}`, provider: def.id === 't-pgf' ? 'Google Workspace' : 'Microsoft 365', appPassword: '••••••••' });
  if (def.id !== 't-rhl') add('whatsapp', 'WhatsApp Business', 'connected', ['rfq.inbound'], { phoneNumberId: '10' + def.seed + '4471', businessAccountId: '88' + def.seed + '12', token: '••••••••••••' });
  if (def.id === 't-rhl') {
    add('dcsa', 'Carrier T&T webhooks', 'connected', ['event.inbound'], { subscriptionUrl: 'https://hooks.freightpilot.app/eu/rhl/dcsa', carriers: 'HLCU, MSCU, ONEY, CMDU', secret: '••••••' });
    add('sap', 'SAP S/4HANA (group finance)', 'error', ['transaction.ap.post'], { host: 'https://s4.rhein-group.example', client: '100', clientId: 'fp-integration', clientSecret: '' });
  }
  if (def.id === 't-pgf') add('xero', 'Xero (pilot)', 'disabled', ['transaction.ar.post'], { tenantId: 'a1b2-c3d4', clientId: 'XERO-PGF', clientSecret: '••••' });
}

// Stage → [count, age in days]
const STAGES = [
  ['new', 3, [0.02, 0.3]],
  ['review', 3, [0.1, 1]],
  ['ready', 2, [0.5, 2]],
  ['sourcing', 2, [1, 2]],
  ['rates_in', 2, [1.5, 3]],
  ['q_draft', 1, [2, 3]],
  ['q_pending', 2, [2, 4]],
  ['q_approved', 1, [3, 5]],
  ['q_sent', 2, [4, 8]],
  ['lost', 2, [10, 30]],
  ['booking_pending', 1, [3, 5]],
  ['booked', 2, [5, 7]],
  ['in_transit', 3, [16, 24]],
  ['arrived', 2, [40, 48]],
  ['delivered', 4, [55, 88]],
];

const userWithRole = (state, tenantId, role) => state.users.find((u) => u.tenantId === tenantId && u.role === role) || state.users.find((u) => u.tenantId === tenantId && u.role === 'admin');

function approveAll(state, kind, entity, ctxBase, clock, subId, stopBefore = Infinity) {
  let i = 0;
  while (entity.approvals?.length && currentStepIndex(entity.approvals) >= 0 && i < stopBefore) {
    const step = entity.approvals[currentStepIndex(entity.approvals)];
    const actor = userWithRole(state, entity.tenantId || ctxBase.tenantId, step.role);
    ops.decide(state, { kind, id: kind === 'notification' ? ctxBase.shipmentId : entity.id, subId, approve: true, comment: '' }, { ...ctxBase, now: clock(), actor });
    i += 1;
  }
}

function seedTenant(state, def, now) {
  const rng = seededRng(def.seed);
  const tenant = state.tenants.find((t) => t.id === def.id);
  const customers = state.customers.filter((c) => c.tenantId === def.id);
  const channels = ['email', 'email', 'pdf', 'excel', 'whatsapp'];
  let laneIdx = 0;

  for (const [stage, count, [minAge, maxAge]] of STAGES) {
    for (let n = 0; n < count; n += 1) {
      const lane = def.lanes[laneIdx++ % def.lanes.length];
      const age = rng.range(minAge, maxAge);
      let t = now - age * DAY;
      const clock = (stepHours = 0.25) => {
        t = Math.min(t + stepHours * HOUR, now - 60000);
        return t;
      };
      const ctx = { rng, now: t, actor: ops.SYSTEM_ACTOR, tenantId: def.id, seeding: true };
      const customer = rng.pick(customers);
      const channel = customer.preferredChannel === 'whatsapp' && rng.chance(0.6) ? 'whatsapp' : rng.pick(channels);
      const omit = stage === 'review' ? [rng.pick(['incoterm', 'cargoReadyDate', 'commodity', 'weightKg'])] : [];
      const { rfq, truth } = ops.newRfqFromTruth(state, { tenantId: def.id, channel, customerId: customer.id, laneDef: lane, omit }, ctx, renderRfq);
      if (['in_transit', 'arrived', 'delivered', 'booked', 'booking_pending'].includes(stage)) truth.cargoReadyDate = new Date(t + 6 * DAY).toISOString().slice(0, 10);
      rfq.assigneeId = userWithRole(state, def.id, 'pricing').id;
      if (stage === 'new') continue;

      ops.extractRfq(state, { rfqId: rfq.id }, { ...ctx, now: clock(0.05) });
      if (stage === 'review') {
        if (rfq.status !== 'review') rfq.status = 'review';
        if (!rfq.extraction.reviewFields.length) rfq.extraction.reviewFields = omit;
        continue;
      }
      const pricing = userWithRole(state, def.id, 'pricing');
      if (rfq.status === 'review' || rng.chance(0.3)) ops.confirmExtraction(state, { rfqId: rfq.id, data: { ...rfq.data, ...truth } }, { ...ctx, now: clock(0.5), actor: pricing });
      else rfq.data = { ...rfq.data, ...truth };
      if (stage === 'ready') continue;

      const partners = rng.shuffle(ops.partnersForMode(state, def.id, rfq.data.mode)).slice(0, Math.min(4, Math.max(2, def.settings.rateRequests.minPartners)));
      ops.sendRateRequests(state, { rfqId: rfq.id, partnerIds: partners.map((p) => p.id) }, { ...ctx, now: clock(0.5), actor: ops.AI_ACTOR });
      const toAnswer = stage === 'sourcing' ? rfq.rateRequests.slice(0, 1) : rfq.rateRequests;
      toAnswer.forEach((rr, i) => {
        const partner = state.partners.find((p) => p.id === rr.partnerId);
        const declined = i > 0 && rng.chance(0.12);
        ops.recordRateReply(state, { rfqId: rfq.id, rrId: rr.id, declined, reply: declined ? null : makeReply(rng, rfq.data, partner, tenant.currency, t) }, { ...ctx, now: clock(rng.range(1, 5)) });
      });
      if (stage === 'sourcing' || stage === 'rates_in') continue;

      const cmp = compareRates(rfq.rateRequests.map((r) => ({ ...r, partnerRating: state.partners.find((p) => p.id === r.partnerId)?.rating })));
      const quote = ops.createQuote(state, { rfqId: rfq.id, rrId: rng.chance(0.7) ? cmp.bestId : cmp.cheapestId }, { ...ctx, now: clock(1) });
      if (stage === 'q_draft') continue;
      ops.submitQuote(state, { quoteId: quote.id }, { ...ctx, now: clock(0.5), actor: pricing });
      if (stage === 'q_pending') {
        if (quote.approvals.length > 1) approveAll(state, 'quote', quote, ctx, () => clock(0.5), undefined, 1);
        continue;
      }
      approveAll(state, 'quote', quote, ctx, () => clock(1));
      if (stage === 'q_approved') continue;
      const sales = userWithRole(state, def.id, 'sales');
      ops.sendQuote(state, { quoteId: quote.id, channel: customer.preferredChannel }, { ...ctx, now: clock(1), actor: sales });
      if (stage === 'q_sent') continue;
      if (stage === 'lost') {
        ops.customerDecision(state, { quoteId: quote.id, accepted: false, reason: rng.pick(['Price', 'Transit time', 'Customer chose another forwarder', 'Shipment cancelled']) }, { ...ctx, now: clock(30), actor: sales });
        continue;
      }
      rfq.data.cargoReadyDate = truth.cargoReadyDate;
      const shipment = ops.customerDecision(state, { quoteId: quote.id, accepted: true }, { ...ctx, now: clock(20), actor: sales });
      if (stage === 'booking_pending') continue;
      approveAll(state, 'booking', shipment, ctx, () => clock(1));
      const opsUser = userWithRole(state, def.id, 'ops');

      // Documents: CI + PL at booking, B/L after departure.
      const docCtx = (h) => ({ ...ctx, now: clock(h), actor: ops.AI_ACTOR });
      ops.ingestDocument(state, { shipmentId: shipment.id, type: 'CI', fields: makeDocFields(rng, 'CI', shipment, rng.chance(0.3)), fileName: `CI_${customer.short}_${rng.int(1000, 9999)}.pdf`, confidence: Math.round(rng.range(0.88, 0.99) * 100) / 100 }, docCtx(4));
      ops.ingestDocument(state, { shipmentId: shipment.id, type: 'PL', fields: makeDocFields(rng, 'PL', shipment, rng.chance(0.3)), fileName: `PL_${customer.short}_${rng.int(1000, 9999)}.xlsx`, confidence: Math.round(rng.range(0.88, 0.99) * 100) / 100 }, docCtx(1));
      if (stage === 'booked') continue;

      const targets = { in_transit: ['DEP'], arrived: ['DEP', 'ARV'], delivered: ['DEP', 'ARV', 'CLR', 'DLV'] }[stage];
      for (const code of targets) {
        const m = shipment.milestones.find((x) => x.code === code);
        if (!m) continue;
        const planned = new Date(m.planned).getTime() + rng.range(-0.5, 1.5) * DAY;
        t = Math.max(t + HOUR, Math.min(planned, now - (targets.length - targets.indexOf(code)) * 6 * HOUR));
        ops.recordMilestone(state, { shipmentId: shipment.id, code, at: iso(t) }, { ...ctx, now: t });
        if (code === 'DEP') {
          ops.ingestDocument(state, { shipmentId: shipment.id, type: 'BL', fields: makeDocFields(rng, 'BL', shipment, rng.chance(0.35)), fileName: `BL_${shipment.partnerId.slice(-2)}${rng.int(100000, 999999)}.pdf`, confidence: Math.round(rng.range(0.9, 0.99) * 100) / 100 }, docCtx(6));
        }
      }
      // Customer notifications: older drafts were approved and sent; keep the newest pending for HITL demo.
      shipment.notifications.filter((x) => x.status === 'draft').slice(stage === 'delivered' ? 0 : 1).forEach((nt) => approveAll(state, 'notification', nt, { ...ctx, shipmentId: shipment.id, tenantId: def.id }, () => clock(0.5), nt.id));

      // AP carrier invoice.
      if (stage !== 'in_transit' || rng.chance(0.5)) {
        const variant = stage === 'delivered' ? rng.pick(['exact', 'exact', 'small', 'extra']) : rng.pick(['over', 'extra', 'small']);
        const partner = state.partners.find((p) => p.id === shipment.partnerId);
        const ap = ops.receiveApInvoice(state, { shipmentId: shipment.id, vendorRef: `${partner.scac}-${rng.int(100000, 999999)}`, lines: makeApLines(rng, shipment.expectedCosts, variant) }, { ...ctx, now: clock(30), actor: ops.AI_ACTOR });
        if (stage === 'delivered' && ap.status === 'variance') approveAll(state, 'apInvoice', ap, ctx, () => clock(4));
      }
      // Resolve document issues on completed shipments.
      if (stage === 'delivered') {
        for (const doc of state.documents.filter((x) => x.shipmentId === shipment.id)) {
          for (const issue of doc.issues.filter((i) => i.status === 'open')) {
            ops.resolveIssue(state, { docId: doc.id, field: issue.field, resolution: rng.chance(0.6) ? 'accept_doc' : 'keep_record', note: rng.pick(['Confirmed with shipper by phone', 'Typo on document, record is correct', 'Re-weighed at CFS']) }, { ...ctx, now: clock(2), actor: opsUser });
          }
        }
      }
      if (stage === 'delivered' || (stage === 'arrived' && n === 0)) {
        const ar = ops.createArInvoice(state, { shipmentId: shipment.id }, { ...ctx, now: clock(6), actor: ops.AI_ACTOR });
        if (stage === 'delivered') approveAll(state, 'arInvoice', ar, ctx, () => clock(3));
      }
    }
  }
}

function seedUsageHistory(state, def, now, rng) {
  const plan = PLANS[def.plan];
  for (let back = 1; back <= 5; back += 1) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - back);
    const key = monthKey(d.getTime());
    const scale = rng.range(0.55, 1.15) * (1 - back * 0.05);
    const u = (state.usage[def.id][key] = state.usage[def.id][key] || { rfqs: 0, documents: 0, invoices: 0, aiCalls: 0 });
    u.rfqs += Math.round(plan.included.rfqs * scale * (def.id === 't-pgf' ? 0.9 : 0.75));
    u.documents += Math.round(plan.included.documents * scale * 0.7);
    u.invoices += Math.round(plan.included.invoices * scale * 0.65);
    u.aiCalls += Math.round((u.rfqs * 4 + u.documents * 2 + u.invoices) * 1.1);
  }
  // Current month: what the replay produced plus earlier traffic this month.
  const cur = state.usage[def.id][monthKey(now)];
  const dayOfMonth = new Date(now).getUTCDate();
  const frac = dayOfMonth / 30;
  cur.rfqs += Math.round(plan.included.rfqs * 0.7 * frac);
  cur.documents += Math.round(plan.included.documents * 0.65 * frac);
  cur.invoices += Math.round(plan.included.invoices * 0.6 * frac);
  cur.aiCalls += Math.round((cur.rfqs * 4 + cur.documents * 2 + cur.invoices) * 1.1);
}

export function buildSeed(now = Date.now()) {
  const state = {
    version: STATE_VERSION,
    seededAt: iso(now),
    session: { tenantId: 't-nfi', userByTenant: {}, view: 'tenant' },
    tenants: [],
    users: [],
    customers: [],
    partners: [],
    rfqs: [],
    quotes: [],
    shipments: [],
    documents: [],
    arInvoices: [],
    apInvoices: [],
    audit: [],
    messages: [],
    connectors: [],
    usage: {},
    counters: {},
  };
  for (const def of TENANT_DEFS) {
    const rng = seededRng(def.seed * 7);
    state.tenants.push(baseTenant(def));
    buildReferenceData(state, def, rng);
    buildConnectors(state, def);
    state.usage[def.id] = {};
    seedTenant(state, def, now);
    seedUsageHistory(state, def, now, rng);
    state.session.userByTenant[def.id] = `${def.id}-u1`;
  }
  const byTimeDesc = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  state.audit.sort(byTimeDesc);
  state.messages.sort(byTimeDesc);
  state.rfqs.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  state.quotes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  state.shipments.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  state.documents.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  return state;
}
