// AP carrier invoice reconciliation against expected costs, and AR invoice building.
import { CHARGE_CODES } from './reference.js';
import { sum } from './pricing.js';

/**
 * Compare a carrier (AP) invoice with the expected costs for that carrier on the shipment.
 * @returns {{rows, expectedTotal, invoicedTotal, variance, variancePct, withinTolerance}}
 */
export function reconcileAp(apLines, expectedLines, tolerance = { pct: 2, abs: 50 }) {
  const codes = [...new Set([...expectedLines.map((l) => l.code), ...apLines.map((l) => l.code)])];
  const rows = codes.map((code) => {
    const expected = sum(expectedLines.filter((l) => l.code === code), 'amount');
    const invoiced = sum(apLines.filter((l) => l.code === code), 'amount');
    const diff = Math.round((invoiced - expected) * 100) / 100;
    const pct = expected ? Math.round((diff / expected) * 1000) / 10 : null;
    let status = 'ok';
    if (!expected && invoiced) status = 'unexpected';
    else if (expected && !invoiced) status = 'missing';
    else if (!withinTol(diff, expected, tolerance)) status = diff > 0 ? 'over' : 'under';
    const desc = apLines.find((l) => l.code === code)?.desc || expectedLines.find((l) => l.code === code)?.desc || CHARGE_CODES[code] || code;
    return { code, desc, expected, invoiced, diff, pct, status };
  });
  const expectedTotal = sum(expectedLines, 'amount');
  const invoicedTotal = sum(apLines, 'amount');
  const variance = Math.round((invoicedTotal - expectedTotal) * 100) / 100;
  const variancePct = expectedTotal ? Math.round((variance / expectedTotal) * 1000) / 10 : 0;
  // Every line must be within tolerance too: a large overcharge must not hide behind an undercharge elsewhere.
  const withinTolerance = withinTol(variance, expectedTotal, tolerance) && !rows.some((r) => ['over', 'unexpected'].includes(r.status) && Math.abs(r.diff) > tolerance.abs);
  return { rows, expectedTotal, invoicedTotal, variance, variancePct, withinTolerance };
}

const withinTol = (diff, base, tol) => Math.abs(diff) <= tol.abs || (base ? (Math.abs(diff) / base) * 100 <= tol.pct : false);

/**
 * AR invoice = quoted sell lines + rebillable extra costs approved on AP invoices (with markup).
 */
export function buildArLines(quoteLines, approvedExtraCosts = [], rebillMarkupPct = 10) {
  const lines = quoteLines.map((l) => ({ code: l.code, desc: l.desc, amount: l.sell, source: 'quote' }));
  for (const c of approvedExtraCosts) {
    lines.push({ code: c.code, desc: `${c.desc} (rebilled)`, amount: Math.round(c.amount * (1 + rebillMarkupPct / 100) * 100) / 100, source: 'actual' });
  }
  return lines;
}
