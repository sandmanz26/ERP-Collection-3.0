// Negative cases that real weddings & events run into: vendor fallout, bounced payments, weather calls,
// overtime on the night, and personal items in our custody. Rules live in lib/risk.js.
import { addDays, fmtDate } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { assert } from './common.js';
import { vendorCompliance, invoiceBalance } from '../../lib/derived.js';
import { overtimeQuote, overtimeApprovers, RISK_DEFAULTS } from '../../lib/risk.js';

/** A message the client sees in their portal ("Latest updates") — bad news is told, not discovered. */
function clientNotice(ev, text, tone = 'info', audience = 'all') {
  (ev.clientNotices ??= []).unshift({ id: `cn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), text, tone, audience });
}

export const riskHandlers = {
  BOOKING_CANCEL(ctx, { eventId, bookingId, initiatedBy, reason }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    assert(b, 'Booking not found');
    assert(b.status !== 'cancelled', 'This booking is already cancelled');
    assert(reason && reason.trim().length >= 3, 'A cancellation reason is required');
    const v = ctx.state.vendors.find((x) => x.id === b.vendorId);
    b.status = 'cancelled';
    b.cancelledAt = new Date().toISOString();
    b.cancelledBy = initiatedBy === 'eo' ? 'eo' : 'vendor';
    b.cancelReason = reason.trim();
    // Money already paid to a vendor who walks away must be recovered; unpaid installments stop.
    b.refundDue = b.cancelledBy === 'vendor' ? round2(b.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0)) : 0;
    b.payments.filter((p) => p.status !== 'paid').forEach((p) => { p.status = 'cancelled'; });
    // Replacement: RFQ to every other compliant vendor in the same category, answers due quickly.
    const candidates = ctx.state.vendors.filter((x) => x.id !== b.vendorId && x.category === v?.category && !vendorCompliance(x, ctx.today).some((i) => i.level === 'danger')).map((x) => x.id);
    const due = ev.date ? [addDays(ctx.today, 3), addDays(ev.date, -1)].sort()[0] : addDays(ctx.today, 3);
    let rfqNote = 'no other compliant vendor in this category — source one manually';
    if (candidates.length) {
      const rfq = { id: ctx.id('rfq'), category: b.category, description: `URGENT replacement for ${v?.name}: ${b.service}`, vendorIds: candidates, dueDate: due, createdAt: new Date().toISOString(), responses: [], awardedVendorId: null, replacementFor: b.id };
      ev.rfqs.push(rfq);
      b.replacementRfqId = rfq.id;
      rfqNote = `replacement RFQ sent to ${candidates.length} vendor(s), quotes due ${fmtDate(due)}`;
    }
    ctx.notify({ toRoles: ['planner', 'admin', 'production'], eventId, level: 'danger', text: `${v?.name} (${b.category}) cancelled on ${ev.name} — ${rfqNote}.` });
    clientNotice(ev, `Your ${b.category.toLowerCase()} vendor is no longer available. We are already securing a replacement at the agreed scope — no action needed from you.`, 'warning');
    return { summary: `Booking cancelled by ${b.cancelledBy === 'eo' ? 'us' : 'the vendor'}: ${v?.name} (${b.category}) — ${b.cancelReason}. ${b.refundDue ? `Deposit to recover: ${b.refundDue}. ` : ''}${rfqNote}`, eventId };
  },
  VENDOR_REFUND_RECOVERED(ctx, { eventId, bookingId }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    assert(b?.refundDue > 0, 'Nothing to recover for this booking');
    b.refundRecovered = new Date().toISOString();
    return { summary: `Deposit ${b.refundDue} recovered from cancelled vendor`, eventId };
  },
  VENDOR_ARRIVED(ctx, { eventId, bookingId }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    assert(b && b.status !== 'cancelled', 'Booking not active');
    assert(!b.arrivedAt, 'Arrival already recorded');
    b.arrivedAt = new Date().toISOString();
    const late = b.loadIn ? Math.round((new Date(b.arrivedAt) - new Date(b.loadIn)) / 60000) : 0;
    return { summary: `${ctx.state.vendors.find((v) => v.id === b.vendorId)?.name} arrived on site${late > 0 ? ` (${late} min after scheduled load-in)` : ''}`, eventId };
  },
  PAYMENT_REVERSE(ctx, { eventId, paymentId, reason, chargeFee }) {
    const ev = ctx.ev(eventId);
    assert(['admin', 'finance'].includes(ctx.user?.role), 'Only finance can reverse a payment');
    const p = ev.payments.find((x) => x.id === paymentId);
    assert(p && p.amount > 0, 'Payment not found');
    assert(!p.reversed, 'This payment was already reversed');
    assert(reason, 'Pick a reason (returned ACH, chargeback, bounced cheque…)');
    p.reversed = { at: new Date().toISOString(), reason };
    // A reversal is an opposite entry, never a deletion — the ledger keeps both.
    ev.payments.push({ id: ctx.id('pmt'), invoiceId: p.invoiceId, eventId, amount: -p.amount, method: p.method, at: new Date().toISOString(), ref: `REV-${p.ref}`, payerId: p.payerId, by: ctx.user.id, reversalOf: p.id, reason });
    const inv = ev.invoices.find((i) => i.id === p.invoiceId);
    let extra = '';
    if (inv) {
      inv.status = invoiceBalance(ev, inv) >= inv.amount ? 'sent' : 'partial';
      const item = ev.paymentSchedule.find((s) => s.id === inv.scheduleItemId);
      if (item && item.status === 'paid') item.status = 'invoiced';
      if (item?.isDeposit && ev.dateStatus === 'locked' && !['event_day', 'post_event', 'financial_close', 'archived'].includes(ev.stage)) {
        ev.dateStatus = 'hold';
        extra = ' — DEPOSIT reversed, the date is back on HOLD';
        ctx.notify({ toRoles: ['planner', 'sales', 'admin', 'finance'], eventId, level: 'danger', text: `Deposit on ${ev.name} was reversed (${reason}). ${fmtDate(ev.date)} is no longer secured.` });
      }
      clientNotice(ev, `Your payment on ${inv.number} was returned by the bank (${reason}). Please pay again to keep your schedule on track.`, 'danger', 'money');
    }
    if (chargeFee) {
      const fee = ctx.state.settings.returnedPaymentFee ?? RISK_DEFAULTS.returnedPaymentFee;
      ev.invoices.push({ id: ctx.id('inv'), number: `INV-${ctx.next('invoice')}`, eventId, kind: 'fee', label: `Returned payment fee (${inv?.number ?? p.ref})`, payerId: p.payerId ?? null, amount: fee, currency: ev.currency, fxRateToUSD: ctx.state.settings.fxRates?.[ev.currency], issuedAt: ctx.today, dueDate: addDays(ctx.today, 7), status: 'sent', lateFeeApplied: 0 });
      extra += ` + returned-payment fee ${fee}`;
    }
    return { summary: `Payment ${p.amount} on ${inv?.number ?? ''} REVERSED (${reason})${extra}`, eventId };
  },
  WEATHER_PLAN_SET(ctx, { eventId, outdoor, subEventId, planA, planB, callHoursBefore }) {
    const ev = ctx.ev(eventId);
    if (outdoor) {
      assert(planB && planB.trim(), 'An outdoor function needs a Plan B location');
      assert(Number(callHoursBefore) >= 6, 'Make the weather call at least 6 hours before');
    }
    ev.contingency = { ...(ev.contingency || {}), outdoor: !!outdoor, subEventId: subEventId || null, planA: planA || '', planB: planB || '', callHoursBefore: Number(callHoursBefore) || RISK_DEFAULTS.weatherCallHours, decision: ev.contingency?.decision ?? null };
    return { summary: outdoor ? `Weather plan: A "${planA}" / B "${planB}", call ${ev.contingency.callHoursBefore}h before` : 'Weather plan removed (indoor event)', eventId };
  },
  WEATHER_CALL(ctx, { eventId, decision, note }) {
    const ev = ctx.ev(eventId);
    assert(ev.contingency?.outdoor, 'No outdoor function — nothing to decide');
    assert(['A', 'B'].includes(decision), 'Choose Plan A or Plan B');
    const c = ev.contingency;
    c.decision = decision;
    c.decidedAt = new Date().toISOString();
    c.decidedBy = ctx.user?.id;
    c.note = note || '';
    const where = decision === 'A' ? c.planA : c.planB;
    ev.decisions.unshift({ id: ctx.id('dec'), decision: `Weather call: Plan ${decision} — ${where}${note ? ` (${note})` : ''}`, decidedBy: ctx.user?.name, approvedAt: c.decidedAt, recordedBy: ctx.user?.id, reference: 'Weather call' });
    ctx.notify({ toRoles: ['planner', 'production', 'admin'], eventId, level: decision === 'B' ? 'warning' : 'success', text: `${ev.name}: weather call made — Plan ${decision} (${where}). Tell vendors and update signage.` });
    clientNotice(ev, `Weather call made: we go with Plan ${decision} — ${where}.`, decision === 'B' ? 'warning' : 'success');
    return { summary: `Weather call for ${ev.name}: Plan ${decision} (${where})`, eventId };
  },
  OVERTIME_APPROVE(ctx, { eventId, minutes, approverName }) {
    const ev = ctx.ev(eventId);
    const mins = Number(minutes);
    assert(mins >= 15 && mins <= 240, 'Overtime is booked in blocks of 15 minutes up to 4 hours');
    const allowed = overtimeApprovers(ctx.state, ev);
    assert(allowed.includes(approverName), `Overtime must be approved by an authorized client representative (${allowed.join(', ') || 'none on file'})`);
    const q = overtimeQuote(ctx.state, ev, mins);
    assert(q.total > 0, 'No overtime rates on file for the venue, vendors or crew');
    const payer = ev.payers.find((p) => !p.categories?.length || p.categories.includes('Fees')) ?? ev.payers[0];
    const inv = { id: ctx.id('inv'), number: `INV-${ctx.next('invoice')}`, eventId, kind: 'overtime', label: `Overtime ${mins} min (approved on site by ${approverName})`, payerId: payer?.id ?? null, amount: q.total, currency: ev.currency, fxRateToUSD: ctx.state.settings.fxRates?.[ev.currency], issuedAt: ctx.today, dueDate: addDays(ctx.today, 7), status: 'sent', lateFeeApplied: 0, lines: q.lines };
    ev.invoices.push(inv);
    (ev.overtime ??= []).push({ id: ctx.id('ot'), minutes: mins, approverName, at: new Date().toISOString(), by: ctx.user?.id, total: q.total, invoiceId: inv.id });
    ev.decisions.unshift({ id: ctx.id('dec'), decision: `Party extended by ${mins} min — ${q.total} ${ev.currency} (${inv.number})`, decidedBy: approverName, approvedAt: new Date().toISOString(), recordedBy: ctx.user?.id, reference: 'On-site overtime' });
    clientNotice(ev, `You extended the celebration by ${mins} minutes (approved by ${approverName}). Invoice ${inv.number} follows.`, 'info', 'money');
    return { summary: `Overtime ${mins} min approved on site by ${approverName} → ${inv.number} ${q.total} ${ev.currency}`, eventId };
  },
  CUSTODY_ADD(ctx, { eventId, item, owner, notes }) {
    const ev = ctx.ev(eventId);
    assert(item && item.trim(), 'Describe the item');
    (ev.custody ??= []).push({ id: ctx.id('cus'), item: item.trim(), owner: owner || '', notes: notes || '', status: 'expected', log: [] });
    return { summary: `Custody item added: ${item}`, eventId };
  },
  CUSTODY_UPDATE(ctx, { eventId, itemId, status, person }) {
    const ev = ctx.ev(eventId);
    const c = (ev.custody || []).find((x) => x.id === itemId);
    assert(c, 'Item not found');
    const flow = { expected: ['received'], received: ['returned'], returned: [] };
    assert(flow[c.status].includes(status), `Cannot go from ${c.status} to ${status}`);
    assert(person && person.trim(), status === 'returned' ? 'Who received the item back? (name)' : 'Who handed it over? (name)');
    c.status = status;
    c.log.push({ status, person: person.trim(), at: new Date().toISOString(), by: ctx.user?.id });
    if (status === 'returned') clientNotice(ev, `${c.item} handed back to ${person.trim()}.`, 'success');
    return { summary: `${c.item}: ${status === 'received' ? 'received from' : 'handed back to'} ${person.trim()}`, eventId };
  },
};
