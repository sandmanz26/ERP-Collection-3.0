// Derived selectors: everything computed from state (never stored) lives here.
import { calcProposal } from './pricing.js';
import { round2, sum, convert } from './money.js';
import { addDays, diffDays } from './dates.js';
import { shiftCost } from './staff.js';
import { contractFullySigned } from './contracts.js';
import { stageIndex } from './lifecycle.js';
import { decorSnapshot } from './decorApi.js';
import { workforceCost } from './workforce.js';

export function eventType(state, ev) {
  return state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
}

export function clientOf(state, ev) {
  return state.clients.find((c) => c.id === ev.clientId);
}

export function activeProposal(ev) {
  return ev.proposals.find((p) => p.status === 'accepted') ?? ev.proposals.find((p) => p.status === 'active') ?? null;
}

export function proposalTotals(state, ev, version) {
  const v = version ?? activeProposal(ev);
  if (!v) return null;
  const j = state.settings.jurisdictions.find((x) => x.id === v.jurisdictionId);
  const companyCountry = j && j.region !== 'US' ? state.settings.company.euVatCountry : state.settings.company.country;
  return calcProposal(v, { jurisdictions: state.settings.jurisdictions, client: clientOf(state, ev), companyCountry });
}

/** Live headcount: confirmed "yes" guests for the largest sub-event. */
export function headcount(ev) {
  const counts = {};
  let invited = 0;
  let pending = 0;
  let declined = 0;
  const guests = ev.households.flatMap((h) => h.guests);
  guests.forEach((g) => {
    const vals = Object.values(g.rsvp);
    if (vals.includes('yes')) Object.entries(g.rsvp).forEach(([k, v]) => v === 'yes' && (counts[k] = (counts[k] || 0) + 1));
    invited += 1;
    if (vals.length && vals.every((v) => v === 'pending')) pending += 1;
    if (vals.length && vals.every((v) => v === 'no')) declined += 1;
  });
  const max = Math.max(0, ...Object.values(counts));
  return { bySubEvent: counts, confirmed: max, invited, pending, declined, checkedIn: guests.filter((g) => g.checkedIn).length };
}

export function finalHeadcountDeadline(state, ev) {
  return ev.date ? addDays(ev.date, -state.settings.finalHeadcountDays) : null;
}

/** Guarantee warnings comparing live headcount vs vendor minimum guarantees & contracted guests. */
export function guaranteeWarnings(ev) {
  const hc = headcount(ev);
  if (!ev.households.length) return [];
  const live = ev.finalHeadcount ?? hc.confirmed + hc.pending; // projected
  const out = [];
  ev.vendorBookings.forEach((b) => {
    if (b.minGuarantee && live < b.minGuarantee)
      out.push({ level: 'warning', text: `Projected headcount ${live} is BELOW ${b.category} minimum guarantee of ${b.minGuarantee} — you pay for ${b.minGuarantee}.` });
    if (b.contractedGuests && live > b.contractedGuests)
      out.push({ level: 'danger', text: `Projected headcount ${live} EXCEEDS contracted ${b.contractedGuests} with ${b.category} — create a Change Order.` });
  });
  return out;
}

export function paidAmount(ev) {
  return sum(ev.payments, (p) => p.amount);
}

export function refundedAmount(ev) {
  return sum(ev.creditNotes.filter((c) => c.refund), (c) => c.amount);
}

export function invoiceBalance(ev, inv) {
  const paid = sum(ev.payments.filter((p) => p.invoiceId === inv.id), (p) => p.amount);
  return round2(inv.amount + (inv.lateFeeApplied || 0) - paid);
}

export function invoiceStatus(ev, inv, today) {
  if (inv.status === 'void') return 'void';
  const bal = invoiceBalance(ev, inv);
  if (bal <= 0.005) return 'paid';
  if (bal < inv.amount + (inv.lateFeeApplied || 0)) return inv.dueDate < today ? 'overdue' : 'partial';
  return inv.dueDate < today ? 'overdue' : 'sent';
}

export function decorCost(ev) {
  const db = decorSnapshot();
  return sum(ev.decorRequests, (r) => (db.items.find((i) => i.id === r.itemId)?.unitCost || 0) * r.qty);
}

/** Internal & registered-freelancer shifts (with OT rules) + outsourced/freelance positions from the staffing plan. */
export function crewCost(state, ev) {
  const shifts = sum(ev.shifts, (s) => {
    const st = state.staff.find((x) => x.id === s.staffId);
    return st ? shiftCost(s, st).cost : 0;
  });
  return round2(shifts + workforceCost(ev));
}

export function vendorCost(ev) {
  return sum(ev.vendorBookings.filter((b) => b.status !== 'cancelled' && b.model === 'pass_through'), (b) => b.cost);
}

/** Main financial summary for an event (in event currency). */
export function eventFinancials(state, ev) {
  const totals = proposalTotals(state, ev);
  const contractTotal = ev.contract?.total ?? totals?.total ?? 0;
  const approvedCOs = ev.changeOrders.filter((c) => c.status === 'approved');
  const coRevenue = sum(approvedCOs, (c) => c.costImpact);
  const coCost = sum(approvedCOs, (c) => c.costImpactCost);
  const revenueNet = round2((totals?.subtotal ?? 0) + coRevenue); // excl. tax
  const tax = round2((totals?.tax.taxAmount ?? 0) + sum(approvedCOs, (c) => c.taxImpact || 0));
  const vCost = vendorCost(ev);
  const dCost = decorCost(ev);
  const cCost = crewCost(state, ev);
  // internal cost estimate for non-vendor, non-decor items from proposal (planning labor etc.)
  const estCostFromProposal = totals?.cost ?? 0;
  const actualCost = round2(vCost + dCost + cCost + coCost);
  const commissions = sum(ev.vendorBookings.filter((b) => b.commissionAmount), (b) => b.commissionAmount);
  const damageCharges = sum(ev.invoices.filter((i) => i.kind === 'damage'), (i) => i.amount);
  const lateFees = sum(ev.invoices, (i) => i.lateFeeApplied || 0);
  const paid = paidAmount(ev);
  const refunds = refundedAmount(ev);
  const recognized = stageIndex(ev.stage) >= stageIndex('post_event') || ev.stage === 'cancelled_client';
  const deferred = recognized ? 0 : round2(paid - refunds);
  const profit = round2(revenueNet + commissions + damageCharges + lateFees - actualCost);
  return {
    contractTotal, revenueNet, tax, vendorCost: vCost, decorCost: dCost, crewCost: cCost, coCost, estCost: estCostFromProposal,
    actualCost, commissions, damageCharges, lateFees, paid, refunds, balance: round2(contractTotal + damageCharges + lateFees - paid + refunds),
    deferred, recognizedRevenue: recognized ? round2(paid - refunds) : 0, profit, marginPct: revenueNet ? round2((profit / revenueNet) * 100) : 0,
    gratuities: sum(ev.gratuities, (g) => g.amount),
  };
}

/** Budget by category: client budget vs proposal sell vs internal estimated cost vs actual cost. */
export function budgetByCategory(state, ev) {
  const totals = proposalTotals(state, ev);
  const rows = {};
  const r = (cat) => (rows[cat] ??= { category: cat, clientBudget: ev.clientBudget?.[cat] || 0, sell: 0, estCost: 0, actualCost: 0 });
  (totals?.lines ?? []).filter((l) => l.active).forEach((l) => {
    r(l.category).sell += l.amount;
    r(l.category).estCost += l.cost;
  });
  ev.changeOrders.filter((c) => c.status === 'approved').forEach((c) => c.lines.forEach((l) => { r(l.category).sell += l.amount; r(l.category).actualCost += l.cost; r(l.category).estCost += l.cost; }));
  ev.vendorBookings.filter((b) => b.status !== 'cancelled').forEach((b) => (r(b.category).actualCost += b.cost));
  const db = decorSnapshot();
  ev.decorRequests.forEach((d) => (r('Decor').actualCost += (db.items.find((i) => i.id === d.itemId)?.unitCost || 0) * d.qty));
  const crew = crewCost(state, ev);
  if (crew) r('Staffing').actualCost += crew;
  Object.keys(ev.clientBudget || {}).forEach((c) => r(c));
  return Object.values(rows).map((x) => ({
    ...x,
    sell: round2(x.sell), estCost: round2(x.estCost), actualCost: round2(x.actualCost),
    margin: round2(x.sell - x.actualCost),
    variance: round2(x.actualCost - x.estCost),
    overBudget: x.clientBudget > 0 && x.sell > x.clientBudget,
    overCost: x.actualCost > x.estCost * 1.0001 && x.estCost > 0,
  }));
}

export function closingChecklist(state, ev, today) {
  const items = [
    { key: 'vendorsPaid', label: 'All pass-through vendors paid', done: ev.vendorBookings.every((b) => b.model !== 'pass_through' || b.payments.every((p) => p.status === 'paid')) },
    { key: 'invoicesPaid', label: 'All client invoices settled', done: ev.invoices.every((i) => ['paid', 'void'].includes(invoiceStatus(ev, i, today))) && ev.paymentSchedule.every((p) => p.status === 'paid') },
    { key: 'venueDeposit', label: 'Venue security deposit returned', done: !!ev.closing.venueDepositReturned },
    { key: 'decorReturned', label: 'Decor returned & checked in Decor Inventory', done: !ev.decorRequests.length || !!ev.decorReturn },
    { key: 'damageBilled', label: 'Damage/loss charges billed (or none)', done: !ev.decorReturn || ev.decorReturn.totalCharge === 0 || !!ev.closing.damageBilled },
    { key: 'survey', label: 'Client satisfaction survey sent', done: !!ev.closing.surveySent },
    { key: 'vendorRatings', label: 'Internal vendor ratings submitted', done: !!ev.closing.vendorRatingsDone || !ev.vendorBookings.length },
  ];
  return items;
}

export function eventContext(state, ev, today) {
  return {
    today,
    contractSigned: contractFullySigned(ev.contract),
    closingOpen: closingChecklist(state, ev, today).filter((c) => !c.done).map((c) => c.label),
  };
}

/** Revenue leakage across all events. */
export function leakage(state, today) {
  const out = [];
  state.events.forEach((ev) => {
    ev.changeOrders.filter((c) => c.status === 'approved' && !c.invoiced).forEach((c) =>
      out.push({ type: 'Unbilled change order', eventId: ev.id, eventName: ev.name, ref: c.number, amount: round2(c.costImpact + (c.taxImpact || 0)), currency: ev.currency }));
    ev.invoices.filter((i) => invoiceStatus(ev, i, today) === 'overdue').forEach((i) =>
      out.push({ type: 'Overdue client payment', eventId: ev.id, eventName: ev.name, ref: i.number, amount: invoiceBalance(ev, i), currency: ev.currency, days: diffDays(i.dueDate, today) }));
    if (ev.decorReturn && ev.decorReturn.totalCharge > 0 && !ev.closing.damageBilled)
      out.push({ type: 'Unbilled decor damage/loss', eventId: ev.id, eventName: ev.name, ref: 'Decor return report', amount: ev.decorReturn.totalCharge, currency: ev.currency });
    if (ev.cancellation && ev.cancellation.balanceDue > 0 && !ev.invoices.some((i) => i.kind === 'cancellation'))
      out.push({ type: 'Unbilled cancellation fee', eventId: ev.id, eventName: ev.name, ref: 'Cancellation', amount: ev.cancellation.balanceDue, currency: ev.currency });
    ev.vendorBookings.filter((b) => b.commissionAmount && b.commissionStatus === 'pending' && stageIndex(ev.stage) >= stageIndex('post_event')).forEach((b) =>
      out.push({ type: 'Uncollected vendor commission', eventId: ev.id, eventName: ev.name, ref: state.vendors.find((v) => v.id === b.vendorId)?.name, amount: b.commissionAmount, currency: ev.currency }));
  });
  return out;
}

export function toUSD(state, amount, currency) {
  return convert(amount, currency, 'USD', state.settings.fxRates);
}

/** Vendor compliance status. */
export function vendorCompliance(v, today) {
  const issues = [];
  const coiDays = v.coiExpiry ? diffDays(today, v.coiExpiry) : null;
  if (coiDays === null) issues.push({ level: 'danger', text: 'No COI on file' });
  else if (coiDays < 0) issues.push({ level: 'danger', text: `COI expired ${-coiDays}d ago` });
  else if (coiDays <= 30) issues.push({ level: 'warning', text: `COI expires in ${coiDays}d` });
  (v.licenses || []).forEach((l) => {
    const d = diffDays(today, l.expiry);
    if (d < 0) issues.push({ level: 'danger', text: `${l.name} expired` });
    else if (d <= 30) issues.push({ level: 'warning', text: `${l.name} expires in ${d}d` });
  });
  if (v.country === 'US' && !v.w9) issues.push({ level: 'warning', text: 'W-9 missing' });
  return issues;
}

export function vendorScore(v) {
  if (!v.performance?.length) return v.rating;
  const avg = v.performance.reduce((a, p) => a + (p.onTime + p.quality) / 2, 0) / v.performance.length;
  return round2((v.rating + avg) / 2);
}

/** Who-pays-what: invoices grouped by payer. */
export function payerSummary(ev, today) {
  return ev.payers.map((p) => {
    const invs = ev.invoices.filter((i) => i.payerId === p.id);
    const billed = sum(invs, (i) => i.amount + (i.lateFeeApplied || 0));
    const paid = sum(ev.payments.filter((x) => invs.some((i) => i.id === x.invoiceId)), (x) => x.amount);
    return { ...p, billed, paid, outstanding: round2(billed - paid), overdue: invs.filter((i) => invoiceStatus(ev, i, today) === 'overdue').length };
  });
}
