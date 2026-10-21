// Domain operations. Each function mutates a draft state (cloned by the store) and records
// audit entries + usage metering. The seed replays the same operations to build realistic history.
import { extractRfq as runExtractor, fieldsNeedingReview, extractionToData, FIELD_LABELS } from '../lib/extract.js';
import { findMarginRule, applyMargin, totals } from '../lib/pricing.js';
import { buildApprovalChain, canApprove, currentStepIndex, chainStatus, APPROVAL_KINDS } from '../lib/approvals.js';
import { validateDocument, docStatusFromIssues, DOC_TYPES, CHECK_DEFS } from '../lib/validation.js';
import { reconcileAp, buildArLines } from '../lib/reconcile.js';
import { dispatch } from '../lib/connectors/registry.js';
import { portByCode, MILESTONES, milestoneFamily, AI_MODEL, CHARGE_CODES } from '../lib/reference.js';
import { rawText, makeShipmentTruth, counterparty, VESSELS, containerNo } from '../lib/simulate.js';
import { uid, iso, isoDate, DAY, monthKey, round2 } from '../lib/util.js';

export const AI_ACTOR = { id: 'ai', name: 'FreightPilot AI', role: 'ai' };
export const SYSTEM_ACTOR = { id: 'system', name: 'System', role: 'system' };

// ───────────────────────────── helpers ─────────────────────────────
export const tenantOf = (d, id) => d.tenants.find((t) => t.id === id);
const byId = (arr, id, what) => {
  const x = arr.find((e) => e.id === id);
  if (!x) throw new Error(`${what} not found`);
  return x;
};
const customerOf = (d, id) => d.customers.find((c) => c.id === id);
const partnerOf = (d, id) => d.partners.find((p) => p.id === id);

export function nextRef(d, tenantId, kind) {
  d.counters[tenantId] = d.counters[tenantId] || {};
  const n = (d.counters[tenantId][kind] || 0) + 1;
  d.counters[tenantId][kind] = n;
  const t = tenantOf(d, tenantId);
  const yy = new Date().getFullYear().toString().slice(2);
  const prefix = { rfq: 'RFQ', quote: 'QT', shipment: 'SHP', ar: 'INV', notif: 'MSG' }[kind] || kind.toUpperCase();
  return `${prefix}-${t.code}${yy}-${String(n).padStart(4, '0')}`;
}

export function audit(d, ctx, tenantId, e) {
  const actor = e.actor || ctx.actor || SYSTEM_ACTOR;
  d.audit.unshift({
    id: uid('aud'),
    tenantId,
    at: iso(ctx.now),
    actorType: actor.role === 'ai' ? 'ai' : actor.role === 'system' ? 'system' : 'user',
    actor: actor.name,
    actorRole: actor.role,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    entityRef: e.entityRef,
    summary: e.summary,
    model: actor.role === 'ai' ? e.model || AI_MODEL : null,
    confidence: e.confidence ?? null,
    hitl: e.hitl ?? null,
    input: e.input ?? null,
    output: e.output ?? null,
  });
  if (actor.role === 'ai') meter(d, tenantId, 'aiCalls', 1, ctx.now);
}

export function meter(d, tenantId, key, n, now) {
  const m = monthKey(now);
  d.usage[tenantId] = d.usage[tenantId] || {};
  d.usage[tenantId][m] = d.usage[tenantId][m] || { rfqs: 0, documents: 0, invoices: 0, aiCalls: 0 };
  d.usage[tenantId][m][key] = (d.usage[tenantId][m][key] || 0) + n;
}

function logMessage(d, ctx, tenantId, built, direction, entityRef, status = 'delivered') {
  if (!built) return null;
  const msg = { id: uid('msg'), tenantId, connectorId: built.connectorId, connectorName: built.connectorName, capability: built.capability, direction, messageType: built.messageType, format: built.format, entityRef, at: iso(ctx.now), status, body: built.body };
  d.messages.unshift(msg);
  const inst = d.connectors.find((c) => c.id === built.connectorId);
  if (inst) inst.lastSyncAt = msg.at;
  return msg;
}

const connCtx = (d, tenantId, customerId, partnerId) => ({ tenant: tenantOf(d, tenantId), currency: tenantOf(d, tenantId).currency, customer: customerOf(d, customerId), partner: partnerOf(d, partnerId) });

// ───────────────────────────── RFQ intake ─────────────────────────────
export function receiveRfq(d, { tenantId, channel, customerId, subject, raw }, ctx) {
  const rfq = {
    id: uid('rfq'),
    tenantId,
    ref: nextRef(d, tenantId, 'rfq'),
    channel,
    customerId,
    subject,
    raw,
    receivedAt: iso(ctx.now),
    status: 'new',
    extraction: null,
    data: null,
    rateRequests: [],
    quoteId: null,
    assigneeId: null,
    lostReason: null,
  };
  d.rfqs.unshift(rfq);
  meter(d, tenantId, 'rfqs', 1, ctx.now);
  audit(d, ctx, tenantId, { actor: SYSTEM_ACTOR, action: 'rfq.received', entityType: 'rfq', entityId: rfq.id, entityRef: rfq.ref, summary: `RFQ received via ${channel} from ${customerOf(d, customerId)?.name || 'unknown sender'}` });
  return rfq;
}

export function extractRfq(d, { rfqId }, ctx) {
  const rfq = byId(d.rfqs, rfqId, 'RFQ');
  const t = tenantOf(d, rfq.tenantId);
  const ex = runExtractor(rawText(rfq.raw), { now: new Date(ctx.now) });
  const threshold = t.settings.extraction.autoAcceptThreshold;
  const review = fieldsNeedingReview(ex, threshold);
  rfq.extraction = { ...ex, model: AI_MODEL, extractedAt: iso(ctx.now), reviewFields: review, reviewedBy: null, reviewedAt: null };
  rfq.data = extractionToData(ex);
  rfq.status = review.length ? 'review' : 'ready';
  audit(d, ctx, rfq.tenantId, {
    actor: AI_ACTOR,
    action: 'rfq.extracted',
    entityType: 'rfq',
    entityId: rfq.id,
    entityRef: rfq.ref,
    confidence: ex.overall,
    hitl: review.length ? 'pending' : 'auto',
    summary: review.length ? `Extracted shipment data; ${review.length} field(s) below ${Math.round(threshold * 100)}% confidence sent for review (${review.map((k) => FIELD_LABELS[k]).join(', ')})` : `Extracted shipment data; all fields ≥ ${Math.round(threshold * 100)}% — auto-accepted`,
    input: { channel: rfq.channel, text: typeof rawText(rfq.raw) === 'string' ? rawText(rfq.raw).slice(0, 600) : rfq.raw.rows },
    output: Object.fromEntries(Object.entries(ex.fields).map(([k, f]) => [k, { value: f.value, confidence: f.confidence }])),
  });
  if (rfq.status === 'ready' && t.settings.extraction.autoRequestRates && !ctx.seeding) {
    const best = partnersForMode(d, rfq.tenantId, rfq.data.mode).sort((a, b) => b.rating - a.rating).slice(0, Math.max(2, t.settings.rateRequests.minPartners));
    if (best.length) sendRateRequests(d, { rfqId: rfq.id, partnerIds: best.map((p) => p.id) }, { ...ctx, actor: AI_ACTOR });
  }
  return rfq;
}

export function confirmExtraction(d, { rfqId, data }, ctx) {
  const rfq = byId(d.rfqs, rfqId, 'RFQ');
  const missing = ['origin', 'destination', 'mode', 'commodity', 'weightKg', 'incoterm', 'cargoReadyDate'].filter((k) => data[k] == null || data[k] === '');
  if (missing.length) throw new Error(`Complete required fields first: ${missing.map((k) => FIELD_LABELS[k]).join(', ')}`);
  const changed = Object.keys(data).filter((k) => String(data[k] ?? '') !== String(rfq.data?.[k] ?? ''));
  rfq.data = { ...rfq.data, ...data };
  rfq.status = 'ready';
  rfq.extraction = { ...rfq.extraction, reviewedBy: ctx.actor.name, reviewedAt: iso(ctx.now), corrections: changed };
  audit(d, ctx, rfq.tenantId, { action: 'rfq.extraction.confirmed', entityType: 'rfq', entityId: rfq.id, entityRef: rfq.ref, hitl: 'approved', summary: changed.length ? `Confirmed extraction with ${changed.length} correction(s): ${changed.map((k) => FIELD_LABELS[k]).join(', ')}` : 'Confirmed AI extraction without changes', output: data });
  return rfq;
}

// ───────────────────────────── Rate requests ─────────────────────────────
export const partnersForMode = (d, tenantId, mode) => d.partners.filter((p) => p.tenantId === tenantId && p.modes.includes(mode));

export function sendRateRequests(d, { rfqId, partnerIds }, ctx) {
  const rfq = byId(d.rfqs, rfqId, 'RFQ');
  if (!['ready', 'sourcing', 'rates_in'].includes(rfq.status)) throw new Error('Confirm the extracted shipment data before requesting rates.');
  if (!partnerIds?.length) throw new Error('Select at least one carrier or agent.');
  const existing = new Set(rfq.rateRequests.map((r) => r.partnerId));
  const added = partnerIds.filter((p) => !existing.has(p));
  for (const partnerId of added) {
    rfq.rateRequests.push({ id: uid('rr'), partnerId, sentAt: iso(ctx.now), status: 'sent', reply: null, channel: partnerOf(d, partnerId)?.channel || 'email' });
  }
  rfq.status = 'sourcing';
  audit(d, ctx, rfq.tenantId, { actor: AI_ACTOR, action: 'rates.requested', entityType: 'rfq', entityId: rfq.id, entityRef: rfq.ref, hitl: 'auto', confidence: 1, summary: `Drafted and sent rate requests to ${added.length} partner(s): ${added.map((p) => partnerOf(d, p)?.name).join(', ')}`, output: { partners: added.map((p) => partnerOf(d, p)?.name), lane: `${rfq.data.origin} → ${rfq.data.destination}` } });
  return rfq;
}

export function recordRateReply(d, { rfqId, rrId, reply, declined }, ctx) {
  const rfq = byId(d.rfqs, rfqId, 'RFQ');
  const rr = byId(rfq.rateRequests, rrId, 'Rate request');
  const partner = partnerOf(d, rr.partnerId);
  if (declined) {
    rr.status = 'declined';
    rr.reply = null;
    rr.repliedAt = iso(ctx.now);
    audit(d, ctx, rfq.tenantId, { actor: AI_ACTOR, action: 'rates.reply.parsed', entityType: 'rfq', entityId: rfq.id, entityRef: rfq.ref, confidence: 0.97, hitl: 'auto', summary: `${partner?.name} declined (no space / lane not served)` });
  } else {
    rr.status = 'replied';
    rr.reply = { ...reply, receivedAt: iso(ctx.now) };
    rr.repliedAt = iso(ctx.now);
    audit(d, ctx, rfq.tenantId, { actor: AI_ACTOR, action: 'rates.reply.parsed', entityType: 'rfq', entityId: rfq.id, entityRef: rfq.ref, confidence: reply.parseConfidence, hitl: 'auto', summary: `Parsed rate reply from ${partner?.name}: ${reply.currency} ${reply.total.toLocaleString()} · ${reply.transitDays} days`, input: { text: reply.rawText }, output: { charges: reply.charges, transitDays: reply.transitDays, validUntil: reply.validUntil } });
  }
  if (rfq.status === 'sourcing' && rfq.rateRequests.every((r) => r.status !== 'sent')) rfq.status = 'rates_in';
  return rfq;
}

// ───────────────────────────── Quotation ─────────────────────────────
export function createQuote(d, { rfqId, rrId, templateId }, ctx) {
  const rfq = byId(d.rfqs, rfqId, 'RFQ');
  const rr = byId(rfq.rateRequests, rrId, 'Rate request');
  if (!rr.reply) throw new Error('This partner has not replied with a rate yet.');
  if (rfq.quoteId) {
    const existing = d.quotes.find((q) => q.id === rfq.quoteId);
    if (existing && !['rejected', 'expired'].includes(existing.status)) throw new Error(`Quote ${existing.ref} already exists for this RFQ.`);
  }
  const t = tenantOf(d, rfq.tenantId);
  const cust = customerOf(d, rfq.customerId);
  const buyLines = rr.reply.charges.map((c) => ({ code: c.code, desc: c.desc, buy: c.amount }));
  const mctx = { mode: rfq.data.mode, customerTier: cust?.tier, originCountry: portByCode[rfq.data.origin]?.country, destCountry: portByCode[rfq.data.destination]?.country, buyTotal: rr.reply.total };
  const rule = findMarginRule(t.settings.marginRules, mctx);
  const priced = applyMargin(buyLines, rule, mctx);
  const tpl = t.settings.quoteTemplates.find((x) => x.id === (templateId || t.settings.defaultTemplateId)) || t.settings.quoteTemplates[0];
  const quote = {
    id: uid('qt'),
    tenantId: rfq.tenantId,
    ref: nextRef(d, rfq.tenantId, 'quote'),
    rfqId: rfq.id,
    customerId: rfq.customerId,
    partnerId: rr.partnerId,
    rateRequestId: rr.id,
    templateId: tpl.id,
    currency: t.currency,
    lines: priced.lines,
    ...totals(priced.lines),
    ruleId: priced.ruleId,
    ruleName: priced.ruleName,
    toppedUp: priced.toppedUp,
    transitDays: rr.reply.transitDays,
    routing: rr.reply.routing,
    validUntil: isoDate(Math.min(new Date(rr.reply.validUntil).getTime(), ctx.now + tpl.validityDays * DAY)),
    status: 'draft',
    approvals: [],
    createdAt: iso(ctx.now),
    sentAt: null,
    decidedAt: null,
    shipmentId: null,
    history: [{ at: iso(ctx.now), by: AI_ACTOR.name, text: `Drafted from ${partnerOf(d, rr.partnerId)?.name} rate using rule "${priced.ruleName}"` }],
  };
  d.quotes.unshift(quote);
  rfq.quoteId = quote.id;
  rfq.selectedRateId = rr.id;
  rfq.status = 'quoted';
  audit(d, ctx, rfq.tenantId, { actor: AI_ACTOR, action: 'quote.drafted', entityType: 'quote', entityId: quote.id, entityRef: quote.ref, confidence: 1, hitl: 'pending', summary: `Drafted quote ${quote.ref}: buy ${t.currency} ${quote.buyTotal.toLocaleString()} → sell ${t.currency} ${quote.sellTotal.toLocaleString()} (${quote.marginPct}% margin, rule "${priced.ruleName}")`, input: { rateFrom: partnerOf(d, rr.partnerId)?.name, buyLines }, output: { lines: priced.lines, rule: priced.ruleName, toppedUp: priced.toppedUp } });
  return quote;
}

export function updateQuoteLines(d, { quoteId, lines }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  if (q.status !== 'draft') throw new Error('Only draft quotes can be edited. Withdraw it to draft first.');
  q.lines = lines.map((l) => ({ ...l, buy: Number(l.buy) || 0, sell: Number(l.sell) || 0 }));
  Object.assign(q, totals(q.lines));
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: `Edited lines — sell ${q.sellTotal}, margin ${q.marginPct}%` });
  audit(d, ctx, q.tenantId, { action: 'quote.edited', entityType: 'quote', entityId: q.id, entityRef: q.ref, summary: `Manually adjusted quote lines (sell ${q.currency} ${q.sellTotal.toLocaleString()}, margin ${q.marginPct}%)` });
}

export function setQuoteTemplate(d, { quoteId, templateId }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  q.templateId = templateId;
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: 'Changed quote template' });
}

export function submitQuote(d, { quoteId }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  if (q.status !== 'draft') throw new Error('Quote already submitted.');
  const t = tenantOf(d, q.tenantId);
  const cust = customerOf(d, q.customerId);
  const rfq = d.rfqs.find((r) => r.id === q.rfqId);
  q.approvals = buildApprovalChain(t.settings.workflows.quote, { marginPct: q.marginPct, value: q.sellTotal, customerTier: cust?.tier, hazardous: rfq?.data?.hazardous });
  q.status = q.approvals.length ? 'pending_approval' : 'approved';
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: q.approvals.length ? `Submitted for approval (${q.approvals.map((s) => s.name).join(' → ')})` : 'No approval required by workflow — approved' });
  audit(d, ctx, q.tenantId, { action: 'quote.submitted', entityType: 'quote', entityId: q.id, entityRef: q.ref, hitl: q.approvals.length ? 'pending' : 'auto', summary: q.approvals.length ? `Submitted for ${q.approvals.length}-step approval` : 'Approved automatically (no matching approval step)' });
}

export function withdrawQuote(d, { quoteId }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  if (!['pending_approval', 'approved'].includes(q.status)) throw new Error('Only quotes awaiting approval or not yet sent can be withdrawn.');
  q.status = 'draft';
  q.approvals = [];
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: 'Withdrawn to draft' });
}

export function sendQuote(d, { quoteId, channel }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  if (q.status !== 'approved') throw new Error('Quote must be fully approved before it is sent to the customer.');
  q.status = 'sent';
  q.sentAt = iso(ctx.now);
  q.sentVia = channel || 'email';
  const cust = customerOf(d, q.customerId);
  const built = dispatch(d.connectors, q.tenantId, 'notify.customer', { to: channel === 'whatsapp' ? cust?.whatsapp : cust?.email, quote: q.ref, total: q.sellTotal }, connCtx(d, q.tenantId, q.customerId, q.partnerId));
  logMessage(d, ctx, q.tenantId, built, 'outbound', q.ref);
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: `Sent to ${cust?.name} via ${q.sentVia}` });
  audit(d, ctx, q.tenantId, { action: 'quote.sent', entityType: 'quote', entityId: q.id, entityRef: q.ref, summary: `Quote sent to ${cust?.name} (${q.sentVia})` });
}

export function customerDecision(d, { quoteId, accepted, reason }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  if (q.status !== 'sent') throw new Error('Only sent quotes can be accepted or rejected.');
  const rfq = d.rfqs.find((r) => r.id === q.rfqId);
  q.decidedAt = iso(ctx.now);
  if (!accepted) {
    q.status = 'rejected';
    q.lostReason = reason || 'Price';
    if (rfq) {
      rfq.status = 'lost';
      rfq.lostReason = q.lostReason;
    }
    q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: `Customer rejected — ${q.lostReason}` });
    audit(d, ctx, q.tenantId, { action: 'quote.rejected', entityType: 'quote', entityId: q.id, entityRef: q.ref, summary: `Customer rejected quote (${q.lostReason})` });
    return null;
  }
  q.status = 'accepted';
  if (rfq) rfq.status = 'won';
  q.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: 'Customer accepted — booking created' });
  audit(d, ctx, q.tenantId, { action: 'quote.accepted', entityType: 'quote', entityId: q.id, entityRef: q.ref, summary: 'Customer accepted quote' });
  return createShipment(d, { quoteId }, ctx);
}

// ───────────────────────────── Booking ─────────────────────────────
function createShipment(d, { quoteId }, ctx) {
  const q = byId(d.quotes, quoteId, 'Quote');
  const rfq = byId(d.rfqs, q.rfqId, 'RFQ');
  const t = tenantOf(d, q.tenantId);
  const cust = customerOf(d, q.customerId);
  const partner = partnerOf(d, q.partnerId);
  const rng = ctx.rng;
  const isExport = portByCode[rfq.data.origin]?.country === cust?.country;
  const etd = isoDate(new Date(rfq.data.cargoReadyDate || ctx.now).getTime() + 3 * DAY);
  const fam = milestoneFamily(rfq.data.mode);
  const transit = q.transitDays || 20;
  const etaMs = new Date(etd).getTime() + transit * DAY;
  const depOffset = MILESTONES[fam].find((m) => m.code === 'DEP' || m.code === 'PUP')?.offset || 0;
  const s = {
    id: uid('shp'),
    tenantId: q.tenantId,
    ref: nextRef(d, q.tenantId, 'shipment'),
    cwKey: null,
    quoteId: q.id,
    rfqId: rfq.id,
    customerId: q.customerId,
    partnerId: q.partnerId,
    ...rfq.data,
    shipper: isExport ? cust?.name : counterparty(rng),
    consignee: isExport ? counterparty(rng) : cust?.name,
    containerNo: rfq.data.mode === 'SEA_FCL' ? containerNo(rng, partner?.scac) : null,
    vessel: fam === 'SEA' ? rng.pick(VESSELS) : fam === 'AIR' ? `${partner?.scac || 'XX'} ${rng.int(100, 999)}` : `Truck ${rng.int(10, 99)}-${rng.int(100, 999)}`,
    voyage: fam === 'SEA' ? `${rng.int(100, 499)}${rng.pick(['W', 'E', 'N', 'S'])}` : null,
    etd,
    eta: isoDate(etaMs),
    status: 'booking_pending',
    approvals: [],
    milestones: MILESTONES[fam].map((m) => ({ code: m.code, name: m.name, planned: isoDate(new Date(etd).getTime() + (m.offset - depOffset) * DAY), actual: null, location: null, source: null })),
    sellLines: q.lines,
    expectedCosts: q.lines.filter((l) => l.buy > 0).map((l) => ({ code: l.code, desc: l.desc, amount: l.buy, partnerId: q.partnerId })),
    notifications: [],
    createdAt: iso(ctx.now),
    bookedAt: null,
  };
  // Re-anchor planned dates on the quoted transit time: legs before departure keep their
  // template offsets, en-route legs are spread between ETD and ETA, post-arrival legs follow the ETA.
  const tpl = MILESTONES[fam];
  const arvOffset = tpl.find((m) => m.code === 'ARV' || m.code === 'DLV').offset;
  s.milestones.forEach((m, i) => {
    const off = tpl[i].offset;
    let ms;
    if (off <= depOffset) ms = new Date(etd).getTime() + (off - depOffset) * DAY;
    else if (off <= arvOffset) ms = new Date(etd).getTime() + ((off - depOffset) / (arvOffset - depOffset)) * (etaMs - new Date(etd).getTime());
    else ms = etaMs + (off - arvOffset) * DAY;
    m.planned = isoDate(ms);
  });
  d.shipments.unshift(s);
  q.shipmentId = s.id;
  s.approvals = buildApprovalChain(t.settings.workflows.booking, { value: q.sellTotal, customerTier: cust?.tier, hazardous: s.hazardous });
  audit(d, ctx, s.tenantId, { actor: AI_ACTOR, action: 'booking.prepared', entityType: 'shipment', entityId: s.id, entityRef: s.ref, confidence: 1, hitl: s.approvals.length ? 'pending' : 'auto', summary: `Prepared CargoWise booking for ${s.ref} from quote ${q.ref}${s.approvals.length ? ' — awaiting confirmation' : ''}` });
  if (!s.approvals.length) pushBooking(d, { shipmentId: s.id }, ctx);
  return s;
}

export function pushBooking(d, { shipmentId }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const t = tenantOf(d, s.tenantId);
  t.cwSeq = (t.cwSeq || 41000) + 1;
  const key = `S${String(t.cwSeq).padStart(8, '0')}`;
  const built = dispatch(d.connectors, s.tenantId, 'shipment.create', { ...s, cwKey: key }, connCtx(d, s.tenantId, s.customerId, s.partnerId));
  if (!built) throw new Error('No connected TMS connector handles "shipment.create". Connect CargoWise in Connectors.');
  s.cwKey = built.connectorName.includes('CargoWise') ? key : `EXT-${t.cwSeq}`;
  s.status = 'booked';
  s.bookedAt = iso(ctx.now);
  s.bookedIn = built.connectorName;
  const bkd = s.milestones.find((m) => m.code === 'BKD');
  if (bkd) Object.assign(bkd, { actual: iso(ctx.now), location: portByCode[s.origin]?.name, source: built.connectorName });
  logMessage(d, ctx, s.tenantId, built, 'outbound', s.ref);
  audit(d, ctx, s.tenantId, { actor: SYSTEM_ACTOR, action: 'booking.pushed', entityType: 'shipment', entityId: s.id, entityRef: s.ref, summary: `Shipment created in ${built.connectorName} as ${s.cwKey} (${built.messageType})` });
}

// ───────────────────────────── Documents ─────────────────────────────
export function ingestDocument(d, { shipmentId, type, fields, fileName, confidence }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const issues = validateDocument({ type, fields }, s);
  const doc = {
    id: uid('doc'),
    tenantId: s.tenantId,
    shipmentId,
    type,
    fileName: fileName || `${type}_${s.ref}.pdf`,
    receivedAt: iso(ctx.now),
    fields,
    confidence: confidence ?? 0.94,
    issues,
    status: docStatusFromIssues(issues),
  };
  d.documents.unshift(doc);
  meter(d, s.tenantId, 'documents', 1, ctx.now);
  audit(d, ctx, s.tenantId, {
    actor: AI_ACTOR,
    action: 'document.validated',
    entityType: 'document',
    entityId: doc.id,
    entityRef: `${DOC_TYPES[type].short} · ${s.ref}`,
    confidence: doc.confidence,
    hitl: issues.length ? 'pending' : 'auto',
    summary: issues.length ? `${DOC_TYPES[type].label} read and validated: ${issues.length} mismatch(es) flagged — ${issues.map((i) => i.label).join(', ')}` : `${DOC_TYPES[type].label} read and validated: matches shipment record`,
    output: { fields, issues: issues.map(({ label, docValue, recordValue, severity }) => ({ label, docValue, recordValue, severity })) },
  });
  return doc;
}

export function resolveIssue(d, { docId, field, resolution, note }, ctx) {
  const doc = byId(d.documents, docId, 'Document');
  const issue = doc.issues.find((i) => i.field === field);
  if (!issue) throw new Error('Issue not found');
  const s = d.shipments.find((x) => x.id === doc.shipmentId);
  if (resolution === 'accept_doc') {
    s[field] = issue.docValue;
    issue.status = 'accepted_doc';
    // Other documents may now match (or no longer match) the updated record.
    for (const other of d.documents.filter((x) => x.shipmentId === s.id && x.id !== doc.id)) {
      const fresh = validateDocument(other, s);
      other.issues = fresh.map((fi) => other.issues.find((oi) => oi.field === fi.field && oi.status !== 'open') || fi);
      other.status = docStatusFromIssues(other.issues);
    }
  } else if (resolution === 'keep_record') issue.status = 'overridden';
  else issue.status = 'correction_requested';
  Object.assign(issue, { note: note || '', by: ctx.actor.name, at: iso(ctx.now) });
  doc.status = docStatusFromIssues(doc.issues.map((i) => (i.status === 'correction_requested' ? { ...i, status: 'open' } : i)));
  if (resolution === 'request_correction') doc.status = 'correction_requested';
  const label = { accept_doc: 'Updated shipment record from document', keep_record: 'Kept shipment record (document value overridden)', request_correction: 'Requested corrected document from sender' }[resolution];
  audit(d, ctx, doc.tenantId, { action: 'document.issue.resolved', entityType: 'document', entityId: doc.id, entityRef: `${DOC_TYPES[doc.type].short} · ${s.ref}`, hitl: resolution === 'request_correction' ? 'rejected' : 'approved', summary: `${CHECK_DEFS[field].label}: ${label}${note ? ` — "${note}"` : ''}`, output: { docValue: issue.docValue, recordValue: issue.recordValue } });
}

// ───────────────────────────── Tracking ─────────────────────────────
export function recordMilestone(d, { shipmentId, code, at, location, source }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  if (!s.cwKey) throw new Error('Shipment is not booked yet.');
  const m = s.milestones.find((x) => x.code === code);
  if (!m) throw new Error('Unknown milestone');
  if (m.actual) return;
  Object.assign(m, { actual: at || iso(ctx.now), location: location || (['DEP', 'GIN', 'RCS', 'PUP', 'BKD'].includes(code) ? portByCode[s.origin]?.name : portByCode[s.destination]?.name), source: source || partnerOf(d, s.partnerId)?.name });
  const order = s.milestones.findIndex((x) => x.code === code);
  s.milestones.forEach((x, i) => {
    if (i < order && !x.actual) Object.assign(x, { actual: m.actual, location: x.location || m.location, source: 'inferred' });
  });
  if (code === 'DEP' || code === 'PUP') s.status = 'in_transit';
  if (code === 'ARV' || code === 'TSH' || code === 'BRD') s.status = code === 'ARV' ? 'arrived' : 'in_transit';
  if (code === 'CLR') s.status = 'arrived';
  if (code === 'DLV') s.status = 'delivered';
  if (code === 'DEP' && s.eta) {
    // Carrier ETA update on departure.
    const drift = ctx.rng.int(-1, 3);
    if (drift) s.eta = isoDate(new Date(s.eta).getTime() + drift * DAY);
  }
  const built = dispatch(d.connectors, s.tenantId, 'event.inbound', { cwKey: s.cwKey, code, name: m.name, at: m.actual, location: m.location }, connCtx(d, s.tenantId, s.customerId, s.partnerId));
  logMessage(d, ctx, s.tenantId, built, 'inbound', s.ref, 'received');
  audit(d, ctx, s.tenantId, { actor: SYSTEM_ACTOR, action: 'tracking.milestone', entityType: 'shipment', entityId: s.id, entityRef: s.ref, summary: `${m.name} at ${m.location} (from ${m.source})` });

  const t = tenantOf(d, s.tenantId);
  if (t.settings.tracking.notifyOn.includes(code)) draftNotification(d, s, m, ctx);
}

function draftNotification(d, s, m, ctx) {
  const t = tenantOf(d, s.tenantId);
  const cust = customerOf(d, s.customerId);
  const channel = cust?.preferredChannel || t.settings.tracking.channel;
  const text = `Dear ${cust?.contact?.split(' ')[0] || 'customer'}, update on your shipment ${s.ref} (${portByCode[s.origin]?.name} → ${portByCode[s.destination]?.name}): ${m.name.toLowerCase()} on ${m.actual.slice(0, 10)}${m.location ? ` at ${m.location}` : ''}. Current ETA ${s.eta}. — ${t.name}`;
  const n = { id: uid('ntf'), milestone: m.code, channel, to: channel === 'whatsapp' ? cust?.whatsapp : cust?.email, message: text, status: 'draft', createdAt: iso(ctx.now), sentAt: null, approvals: [] };
  n.approvals = t.settings.tracking.autoNotify ? [] : buildApprovalChain(t.settings.workflows.notification, {});
  s.notifications.unshift(n);
  audit(d, ctx, s.tenantId, { actor: AI_ACTOR, action: 'notification.drafted', entityType: 'shipment', entityId: s.id, entityRef: s.ref, confidence: 0.98, hitl: n.approvals.length ? 'pending' : 'auto', summary: `Drafted ${channel} status update to ${cust?.name} for "${m.name}"`, output: { message: text } });
  if (!n.approvals.length) sendNotification(d, { shipmentId: s.id, notificationId: n.id }, ctx);
}

export function editNotification(d, { shipmentId, notificationId, message }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const n = byId(s.notifications, notificationId, 'Notification');
  n.message = message;
  audit(d, ctx, s.tenantId, { action: 'notification.edited', entityType: 'shipment', entityId: s.id, entityRef: s.ref, summary: 'Edited AI-drafted customer update before sending' });
}

export function sendNotification(d, { shipmentId, notificationId, message }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const n = byId(s.notifications, notificationId, 'Notification');
  if (message) n.message = message;
  n.status = 'sent';
  n.sentAt = iso(ctx.now);
  const built = dispatch(d.connectors, s.tenantId, 'notify.customer', { to: n.to, message: n.message }, connCtx(d, s.tenantId, s.customerId, s.partnerId));
  logMessage(d, ctx, s.tenantId, built, 'outbound', s.ref);
  audit(d, ctx, s.tenantId, { actor: ctx.actor?.role === 'ai' ? SYSTEM_ACTOR : ctx.actor, action: 'notification.sent', entityType: 'shipment', entityId: s.id, entityRef: s.ref, summary: `Status update sent to customer via ${n.channel}` });
}

// ───────────────────────────── Invoicing ─────────────────────────────
export function createArInvoice(d, { shipmentId }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  if (!s.cwKey) throw new Error('Book the shipment in CargoWise first.');
  if (d.arInvoices.some((i) => i.shipmentId === s.id && i.status !== 'void')) throw new Error('An AR invoice already exists for this shipment.');
  const t = tenantOf(d, s.tenantId);
  const q = d.quotes.find((x) => x.id === s.quoteId);
  const extras = d.apInvoices
    .filter((a) => a.shipmentId === s.id && ['approved', 'posted', 'matched'].includes(a.status))
    .flatMap((a) => a.recon.rows.filter((r) => r.status === 'unexpected').map((r) => ({ code: r.code, desc: r.desc, amount: r.invoiced })));
  const lines = buildArLines(q?.lines || s.sellLines, extras, t.settings.ap.rebillMarkupPct);
  const total = round2(lines.reduce((a, l) => a + l.amount, 0));
  const cust = customerOf(d, s.customerId);
  const inv = {
    id: uid('ar'),
    tenantId: s.tenantId,
    ref: nextRef(d, s.tenantId, 'ar'),
    ledger: 'AR',
    shipmentId: s.id,
    customerId: s.customerId,
    lines,
    total,
    currency: t.currency,
    date: isoDate(ctx.now),
    dueDate: isoDate(ctx.now + (cust?.paymentTermsDays || 30) * DAY),
    status: 'pending_approval',
    approvals: buildApprovalChain(t.settings.workflows.arInvoice, { value: total, customerTier: cust?.tier }),
    cwTxnNo: null,
    createdAt: iso(ctx.now),
    postedAt: null,
  };
  if (!inv.approvals.length) inv.status = 'approved';
  d.arInvoices.unshift(inv);
  meter(d, s.tenantId, 'invoices', 1, ctx.now);
  audit(d, ctx, s.tenantId, { actor: AI_ACTOR, action: 'ar.drafted', entityType: 'arInvoice', entityId: inv.id, entityRef: inv.ref, confidence: 1, hitl: inv.approvals.length ? 'pending' : 'auto', summary: `Drafted AR invoice ${inv.ref} for ${s.ref}: ${t.currency} ${total.toLocaleString()} (${lines.filter((l) => l.source === 'quote').length} quoted + ${extras.length} rebilled line(s))`, output: { lines } });
  if (inv.status === 'approved') postArInvoice(d, { invoiceId: inv.id }, ctx);
  return inv;
}

export function postArInvoice(d, { invoiceId }, ctx) {
  const inv = byId(d.arInvoices, invoiceId, 'AR invoice');
  const s = d.shipments.find((x) => x.id === inv.shipmentId);
  const built = dispatch(d.connectors, inv.tenantId, 'transaction.ar.post', { ...inv, cwKey: s?.cwKey }, connCtx(d, inv.tenantId, inv.customerId, s?.partnerId));
  if (!built) throw new Error('No connected connector handles AR posting.');
  inv.status = 'posted';
  inv.postedAt = iso(ctx.now);
  inv.cwTxnNo = `${tenantOf(d, inv.tenantId).code}${inv.ref.slice(-4)}AR`;
  inv.postedTo = built.connectorName;
  logMessage(d, ctx, inv.tenantId, built, 'outbound', inv.ref);
  audit(d, ctx, inv.tenantId, { actor: SYSTEM_ACTOR, action: 'ar.posted', entityType: 'arInvoice', entityId: inv.id, entityRef: inv.ref, summary: `AR invoice posted to ${built.connectorName} (${built.messageType})` });
}

export function receiveApInvoice(d, { shipmentId, partnerId, vendorRef, lines }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const t = tenantOf(d, s.tenantId);
  const pid = partnerId || s.partnerId;
  const expected = s.expectedCosts.filter((c) => c.partnerId === pid);
  const recon = reconcileAp(lines, expected, { pct: t.settings.ap.tolerancePct, abs: t.settings.ap.toleranceAbs });
  const inv = {
    id: uid('ap'),
    tenantId: s.tenantId,
    ref: vendorRef,
    ledger: 'AP',
    shipmentId,
    partnerId: pid,
    lines,
    total: recon.invoicedTotal,
    currency: t.currency,
    date: isoDate(ctx.now),
    dueDate: isoDate(ctx.now + 30 * DAY),
    recon,
    status: recon.withinTolerance ? 'matched' : 'variance',
    approvals: recon.withinTolerance ? [] : buildApprovalChain(t.settings.workflows.apInvoice, { variancePct: recon.variancePct, value: recon.invoicedTotal }),
    receivedAt: iso(ctx.now),
    postedAt: null,
    cwTxnNo: null,
  };
  if (!recon.withinTolerance && !inv.approvals.length) inv.status = 'approved';
  d.apInvoices.unshift(inv);
  meter(d, s.tenantId, 'invoices', 1, ctx.now);
  audit(d, ctx, s.tenantId, {
    actor: AI_ACTOR,
    action: 'ap.reconciled',
    entityType: 'apInvoice',
    entityId: inv.id,
    entityRef: inv.ref,
    confidence: 0.96,
    hitl: recon.withinTolerance ? 'auto' : 'pending',
    summary: recon.withinTolerance ? `Carrier invoice ${vendorRef} from ${partnerOf(d, pid)?.name} matched expected costs (variance ${t.currency} ${recon.variance})` : `Carrier invoice ${vendorRef} flagged: variance ${t.currency} ${recon.variance} (${recon.variancePct}%) on ${recon.rows.filter((r) => r.status !== 'ok').map((r) => r.code).join(', ')}`,
    output: recon,
  });
  if (inv.status === 'matched' || inv.status === 'approved') postApInvoice(d, { invoiceId: inv.id }, ctx);
  return inv;
}

export function postApInvoice(d, { invoiceId }, ctx) {
  const inv = byId(d.apInvoices, invoiceId, 'AP invoice');
  const s = d.shipments.find((x) => x.id === inv.shipmentId);
  const built = dispatch(d.connectors, inv.tenantId, 'transaction.ap.post', { ...inv, cwKey: s?.cwKey }, connCtx(d, inv.tenantId, s?.customerId, inv.partnerId));
  if (!built) return;
  inv.status = 'posted';
  inv.postedAt = iso(ctx.now);
  inv.cwTxnNo = `${tenantOf(d, inv.tenantId).code}${inv.ref.replace(/\D/g, '').slice(-4)}AP`;
  inv.postedTo = built.connectorName;
  logMessage(d, ctx, inv.tenantId, built, 'outbound', inv.ref);
  audit(d, ctx, inv.tenantId, { actor: SYSTEM_ACTOR, action: 'ap.posted', entityType: 'apInvoice', entityId: inv.id, entityRef: inv.ref, summary: `AP invoice posted to ${built.connectorName} (${built.messageType})` });
}

// ───────────────────────────── Generic approvals ─────────────────────────────
function approvalTarget(d, kind, id, subId) {
  if (kind === 'quote') return { entity: byId(d.quotes, id, 'Quote'), ref: (e) => e.ref };
  if (kind === 'booking') return { entity: byId(d.shipments, id, 'Shipment'), ref: (e) => e.ref };
  if (kind === 'arInvoice') return { entity: byId(d.arInvoices, id, 'AR invoice'), ref: (e) => e.ref };
  if (kind === 'apInvoice') return { entity: byId(d.apInvoices, id, 'AP invoice'), ref: (e) => e.ref };
  if (kind === 'notification') {
    const s = byId(d.shipments, id, 'Shipment');
    return { entity: byId(s.notifications, subId, 'Notification'), shipment: s, ref: () => s.ref };
  }
  throw new Error(`Unknown approval kind ${kind}`);
}

export function decide(d, { kind, id, subId, approve, comment }, ctx) {
  const target = approvalTarget(d, kind, id, subId);
  const e = target.entity;
  const idx = currentStepIndex(e.approvals);
  if (idx < 0) throw new Error('Nothing waiting for approval.');
  const step = e.approvals[idx];
  if (!canApprove(ctx.actor, step)) throw new Error(`"${step.name}" needs the ${step.role} role (you are ${ctx.actor.role}).`);
  if (!approve && !comment) throw new Error('A comment is required when rejecting.');
  Object.assign(step, { status: approve ? 'approved' : 'rejected', by: ctx.actor.name, at: iso(ctx.now), comment: comment || '' });
  const tenantId = e.tenantId || target.shipment?.tenantId;
  const entityRef = target.ref(e);
  audit(d, ctx, tenantId, { action: `${kind}.${approve ? 'approved' : 'rejected'}`, entityType: kind === 'booking' || kind === 'notification' ? 'shipment' : kind, entityId: target.shipment?.id || e.id, entityRef, hitl: approve ? 'approved' : 'rejected', summary: `${APPROVAL_KINDS[kind]} — step "${step.name}" ${approve ? 'approved' : 'rejected'}${comment ? `: "${comment}"` : ''}` });
  const status = chainStatus(e.approvals);
  if (kind === 'quote') {
    e.history.push({ at: iso(ctx.now), by: ctx.actor.name, text: `${step.name}: ${approve ? 'approved' : `rejected — ${comment}`}` });
    if (status === 'approved') e.status = 'approved';
    if (status === 'rejected') {
      e.status = 'draft';
      e.rejectionNote = comment;
    }
  } else if (kind === 'booking') {
    if (status === 'approved') pushBooking(d, { shipmentId: e.id }, ctx);
    if (status === 'rejected') e.status = 'booking_hold';
  } else if (kind === 'arInvoice') {
    if (status === 'approved') postArInvoice(d, { invoiceId: e.id }, ctx);
    if (status === 'rejected') e.status = 'draft';
  } else if (kind === 'apInvoice') {
    if (status === 'approved') {
      e.status = 'approved';
      postApInvoice(d, { invoiceId: e.id }, ctx);
    }
    if (status === 'rejected') e.status = 'disputed';
  } else if (kind === 'notification') {
    if (status === 'approved') sendNotification(d, { shipmentId: target.shipment.id, notificationId: e.id }, ctx);
    if (status === 'rejected') e.status = 'discarded';
  }
}

export function retryBooking(d, { shipmentId }, ctx) {
  const s = byId(d.shipments, shipmentId, 'Shipment');
  const t = tenantOf(d, s.tenantId);
  s.status = 'booking_pending';
  s.approvals = buildApprovalChain(t.settings.workflows.booking, {});
  audit(d, ctx, s.tenantId, { action: 'booking.resubmitted', entityType: 'shipment', entityId: s.id, entityRef: s.ref, summary: 'Booking resubmitted for confirmation' });
  if (!s.approvals.length) pushBooking(d, { shipmentId }, ctx);
}

// ───────────────────────────── Settings / platform ─────────────────────────────
export function updateSettings(d, { tenantId, section, value, label }, ctx) {
  const t = tenantOf(d, tenantId);
  t.settings[section] = value;
  audit(d, ctx, tenantId, { action: 'settings.updated', entityType: 'tenant', entityId: tenantId, entityRef: t.name, summary: `Updated ${label || section}` });
}

export function updateTenant(d, { tenantId, patch, label }, ctx) {
  const t = tenantOf(d, tenantId);
  Object.assign(t, patch);
  audit(d, ctx, tenantId, { action: 'tenant.updated', entityType: 'tenant', entityId: tenantId, entityRef: t.name, summary: label || `Updated ${Object.keys(patch).join(', ')}` });
}

export function upsertUser(d, { user }, ctx) {
  const existing = d.users.find((u) => u.id === user.id);
  if (d.users.some((u) => u.email === user.email && u.id !== user.id)) throw new Error('Email already in use.');
  if (existing) Object.assign(existing, user);
  else d.users.push({ ...user, id: uid('usr'), active: true });
  audit(d, ctx, user.tenantId, { action: existing ? 'user.updated' : 'user.invited', entityType: 'user', entityId: user.id, entityRef: user.email, summary: `${existing ? 'Updated' : 'Invited'} ${user.name} as ${user.role}` });
}

export function upsertConnector(d, { instance }, ctx) {
  const existing = d.connectors.find((c) => c.id === instance.id);
  if (existing) Object.assign(existing, instance);
  else d.connectors.push({ ...instance, id: uid('con'), createdAt: iso(ctx.now), lastSyncAt: null });
  audit(d, ctx, instance.tenantId, { action: existing ? 'connector.updated' : 'connector.added', entityType: 'connector', entityId: instance.id, entityRef: instance.name, summary: `${existing ? 'Updated' : 'Added'} connector ${instance.name} (credentials stored encrypted, tenant-scoped)` });
}

export function removeConnector(d, { id }, ctx) {
  const c = byId(d.connectors, id, 'Connector');
  d.connectors = d.connectors.filter((x) => x.id !== id);
  audit(d, ctx, c.tenantId, { action: 'connector.removed', entityType: 'connector', entityId: id, entityRef: c.name, summary: `Removed connector ${c.name}` });
}

export function createTenant(d, { tenant, admin, partners = [], customers = [] }, ctx) {
  if (d.tenants.some((t) => t.code === tenant.code)) throw new Error('Tenant code already in use.');
  const id = uid('t');
  d.tenants.push({ ...tenant, id, status: 'active', createdAt: isoDate(ctx.now), cwSeq: 10000 });
  const userId = uid('usr');
  d.users.push({ id: userId, tenantId: id, name: admin.name, email: admin.email, role: 'admin', active: true, mfa: false, lastLoginAt: null });
  d.usage[id] = {};
  partners.forEach((p) => d.partners.push({ ...p, id: uid('p'), tenantId: id }));
  customers.forEach((c) => d.customers.push({ ...c, id: uid('c'), tenantId: id }));
  d.session.userByTenant[id] = userId;
  audit(d, ctx, id, { actor: SYSTEM_ACTOR, action: 'tenant.created', entityType: 'tenant', entityId: id, entityRef: tenant.name, summary: `Tenant provisioned in ${tenant.region} on ${tenant.plan} plan; admin ${admin.email} invited` });
  return d.tenants.at(-1);
}

export function newRfqFromTruth(d, { tenantId, channel, customerId, laneDef, omit }, ctx, render) {
  const truth = makeShipmentTruth(ctx.rng, laneDef, ctx.now);
  const cust = customerOf(d, customerId);
  const { subject, raw } = render(channel, truth, cust, ctx.rng, omit || []);
  return { rfq: receiveRfq(d, { tenantId, channel, customerId, subject, raw }, ctx), truth };
}

export { CHARGE_CODES };
