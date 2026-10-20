// Event lifecycle definition + transition guards.
export const STAGES = [
  { id: 'lead', label: 'Lead', group: 'sales' },
  { id: 'qualified', label: 'Qualified', group: 'sales' },
  { id: 'proposal_sent', label: 'Proposal Sent', group: 'sales' },
  { id: 'negotiation', label: 'Negotiation', group: 'sales' },
  { id: 'booked', label: 'Contract Signed (Booked)', group: 'sales' },
  { id: 'planning', label: 'Planning', group: 'ops' },
  { id: 'details_locked', label: 'Final Details Locked', group: 'ops' },
  { id: 'pre_event', label: 'Pre-Event', group: 'ops' },
  { id: 'event_day', label: 'Event Day', group: 'ops' },
  { id: 'post_event', label: 'Post-Event', group: 'close' },
  { id: 'financial_close', label: 'Financial Close', group: 'close' },
  { id: 'archived', label: 'Archived', group: 'close' },
];

export const EXIT_STAGES = [
  { id: 'lost', label: 'Lost' },
  { id: 'cancelled_client', label: 'Cancelled by Client' },
  { id: 'cancelled_eo', label: 'Cancelled by EO' },
];

export const ALL_STAGES = [...STAGES, ...EXIT_STAGES];
export const SALES_STAGES = ['lead', 'qualified', 'proposal_sent', 'negotiation'];
export const ACTIVE_BOOKED_STAGES = ['booked', 'planning', 'details_locked', 'pre_event', 'event_day'];

export function stageLabel(id) {
  return ALL_STAGES.find((s) => s.id === id)?.label ?? id;
}

export function stageIndex(id) {
  return STAGES.findIndex((s) => s.id === id);
}

export function isExit(stage) {
  return EXIT_STAGES.some((s) => s.id === stage);
}

export function isBookedOrLater(stage) {
  const i = stageIndex(stage);
  return i >= stageIndex('booked');
}

/**
 * Returns a list of unmet requirements (strings) to move `ev` into `to`. Empty array = allowed.
 * `ctx` provides derived helpers so this module stays pure.
 */
export function transitionBlockers(ev, to, ctx) {
  const blockers = [];
  const activeProposal = ev.proposals.find((p) => p.status === 'active' || p.status === 'accepted');
  switch (to) {
    case 'qualified':
      if (!ev.date) blockers.push('Event date is required');
      if (!ev.guestCount) blockers.push('Estimated guest count is required');
      if (!ev.budget) blockers.push('Budget is required');
      break;
    case 'proposal_sent':
      if (!activeProposal) blockers.push('An active proposal version is required');
      break;
    case 'negotiation':
      if (!activeProposal) blockers.push('An active proposal version is required');
      break;
    case 'booked':
      if (!ctx.contractSigned) blockers.push('Contract must be signed by all signers');
      break;
    case 'planning':
      if (!ctx.contractSigned) blockers.push('Contract must be signed');
      if (ev.dateStatus !== 'locked') blockers.push('Deposit must be received to lock the date (date is only on HOLD)');
      break;
    case 'details_locked':
      if (!ev.finalHeadcount) blockers.push('Final headcount must be confirmed');
      break;
    case 'post_event':
      if (ev.date > ctx.today) blockers.push('Event date has not passed yet');
      break;
    case 'financial_close':
      if (ctx.closingOpen?.length) blockers.push(...ctx.closingOpen.map((c) => `Closing checklist: ${c}`));
      break;
    default:
      break;
  }
  return blockers;
}

export function nextStage(stage) {
  const i = stageIndex(stage);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1].id;
}
