// "Drive the event": what to do next, how ready each area is, the key dates, and the stage history.
// Pure functions over state — used by the event Overview (cockpit), dashboard priorities and portals.
import { addDays, diffDays, fmtDate } from './dates.js';
import { fmtMoney } from './money.js';
import { STAGES, stageIndex, stageLabel, isExit, transitionBlockers, nextStage } from './lifecycle.js';
import { contractFullySigned } from './contracts.js';
import { proposalExpired } from './pricing.js';
import { invoiceStatus, invoiceBalance, vendorCompliance, headcount, closingChecklist, eventContext, eventFinancials } from './derived.js';
import { staffingSummary } from './workforce.js';
import { productionIssues } from './timeline.js';
import { vendorGaps, vendorRefundsDue, finalPaymentRisk, weatherCall, leadSla, lateVendors } from './risk.js';
import { obligationIssues } from './obligations.js';

export const STAGE_INFO = {
  lead: 'A new inquiry. Qualify it: date, guest count, budget and event type.',
  qualified: 'A real opportunity. Hold the date and build a proposal.',
  proposal_sent: 'The client is reviewing the active proposal and optional extras.',
  negotiation: 'Terms are being agreed. Once accepted, generate and send the contract.',
  booked: 'Contract signed by every party. The date stays on HOLD until the deposit is paid.',
  planning: 'Deposit received and date locked. Vendors, guests, design and crew are planned.',
  details_locked: 'Final headcount confirmed. Changes from here need a Change Order.',
  pre_event: 'Final run of show, call sheet, crew confirmations and load-in logistics.',
  event_day: 'Live delivery on site: run of show, crew check-in and incidents.',
  post_event: 'Close-out: vendor payments, decor returns, damage billing, survey and ratings.',
  financial_close: 'Every invoice settled and every vendor paid. Ready to archive.',
  archived: 'Read-only record of a completed event.',
  lost: 'The inquiry did not convert.',
  cancelled_client: 'Cancelled by the client; the cancellation policy was applied.',
  cancelled_eo: 'Cancelled by the company; everything paid was refunded.',
};

/** Best-known date each stage was entered: recorded history first, otherwise inferred from the record. */
export function stageDates(ev) {
  const out = {};
  (ev.stageHistory || []).forEach((h) => { if (!out[h.stage]) out[h.stage] = h.at.slice(0, 10); });
  const infer = {
    lead: ev.createdAt?.slice(0, 10),
    proposal_sent: ev.proposals.find((p) => p.sentAt || p.status !== 'draft')?.createdAt?.slice(0, 10),
    negotiation: ev.proposals.find((p) => p.acceptedAt)?.acceptedAt?.slice(0, 10),
    booked: ev.contract?.signedAt?.slice(0, 10),
    planning: ev.payments.find((p) => ev.paymentSchedule.find((s) => s.isDeposit && s.invoiceId === p.invoiceId))?.at.slice(0, 10),
  };
  const idx = stageIndex(ev.stage);
  STAGES.forEach((s, i) => { if (!out[s.id] && i <= idx && infer[s.id]) out[s.id] = infer[s.id]; });
  return out;
}

export function stepperSteps(state, ev, today) {
  const dates = stageDates(ev);
  const idx = isExit(ev.stage) ? stageIndex(ev.prevStage ?? 'lead') : stageIndex(ev.stage);
  const steps = STAGES.map((s, i) => ({
    id: s.id,
    label: s.label.replace(' (Booked)', ''),
    status: i < idx ? 'done' : i === idx ? (isExit(ev.stage) || ev.stage === 'archived' ? 'done' : 'current') : 'todo',
    date: dates[s.id] ?? null,
  }));
  if (isExit(ev.stage)) steps.splice(idx + 1, steps.length, { id: ev.stage, label: stageLabel(ev.stage), status: 'exit', date: (ev.stageHistory || []).find((h) => h.stage === ev.stage)?.at.slice(0, 10) ?? ev.cancellation?.at?.slice(0, 10) ?? null });
  return steps;
}

export function stageRequirements(state, ev, stageId, today) {
  return transitionBlockers(ev, stageId, eventContext(state, ev, today));
}

const A = (severity, icon, title, detail, tab, cta, anchor) => ({ severity, icon, title, detail, tab, cta: cta ?? 'Open', anchor });
const SEV = { danger: 0, warning: 1, info: 2 };

/** Ordered next actions for an event, each pointing at the tab where it gets done. */
export function nextActions(state, ev, today) {
  const out = [];
  if (['archived', 'lost', 'cancelled_client', 'cancelled_eo'].includes(ev.stage)) return out;
  const cur = (n) => fmtMoney(n, ev.currency, { whole: true });
  const days = ev.date ? diffDays(today, ev.date) : null;
  const sales = stageIndex(ev.stage) < stageIndex('booked');
  const hold = state.holds.find((h) => h.eventId === ev.id && h.status === 'active');
  const prop = ev.proposals.find((p) => p.status === 'accepted') ?? ev.proposals.find((p) => p.status === 'active') ?? ev.proposals.at(-1);

  if (sales) {
    if (!ev.date) out.push(A('warning', 'calendar', 'Set the event date', 'Needed to check availability and hold the date.', 'overview', 'Edit details'));
    else if (!hold && ev.dateStatus !== 'locked') out.push(A('warning', 'hourglass', 'Hold the date', `${fmtDate(ev.date)} is not held. Holds expire after ${state.settings.holdExpiryDays} days.`, 'overview', 'Place hold'));
    if (hold && diffDays(today, hold.expiresAt) <= 2) out.push(A('danger', 'hourglass', `Hold #${hold.priority} expires ${fmtDate(hold.expiresAt)}`, 'Extend it or move the client to contract.', 'overview', 'Manage hold'));
    if (!prop) out.push(A('warning', 'file', 'Build the proposal', 'Start from the event-type template and adjust.', 'proposal', 'Build proposal'));
    else if (prop.status === 'draft') out.push(A('warning', 'mail', `Send proposal v${prop.version}`, 'The client can review, pick extras and accept online.', 'proposal', 'Review & send'));
    else if (prop.status === 'active' && proposalExpired(prop, today)) out.push(A('danger', 'alert', `Proposal v${prop.version} expired`, 'Prices are no longer guaranteed. Issue a new version.', 'proposal', 'New version'));
    else if (prop.status === 'active') out.push(A('info', 'clock', `Waiting for the client on proposal v${prop.version}`, `Valid until ${fmtDate(prop.validUntil)}.`, 'proposal', 'View proposal'));
    if (prop?.status === 'accepted' && !ev.contract) out.push(A('warning', 'file', 'Generate the contract', 'Proposal accepted. Turn it into a contract with payment schedule.', 'contract', 'Generate contract'));
  }
  if (ev.contract && !ev.contract.immutable) {
    const pending = ev.contract.signers.filter((s) => !s.signedAt);
    out.push(ev.contract.status === 'draft'
      ? A('warning', 'mail', 'Send the contract for signature', `${ev.contract.signers.length} signer(s).`, 'contract', 'Send contract')
      : A('info', 'edit', `Waiting on ${pending.length} signature(s)`, pending.map((s) => s.name).join(', '), 'contract', 'View contract'));
  }
  if (ev.contract?.immutable && ev.dateStatus !== 'locked') {
    const dep = ev.invoices.find((i) => ev.paymentSchedule.find((s) => s.isDeposit && s.id === i.scheduleItemId));
    out.push(A('danger', 'lock', 'Collect the deposit to lock the date', dep ? `${dep.number}: ${cur(invoiceBalance(ev, dep))} outstanding. Until it is paid the date is only on hold.` : 'Invoice the deposit.', 'finance', 'Open invoices'));
  }
  ev.invoices.filter((i) => invoiceStatus(ev, i, today) === 'overdue').forEach((i) => out.push(A('danger', 'money', `${i.number} is overdue`, `${cur(invoiceBalance(ev, i))} due since ${fmtDate(i.dueDate)}. Late fee per contract can be applied.`, 'finance', 'Chase payment')));
  ev.changeOrders.filter((c) => c.status === 'sent').forEach((c) => out.push(c.isException && !c.specialApproval
    ? A('warning', 'alert', `${c.number} needs exception approval`, `${c.title} changes guest count after the final headcount deadline.`, 'co', 'Review')
    : A('info', 'edit', `${c.number} awaiting client approval`, c.title, 'co', 'View')));
  ev.changeOrders.filter((c) => c.status === 'approved' && !c.invoiced).forEach((c) => out.push(A('warning', 'money', `${c.number} approved but not invoiced`, `${cur(c.costImpact + (c.taxImpact || 0))} at risk of leakage.`, 'finance', 'Invoice now')));

  if (!sales && stageIndex(ev.stage) <= stageIndex('event_day')) {
    const unconfirmed = ev.vendorBookings.filter((b) => b.status === 'requested');
    if (unconfirmed.length) out.push(A(days !== null && days <= 30 ? 'danger' : 'warning', 'store', `${unconfirmed.length} vendor booking(s) not confirmed`, unconfirmed.map((b) => state.vendors.find((v) => v.id === b.vendorId)?.name).join(', '), 'vendors', 'Open vendors'));
    ev.vendorBookings.filter((b) => b.status !== 'cancelled').forEach((b) => {
      const v = state.vendors.find((x) => x.id === b.vendorId);
      const bad = vendorCompliance(v, today).filter((i) => i.level === 'danger');
      if (bad.length) out.push(A('danger', 'shield', `${v.name}: ${bad.map((i) => i.text).join(', ')}`, 'The booking cannot be confirmed until compliance is fixed.', 'vendors', 'Open vendors'));
    });
    const s = staffingSummary(ev);
    if (s.open > 0) out.push(A(days !== null && days <= 21 ? 'danger' : 'warning', 'hardhat', `${s.open} of ${s.required} crew slots not confirmed`, 'Assign staff or chase the agencies for their rosters.', 'people', 'Staff the event'));
    const conflicts = productionIssues(state, ev).filter((i) => i.level === 'danger' && i.kind !== 'staffing');
    if (conflicts.length) out.push(A('danger', 'clock', `${conflicts.length} production conflict(s)`, conflicts[0].text, 'timeline', 'Fix on timeline'));
    const overdueTasks = ev.tasks.filter((t) => t.status !== 'done' && t.dueDate < today);
    if (overdueTasks.length) out.push(A('warning', 'checkSquare', `${overdueTasks.length} overdue task(s)`, overdueTasks.slice(0, 3).map((t) => t.title).join(', '), 'planning', 'Open tasks'));
    if (ev.households.length) {
      const hc = headcount(ev);
      const rsvpDeadline = addDays(ev.date, -state.settings.rsvpDeadlineDays);
      if (hc.pending > 0 && today >= addDays(rsvpDeadline, -21)) out.push(A('info', 'users', `${hc.pending} guest(s) have not replied`, `RSVP closes ${fmtDate(rsvpDeadline)}.`, 'guests', 'Open guests'));
      const hcDeadline = addDays(ev.date, -state.settings.finalHeadcountDays);
      if (!ev.finalHeadcount && today >= addDays(hcDeadline, -10)) out.push(A(today > hcDeadline ? 'danger' : 'warning', 'users', 'Confirm the final headcount', `Due ${fmtDate(hcDeadline)} for catering and venue.`, 'guests', 'Set headcount'));
    }
    if (ev.ros.status === 'draft' && days !== null && days <= 21) out.push(A('warning', 'list', 'Share the run of show with vendors', 'It is still a draft.', 'ros', 'Open run of show'));
  }
  out.push(...riskActions(state, ev, today, cur));
  if (ev.stage === 'post_event' || ev.stage === 'financial_close') {
    closingChecklist(state, ev, today).filter((c) => !c.done).forEach((c) => out.push(A('warning', 'checkSquare', c.label, 'Needed for financial close.', 'post', 'Open close-out')));
    if (ev.stage === 'financial_close' && !out.length) out.push(A('info', 'check', 'Everything is settled', 'Archive the event to make it read-only.', 'post', 'Archive'));
  }
  if (!out.length && nextStage(ev.stage)) {
    const blockers = transitionBlockers(ev, nextStage(ev.stage), eventContext(state, ev, today));
    out.push(blockers.length
      ? A('info', 'info', `Next: ${stageLabel(nextStage(ev.stage))}`, blockers.join('; '), 'overview', 'View lifecycle')
      : A('info', 'check', `Ready to move to ${stageLabel(nextStage(ev.stage))}`, 'All requirements are met.', 'overview', 'Advance'));
  }
  return out.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
}

/** What goes wrong in real life: vendor fallout, unpaid balances, weather, unanswered inquiries, items in custody. */
function riskActions(state, ev, today, cur) {
  const out = [];
  const now = new Date();
  const sla = leadSla(state, ev, now);
  if (sla) out.push(A(sla.breached ? 'danger' : 'warning', 'clock', sla.breached ? `Inquiry unanswered for ${sla.hours}h` : `Reply to this inquiry within ${sla.limit}h`, sla.breached ? `First-response target was ${sla.limit}h — couples book the first planner who answers.` : `Due ${fmtDate(sla.dueAt.slice(0, 10))}. Log the call or email when done.`, 'overview', 'Log reply', 'interactions-card'));
  vendorGaps(ev).forEach((g) => out.push(A('danger', 'alert', `No ${g.category} vendor — ${state.vendors.find((v) => v.id === g.booking.vendorId)?.name} cancelled`, g.rfq ? `Replacement RFQ: ${g.quotes}/${g.rfq.vendorIds.length} quotes in, due ${fmtDate(g.rfq.dueDate)}. Award one and confirm it.` : 'No replacement RFQ yet — source a vendor now.', 'vendors', 'Replace vendor')));
  vendorRefundsDue(ev).forEach((b) => out.push(A('warning', 'money', `Recover ${cur(b.refundDue)} deposit from ${state.vendors.find((v) => v.id === b.vendorId)?.name}`, 'The vendor cancelled after being paid.', 'vendors', 'Open vendors')));
  if (stageIndex(ev.stage) >= stageIndex('booked') && stageIndex(ev.stage) < stageIndex('event_day')) {
    const fp = finalPaymentRisk(state, ev, today);
    if (fp && fp.status !== 'ok') out.push(A('danger', 'wallet', fp.status === 'breach' ? `Final balance unpaid past the cutoff — event at risk` : `Final balance due by ${fmtDate(fp.cutoff)}`, `${cur(fp.balance)} outstanding. ${fp.status === 'breach' ? 'Vendors are not released until it is paid; the event cannot move to Pre-Event without an override.' : `${fp.days} day(s) to the cutoff.`}`, 'finance', 'Chase payment'));
  }
  if (stageIndex(ev.stage) >= stageIndex('booked') && stageIndex(ev.stage) <= stageIndex('event_day')) {
    const ICON = { rooms: 'bed', allergy: 'alert', capacity: 'users', permit: 'flag' };
    const TAB = { rooms: 'vendors', allergy: 'guests', capacity: 'guests', permit: 'planning' };
    const CTA = { rooms: 'Update pick-up', allergy: 'Open allergy sheet', capacity: 'Review guests', permit: 'Open permits' };
    obligationIssues(state, ev, today).forEach((o) => out.push(A(o.level, ICON[o.area], o.text, o.detail, TAB[o.area], CTA[o.area])));
  }
  const w = weatherCall(state, ev, now);
  if (w && !w.decided && stageIndex(ev.stage) <= stageIndex('event_day') && (w.overdue || w.soon)) out.push(A(w.overdue ? 'danger' : 'warning', 'sun', w.overdue ? `Weather call overdue — ${w.function}` : `Weather call due ${fmtDate(w.due.slice(0, 10))} — ${w.function}`, `Plan A: ${w.planA} · Plan B: ${w.planB}. Vendors and rentals need the decision.`, 'overview', 'Make the call', 'risk-card'));
  if (ev.stage === 'event_day' || (ev.date === today && stageIndex(ev.stage) >= stageIndex('pre_event'))) {
    lateVendors(state, ev, now).forEach((x) => out.push(A('danger', 'truck', `${state.vendors.find((v) => v.id === x.booking.vendorId)?.name} is ${x.minutesLate} min late`, `Load-in was ${x.booking.loadIn.slice(11, 16)}. Call ${x.booking.onsiteContact || 'the vendor'}.`, 'vendors', 'Open vendors')));
  }
  return out;
}

/** Readiness per area: status = done | ok | attention | blocked | na. */
export function readiness(state, ev, today) {
  const areas = [];
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
  const f = eventFinancials(state, ev);
  const overdue = ev.invoices.filter((i) => invoiceStatus(ev, i, today) === 'overdue').length;
  areas.push({ id: 'money', label: 'Contract & payments', tab: 'finance', icon: 'wallet',
    pct: ev.contract?.immutable ? pct(f.paid, f.contractTotal) : 0,
    status: !ev.contract?.immutable ? 'blocked' : overdue ? 'attention' : f.balance <= 0.5 ? 'done' : 'ok',
    summary: !ev.contract ? 'No contract yet' : !ev.contract.immutable ? 'Contract not fully signed' : `${fmtMoney(f.paid, ev.currency, { whole: true })} of ${fmtMoney(f.contractTotal, ev.currency, { whole: true })} paid${overdue ? ` · ${overdue} overdue` : ''}` });
  const vb = ev.vendorBookings.filter((b) => b.status !== 'cancelled');
  const confirmed = vb.filter((b) => b.status === 'confirmed').length;
  const compliance = vb.some((b) => vendorCompliance(state.vendors.find((v) => v.id === b.vendorId), today).some((i) => i.level === 'danger'));
  areas.push({ id: 'vendors', label: 'Vendors', tab: 'vendors', icon: 'store', pct: pct(confirmed, vb.length),
    status: !vb.length ? 'na' : compliance ? 'attention' : confirmed === vb.length ? 'done' : 'ok', summary: vb.length ? `${confirmed}/${vb.length} confirmed${compliance ? ' · compliance issue' : ''}` : 'No vendors booked' });
  const hc = headcount(ev);
  areas.push({ id: 'guests', label: 'Guests & RSVP', tab: 'guests', icon: 'users', pct: pct(hc.invited - hc.pending, hc.invited),
    status: !hc.invited ? 'na' : ev.finalHeadcount ? 'done' : hc.pending ? 'ok' : 'ok', summary: hc.invited ? `${hc.confirmed} attending · ${hc.pending} pending${ev.finalHeadcount ? ` · final ${ev.finalHeadcount}` : ''}` : 'No guest list' });
  const s = staffingSummary(ev);
  areas.push({ id: 'people', label: 'People & crew', tab: 'people', icon: 'hardhat', pct: s.pct,
    status: !s.required ? 'na' : s.open ? 'attention' : 'done', summary: s.required ? `${s.confirmed}/${s.required} confirmed · ${s.people} people` : 'No staffing plan' });
  const issues = productionIssues(state, ev).filter((i) => i.kind !== 'staffing');
  areas.push({ id: 'production', label: 'Timeline & production', tab: 'timeline', icon: 'clock', pct: ev.ros.status === 'final' ? 100 : ev.ros.status === 'shared' ? 66 : ev.ros.items.length ? 33 : 0,
    status: !ev.ros.items.length ? 'na' : issues.some((i) => i.level === 'danger') ? 'attention' : ev.ros.status === 'final' ? 'done' : 'ok', summary: ev.ros.items.length ? `Run of show ${ev.ros.status} · ${issues.length ? `${issues.length} issue(s)` : 'no conflicts'}` : 'No run of show yet' });
  const done = ev.tasks.filter((t) => t.status === 'done').length;
  const late = ev.tasks.filter((t) => t.status !== 'done' && t.dueDate < today).length;
  areas.push({ id: 'tasks', label: 'Planning tasks', tab: 'planning', icon: 'checkSquare', pct: pct(done, ev.tasks.length),
    status: !ev.tasks.length ? 'na' : late ? 'attention' : done === ev.tasks.length ? 'done' : 'ok', summary: ev.tasks.length ? `${done}/${ev.tasks.length} done${late ? ` · ${late} overdue` : ''}` : 'No tasks' });
  return areas;
}

/** Key dates for the event, past and upcoming, each linked to the tab that owns it. */
export function keyDates(state, ev, today) {
  const d = stageDates(ev);
  const rows = [
    { label: 'Inquiry received', date: d.lead, tab: 'overview' },
    { label: 'Contract signed', date: ev.contract?.signedAt?.slice(0, 10), tab: 'contract' },
    { label: 'Deposit paid · date locked', date: d.planning, tab: 'finance' },
  ];
  ev.paymentSchedule.filter((p) => p.status !== 'paid' && p.status !== 'cancelled').forEach((p) => rows.push({ label: p.label, date: p.dueDate, tab: 'finance', money: fmtMoney(p.amount, ev.currency, { whole: true }) }));
  if (ev.date) {
    if (ev.households.length) rows.push({ label: 'RSVP deadline', date: addDays(ev.date, -state.settings.rsvpDeadlineDays), tab: 'guests' });
    rows.push({ label: 'Final headcount due', date: addDays(ev.date, -state.settings.finalHeadcountDays), tab: 'guests', done: !!ev.finalHeadcount });
    ev.subEvents.forEach((s) => rows.push({ label: `${s.name}${s.start ? ` · ${s.start}` : ''}`, date: s.date ?? ev.date, tab: 'timeline', event: true }));
    if (!ev.subEvents.length) rows.push({ label: 'Event day', date: ev.date, tab: 'timeline', event: true });
    rows.push({ label: 'Close-out target', date: addDays(ev.date, 7), tab: 'post' });
  }
  return rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, past: r.date < today, today: r.date === today }));
}

/** Top priorities across a user's events — shown right after sign-in. */
export function priorities(state, user, today, limit = 4) {
  const mine = (e) => {
    if (user.role === 'admin' || user.role === 'finance') return true;
    if (user.role === 'sales') return e.salesId === user.id;
    if (user.role === 'planner') return e.plannerId === user.id;
    return true;
  };
  const roleTabs = {
    sales: ['overview', 'proposal', 'contract'],
    finance: ['finance', 'co'],
    production: ['people', 'timeline', 'vendors', 'ros'],
  };
  return state.events.filter((e) => !isExit(e.stage) && e.stage !== 'archived' && mine(e))
    .flatMap((e) => nextActions(state, e, today).map((a) => ({ ...a, ev: e })))
    .filter((a) => !roleTabs[user.role] || roleTabs[user.role].includes(a.tab))
    .sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.ev.date ?? '9').localeCompare(b.ev.date ?? '9'))
    .slice(0, limit);
}
