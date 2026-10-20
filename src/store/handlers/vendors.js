// Vendor directory, compliance, RFQs, bookings, vendor portal actions.
import { fmtDate } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { assert } from './common.js';
import { vendorCompliance } from '../../lib/derived.js';

export const vendorHandlers = {
  VENDOR_CREATE(ctx, { data }) {
    const v = { id: ctx.id('vd'), regions: [], licenses: [], performance: [], rating: 4, w9: false, commissionPct: 0, notes: '', ...data };
    ctx.state.vendors.push(v);
    return `Vendor added to directory: ${v.name} (${v.category})`;
  },
  VENDOR_UPDATE(ctx, { vendorId, patch }) {
    const v = ctx.state.vendors.find((x) => x.id === vendorId);
    Object.assign(v, patch);
    return `Vendor ${v.name} updated (${Object.keys(patch).join(', ')})`;
  },
  VENDOR_RATE(ctx, { vendorId, eventId, onTime, quality, notes }) {
    const v = ctx.state.vendors.find((x) => x.id === vendorId);
    v.performance = v.performance.filter((p) => p.eventId !== eventId);
    v.performance.push({ eventId, onTime: Number(onTime), quality: Number(quality), notes, at: new Date().toISOString(), by: ctx.user.id });
    return { summary: `Rated ${v.name}: on-time ${onTime}/5, quality ${quality}/5`, eventId };
  },
  RFQ_CREATE(ctx, { eventId, category, description, vendorIds, dueDate }) {
    const ev = ctx.ev(eventId);
    assert(vendorIds.length >= 1, 'Pick at least one vendor');
    ev.rfqs.push({ id: ctx.id('rfq'), category, description, vendorIds, dueDate, createdAt: new Date().toISOString(), responses: [], awardedVendorId: null });
    return { summary: `RFQ "${category}" sent to ${vendorIds.length} vendor(s)`, eventId };
  },
  RFQ_RESPOND(ctx, { eventId, rfqId, vendorId, amount, notes }) {
    const ev = ctx.ev(eventId);
    const r = ev.rfqs.find((x) => x.id === rfqId);
    r.responses = r.responses.filter((x) => x.vendorId !== vendorId);
    r.responses.push({ vendorId, amount: round2(amount), notes, status: 'quoted', at: new Date().toISOString() });
    return { summary: `Quote received from ${ctx.state.vendors.find((v) => v.id === vendorId)?.name}: ${amount}`, eventId };
  },
  RFQ_AWARD(ctx, { eventId, rfqId, vendorId, model, sellPrice }) {
    const ev = ctx.ev(eventId);
    const r = ev.rfqs.find((x) => x.id === rfqId);
    const resp = r.responses.find((x) => x.vendorId === vendorId);
    r.awardedVendorId = vendorId;
    const v = ctx.state.vendors.find((x) => x.id === vendorId);
    ev.vendorBookings.push({ id: ctx.id('vb'), vendorId, category: r.category, service: r.description, qty: 1, cost: resp.amount, sellPrice: Number(sellPrice) || resp.amount, model, markupPct: 0, commissionPct: v.commissionPct, commissionAmount: round2((resp.amount * v.commissionPct) / 100), commissionStatus: v.commissionPct ? 'pending' : 'n/a', status: 'requested', loadIn: '', loadOut: '', onsiteContact: v.contact, payments: [], vendorInvoices: [] });
    return { summary: `RFQ awarded to ${v.name} (${resp.amount}, ${model}) — booking created`, eventId };
  },
  BOOKING_ADD(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    const v = ctx.state.vendors.find((x) => x.id === data.vendorId);
    const cost = Number(data.cost) || 0;
    ev.vendorBookings.push({ id: ctx.id('vb'), qty: 1, markupPct: 0, commissionPct: v.commissionPct, commissionAmount: round2((cost * v.commissionPct) / 100), commissionStatus: v.commissionPct ? 'pending' : 'n/a', status: 'requested', payments: [], vendorInvoices: [], onsiteContact: v.contact, ...data, cost, sellPrice: Number(data.sellPrice) || cost });
    return { summary: `Vendor booking: ${v.name} — ${data.service} (${data.model}, cost ${cost})`, eventId };
  },
  BOOKING_UPDATE(ctx, { eventId, bookingId, patch }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    Object.assign(b, patch);
    if ('cost' in patch && b.commissionPct) b.commissionAmount = round2((b.cost * b.commissionPct) / 100);
    return { summary: `Booking ${ctx.state.vendors.find((v) => v.id === b.vendorId)?.name} updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  BOOKING_CONFIRM(ctx, { eventId, bookingId }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    const blocking = vendorCompliance(ctx.state.vendors.find((x) => x.id === b.vendorId), ctx.today).filter((i) => i.level === 'danger');
    assert(!blocking.length, `Cannot confirm: ${blocking.map((i) => i.text).join(', ')}. Upload a valid certificate first.`);
    b.status = 'confirmed';
    b.confirmedAt = new Date().toISOString();
    const v = ctx.state.vendors.find((x) => x.id === b.vendorId);
    ctx.notify({ toRoles: ['planner'], eventId, level: 'success', text: `${v.name} confirmed booking for ${ev.name}` });
    return { summary: `${v.name} CONFIRMED booking for ${ev.name}`, eventId };
  },
  VENDOR_INVOICE_UPLOAD(ctx, { eventId, bookingId, name, amount }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    b.vendorInvoices.push({ id: ctx.id('vi'), name, amount: round2(amount), at: new Date().toISOString() });
    ctx.notify({ toRoles: ['finance'], eventId, level: 'info', text: `Vendor invoice "${name}" uploaded for ${ev.name}` });
    return { summary: `Vendor invoice uploaded: ${name} (${amount})`, eventId };
  },
  VENDOR_COI_UPLOAD(ctx, { vendorId, expiry }) {
    const v = ctx.state.vendors.find((x) => x.id === vendorId);
    v.coiExpiry = expiry;
    return `New COI uploaded by ${v.name}, valid until ${fmtDate(expiry)}`;
  },
};
