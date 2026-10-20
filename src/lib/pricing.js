// Proposal pricing & tax engine (pure functions).
import { round2, sum } from './money.js';

/**
 * Line item pricing types:
 *  - fixed:      qty * unitPrice
 *  - per_guest:  guestCount * unitPrice   (cost also per guest)
 *  - percentage: pct% of the subtotal of selected non-percentage lines (service charge / management fee)
 */
export function lineIsActive(line) {
  return !line.optional || line.selected;
}

export function calcLines(lines, guestCount) {
  const base = lines.filter((l) => lineIsActive(l) && l.pricing !== 'percentage');
  const baseComputed = base.map((l) => computeBaseLine(l, guestCount));
  const baseSubtotal = sum(baseComputed, (l) => l.amount);
  const baseCost = sum(baseComputed, (l) => l.cost);
  return lines.map((l) => {
    if (l.pricing === 'percentage') {
      const amount = round2((baseSubtotal * (Number(l.pct) || 0)) / 100);
      const cost = round2((baseCost * (Number(l.costPct) || 0)) / 100);
      return { ...l, qtyEff: 1, amount, cost, margin: round2(amount - cost), active: lineIsActive(l) };
    }
    return { ...computeBaseLine(l, guestCount), active: lineIsActive(l) };
  });
}

function computeBaseLine(l, guestCount) {
  const qtyEff = l.pricing === 'per_guest' ? Number(guestCount) || 0 : Number(l.qty) || 0;
  const amount = round2(qtyEff * (Number(l.unitPrice) || 0));
  const cost = round2(qtyEff * (Number(l.unitCost) || 0));
  return { ...l, qtyEff, amount, cost, margin: round2(amount - cost) };
}

/**
 * Tax rules.
 * US: sales tax rate per state+city; jurisdiction.taxServiceFees decides whether percentage/service lines are taxed.
 * EU/UK/CH: VAT. Reverse charge applies when the client is a business with a VAT id in a *different* country
 * than the EO company (B2B cross-border) -> 0% with legal note.
 */
export function calcTax({ lines, jurisdiction, client, companyCountry }) {
  if (!jurisdiction) return { taxAmount: 0, taxableBase: 0, note: 'No jurisdiction', reverseCharge: false };
  const active = lines.filter((l) => l.active);
  const taxable = active.filter((l) => {
    if (l.taxable === false) return false;
    const isServiceFee = l.pricing === 'percentage' || l.isServiceFee;
    if (isServiceFee && jurisdiction.region === 'US' && !jurisdiction.taxServiceFees) return false;
    return true;
  });
  const taxableBase = sum(taxable, (l) => l.amount);
  if (jurisdiction.region !== 'US') {
    const reverseCharge =
      client?.type === 'company' && !!client?.vatId && client?.country && client.country !== companyCountry;
    if (reverseCharge) {
      return {
        taxAmount: 0,
        taxableBase,
        reverseCharge: true,
        label: `VAT 0% (reverse charge)`,
        note: 'Reverse charge — VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC).',
      };
    }
    return {
      taxAmount: round2((taxableBase * jurisdiction.rate) / 100),
      taxableBase,
      reverseCharge: false,
      label: `VAT ${jurisdiction.rate}% (${jurisdiction.name})`,
      note: '',
    };
  }
  return {
    taxAmount: round2((taxableBase * jurisdiction.rate) / 100),
    taxableBase,
    reverseCharge: false,
    label: `Sales tax ${jurisdiction.rate}% (${jurisdiction.name})`,
    note: jurisdiction.taxServiceFees ? 'Service charges are taxable in this jurisdiction.' : 'Service charges exempt from sales tax in this jurisdiction.',
  };
}

export function calcProposal(version, { jurisdictions, client, companyCountry }) {
  if (!version) return null;
  const lines = calcLines(version.lines, version.guestCount);
  const active = lines.filter((l) => l.active);
  const subtotal = sum(active, (l) => l.amount);
  const cost = sum(active, (l) => l.cost);
  const jurisdiction = jurisdictions.find((j) => j.id === version.jurisdictionId);
  const tax = calcTax({ lines, jurisdiction, client, companyCountry });
  const total = round2(subtotal + tax.taxAmount);
  const optionalAvailable = sum(lines.filter((l) => l.optional && !l.selected), (l) => l.amount);
  return {
    lines,
    subtotal,
    cost,
    margin: round2(subtotal - cost),
    marginPct: subtotal ? round2(((subtotal - cost) / subtotal) * 100) : 0,
    tax,
    total,
    optionalAvailable,
  };
}

export function proposalExpired(version, today) {
  return !!version?.validUntil && version.validUntil < today && version.status !== 'accepted';
}
