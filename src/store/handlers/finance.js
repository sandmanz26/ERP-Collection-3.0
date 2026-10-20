// Finance handlers: invoices, payments, deposits/date lock, late fees, credit notes, gratuities, vendor payables, accounting sync.
import { addDays, fmtDate } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { invoiceBalance, eventFinancials } from '../../lib/derived.js';
import { assert, promoteHolds } from './common.js';

/** Creates an invoice from a payment schedule item (exchange rate locked at invoice time). */
export function createInvoiceForSchedule(ctx, ev, item) {
  const payer = ev.payers[0];
  const inv = {
    id: ctx.id('inv'),
    number: `INV-${ctx.next('invoice')}`,
    eventId: ev.id,
    kind: item.source === 'change_order' ? 'change_order' : item.source === 'postponement' ? 'fee' : 'installment',
    label: item.label,
    scheduleItemId: item.id,
    coId: item.coId ?? null,
    payerId: payer?.id ?? null,
    amount: item.amount,
    currency: ev.currency,
    fxRateToUSD: ctx.state.settings.fxRates[ev.currency],
    issuedAt: ctx.today,
    dueDate: item.dueDate < ctx.today ? ctx.today : item.dueDate,
    status: 'sent',
    lateFeeApplied: 0,
  };
  ev.invoices.push(inv);
  item.status = 'invoiced';
  item.invoiceId = inv.id;
  if (item.coId) {
    const co = ev.changeOrders.find((c) => c.id === item.coId);
    if (co) co.invoiced = true;
  }
  return inv;
}

function lockDateIfDeposit(ctx, ev, inv) {
  const item = ev.paymentSchedule.find((p) => p.id === inv.scheduleItemId);
  if (item?.isDeposit && ev.dateStatus !== 'locked') {
    ev.dateStatus = 'locked';
    ctx.state.holds.filter((h) => h.eventId === ev.id && h.status === 'active').forEach((h) => {
      h.status = 'converted';
      promoteHolds(ctx, h.date);
    });
    ctx.notify({ toRoles: ['planner', 'sales', 'admin'], eventId: ev.id, level: 'success', text: `Deposit received — ${ev.name} date ${fmtDate(ev.date)} is now LOCKED.` });
    return true;
  }
  return false;
}

export const financeHandlers = {
  INVOICE_FROM_SCHEDULE(ctx, { eventId, itemId }) {
    const ev = ctx.ev(eventId);
    const item = ev.paymentSchedule.find((p) => p.id === itemId);
    assert(item.status === 'scheduled', 'Already invoiced');
    const inv = createInvoiceForSchedule(ctx, ev, item);
    return { summary: `Invoice ${inv.number} issued for "${item.label}" (${inv.amount} ${inv.currency}, FX locked ${inv.fxRateToUSD})`, eventId };
  },
  INVOICE_SET_PAYER(ctx, { eventId, invoiceId, payerId }) {
    const ev = ctx.ev(eventId);
    const inv = ev.invoices.find((i) => i.id === invoiceId);
    inv.payerId = payerId;
    return { summary: `Invoice ${inv.number} assigned to payer ${ev.payers.find((p) => p.id === payerId)?.name}`, eventId };
  },
  /** Record a payment (client portal checkout via mock Stripe, or manual by finance). No card data stored. */
  PAYMENT_RECORD(ctx, { eventId, invoiceId, amount, method }) {
    const ev = ctx.ev(eventId);
    const inv = ev.invoices.find((i) => i.id === invoiceId);
    const bal = invoiceBalance(ev, inv);
    const amt = round2(Math.min(Number(amount), bal));
    assert(amt > 0, 'Nothing to pay');
    ev.payments.push({ id: ctx.id('pmt'), invoiceId, eventId, amount: amt, method, at: new Date().toISOString(), ref: `pi_mock_${Math.random().toString(36).slice(2, 12)}`, payerId: inv.payerId, by: ctx.user.id });
    let extra = '';
    if (round2(bal - amt) <= 0) {
      inv.status = 'paid';
      const item = ev.paymentSchedule.find((p) => p.id === inv.scheduleItemId);
      if (item) item.status = 'paid';
      if (lockDateIfDeposit(ctx, ev, inv)) extra = ' — DEPOSIT received, event date LOCKED';
    } else inv.status = 'partial';
    return { summary: `Payment ${amt} ${inv.currency} via ${method.toUpperCase()} on ${inv.number}${extra} (recorded as deferred revenue until event occurs)`, eventId };
  },
  LATE_FEE_APPLY(ctx, { eventId, invoiceId }) {
    const ev = ctx.ev(eventId);
    const inv = ev.invoices.find((i) => i.id === invoiceId);
    const pctFee = ev.contract?.lateFeePct ?? ctx.state.settings.lateFeePct;
    const fee = round2((inv.amount * pctFee) / 100);
    inv.lateFeeApplied = round2((inv.lateFeeApplied || 0) + fee);
    return { summary: `Late fee ${fee} ${inv.currency} (${pctFee}%) applied to ${inv.number} per contract`, eventId };
  },
  CREDIT_NOTE_CREATE(ctx, { eventId, amount, reason, refund }) {
    const ev = ctx.ev(eventId);
    const cn = { id: ctx.id('cn'), number: `CN-${ctx.next('creditNote')}`, amount: round2(amount), reason, refund: !!refund, at: new Date().toISOString(), status: 'issued' };
    ev.creditNotes.push(cn);
    return { summary: `${refund ? 'Refund' : 'Credit note'} ${cn.number} ${cn.amount} ${ev.currency} — ${reason}`, eventId };
  },
  GRATUITY_ADD(ctx, { eventId, to, amount, paidBy }) {
    const ev = ctx.ev(eventId);
    ev.gratuities.push({ id: ctx.id('tip'), to, amount: round2(amount), paidBy, at: new Date().toISOString() });
    return { summary: `Gratuity ${amount} ${ev.currency} to ${to} recorded (liability, not EO revenue)`, eventId };
  },
  VENDOR_PAYMENT_PAID(ctx, { eventId, bookingId, paymentId, proofRef }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    const p = b.payments.find((x) => x.id === paymentId);
    p.status = 'paid';
    p.paidAt = new Date().toISOString();
    p.proofRef = proofRef || `ACH-${Math.floor(Math.random() * 90000) + 10000}`;
    const v = ctx.state.vendors.find((x) => x.id === b.vendorId);
    return { summary: `Vendor payment "${p.label}" ${p.amount} to ${v.name} marked PAID (${p.proofRef})`, eventId };
  },
  VENDOR_PAYMENT_ADD(ctx, { eventId, bookingId, label, amount, dueDate }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    b.payments.push({ id: ctx.id('vp'), label, amount: round2(amount), dueDate, status: 'scheduled' });
    return { summary: `Vendor payable "${label}" ${amount} due ${fmtDate(dueDate)} added`, eventId };
  },
  COMMISSION_STATUS(ctx, { eventId, bookingId, status }) {
    const ev = ctx.ev(eventId);
    const b = ev.vendorBookings.find((x) => x.id === bookingId);
    b.commissionStatus = status;
    return { summary: `Commission from ${ctx.state.vendors.find((v) => v.id === b.vendorId)?.name} → ${status}`, eventId };
  },
  /** Mock export to QuickBooks / Xero: builds journal lines using the account mapping. */
  ACCOUNTING_SYNC(ctx, { eventId, provider }) {
    const ev = ctx.ev(eventId);
    const f = eventFinancials(ctx.state, ev);
    const map = (k) => ctx.state.settings.accountMapping.find((a) => a.key === k)?.[provider];
    const journal = [
      { account: map(f.deferred > 0 ? 'deferred_revenue' : 'revenue_services'), credit: f.deferred > 0 ? f.deferred : f.recognizedRevenue },
      { account: map('sales_tax'), credit: f.tax },
      { account: map('cogs_vendor'), debit: f.vendorCost + f.decorCost },
      { account: map('cogs_crew'), debit: f.crewCost },
      { account: map('gratuity_liability'), credit: f.gratuities },
      { account: map('commission_income'), credit: f.commissions },
    ].filter((j) => (j.credit || j.debit));
    ev.accountingSync.unshift({ id: ctx.id('sync'), provider, at: new Date().toISOString(), journal, by: ctx.user.id });
    return { summary: `Synced ${ev.name} to ${provider === 'xero' ? 'Xero' : 'QuickBooks'} (${journal.length} journal lines, mock)`, eventId };
  },
  RECOGNIZE_REVENUE(ctx, { eventId }) {
    const ev = ctx.ev(eventId);
    const f = eventFinancials(ctx.state, ev);
    return { summary: `Revenue recognition check for ${ev.name}: recognized ${f.recognizedRevenue}, deferred ${f.deferred}`, eventId };
  },
  INVOICE_ADHOC(ctx, { eventId, label, amount, kind, payerId, dueDays = 14 }) {
    const ev = ctx.ev(eventId);
    const inv = { id: ctx.id('inv'), number: `INV-${ctx.next('invoice')}`, eventId, kind: kind || 'adhoc', label, payerId: payerId || ev.payers[0]?.id || null, amount: round2(amount), currency: ev.currency, fxRateToUSD: ctx.state.settings.fxRates[ev.currency], issuedAt: ctx.today, dueDate: addDays(ctx.today, dueDays), status: 'sent', lateFeeApplied: 0 };
    ev.invoices.push(inv);
    return { summary: `Invoice ${inv.number} "${label}" ${inv.amount} ${inv.currency} issued`, eventId };
  },
};
