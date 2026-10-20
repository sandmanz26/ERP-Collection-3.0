// Contract helpers: payment schedule generation, cancellation fees, template rendering.
import { addDays, diffDays } from './dates.js';
import { round2 } from './money.js';

/**
 * Payment schedule template: [{ label, pct, due: 'signing' | { daysBefore: n } }]
 * Last installment absorbs rounding differences.
 */
export function generatePaymentSchedule({ total, eventDate, signDate, template, idFn }) {
  let allocated = 0;
  return template.installments.map((inst, idx) => {
    const isLast = idx === template.installments.length - 1;
    const amount = isLast ? round2(total - allocated) : round2((total * inst.pct) / 100);
    allocated = round2(allocated + amount);
    let dueDate = inst.due === 'signing' ? signDate : addDays(eventDate, -inst.due.daysBefore);
    if (dueDate < signDate) dueDate = signDate; // late booking: due immediately
    return {
      id: idFn('pay'),
      label: inst.label,
      pct: inst.pct,
      dueDate,
      amount,
      status: 'scheduled',
      invoiceId: null,
      source: 'contract',
      isDeposit: idx === 0,
    };
  });
}

/** Cancellation policy table: rows [{ minDaysBefore, forfeitPct }] sorted desc by minDaysBefore. */
export function cancellationForfeitPct(policy, daysBefore) {
  const rows = [...policy.rows].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  for (const r of rows) {
    if (daysBefore >= r.minDaysBefore) return r.forfeitPct;
  }
  return rows.length ? rows[rows.length - 1].forfeitPct : 100;
}

export function calcCancellation({ policy, contractTotal, paid, eventDate, cancelDate, byEO = false }) {
  const daysBefore = diffDays(cancelDate, eventDate);
  if (byEO) {
    // EO cancels: full refund of everything paid.
    return { daysBefore, forfeitPct: 0, fee: 0, refund: round2(paid), balanceDue: 0 };
  }
  const forfeitPct = cancellationForfeitPct(policy, daysBefore);
  const fee = round2((contractTotal * forfeitPct) / 100);
  const refund = round2(Math.max(0, paid - fee));
  const balanceDue = round2(Math.max(0, fee - paid));
  return { daysBefore, forfeitPct, fee, refund, balanceDue };
}

export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : `{{${k}}}`));
}

export function contractFullySigned(contract) {
  return !!contract && contract.signers.length > 0 && contract.signers.every((s) => s.signedAt);
}
