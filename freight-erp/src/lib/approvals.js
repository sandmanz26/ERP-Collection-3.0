// Configurable human-in-the-loop approval steps.

export const APPROVAL_KINDS = {
  rfq: 'RFQ extraction review',
  quote: 'Quotation approval',
  booking: 'Booking push to CargoWise',
  document: 'Document mismatch resolution',
  arInvoice: 'AR invoice posting',
  apInvoice: 'AP variance approval',
  notification: 'Customer status update',
};

export const CONDITION_TYPES = {
  always: { label: 'Always', unit: null },
  marginBelow: { label: 'Margin below (%)', unit: '%' },
  valueAbove: { label: 'Value above', unit: 'currency' },
  varianceAbove: { label: 'Variance above (%)', unit: '%' },
  newCustomer: { label: 'Customer tier is C (new)', unit: null },
  hazardous: { label: 'Cargo is dangerous goods', unit: null },
};

export function conditionMet(cond, ctx) {
  switch (cond?.type || 'always') {
    case 'always': return true;
    case 'marginBelow': return ctx.marginPct != null && ctx.marginPct < cond.value;
    case 'valueAbove': return ctx.value != null && ctx.value > cond.value;
    case 'varianceAbove': return ctx.variancePct != null && Math.abs(ctx.variancePct) > cond.value;
    case 'newCustomer': return ctx.customerTier === 'C';
    case 'hazardous': return !!ctx.hazardous;
    default: return false;
  }
}

export function describeCondition(cond, currency = '') {
  const t = CONDITION_TYPES[cond?.type || 'always'];
  if (!t) return '—';
  if (!t.unit) return t.label;
  return `${t.label.replace(/\s*\(.*\)/, '')} ${t.unit === '%' ? `${cond.value}%` : `${currency} ${Number(cond.value).toLocaleString()}`}`;
}

/** Build the pending approval chain for an entity from the tenant workflow definition. */
export function buildApprovalChain(steps, ctx) {
  return (steps || [])
    .filter((s) => s.active !== false && conditionMet(s.condition, ctx))
    .map((s) => ({ stepId: s.id, name: s.name, role: s.role, status: 'pending', by: null, at: null, comment: '' }));
}

export const canApprove = (user, step) => !!user && (user.role === 'admin' || user.role === step.role);

/** Index of the step awaiting a decision (approvals are sequential). */
export const currentStepIndex = (chain) => (chain || []).findIndex((s) => s.status === 'pending');

export function chainStatus(chain) {
  if (!chain || chain.length === 0) return 'approved';
  if (chain.some((s) => s.status === 'rejected')) return 'rejected';
  if (chain.every((s) => s.status === 'approved')) return 'approved';
  return 'pending';
}
