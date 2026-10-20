// Proposal & contract handlers.
import { addDays, fmtDate } from '../../lib/dates.js';
import { generatePaymentSchedule, renderTemplate, contractFullySigned } from '../../lib/contracts.js';
import { proposalTotals, clientOf } from '../../lib/derived.js';
import { generateTasks } from '../../lib/tasks.js';
import { assert, runStageAutomations } from './common.js';
import { createInvoiceForSchedule } from './finance.js';

function lineFromCatalog(ctx, catalogId, extra = {}) {
  const c = ctx.state.settings.catalog.find((x) => x.id === catalogId);
  return { id: ctx.id('ln'), catalogId, name: c.name, category: c.category, pricing: c.pricing, unitPrice: c.unitPrice ?? 0, unitCost: c.unitCost ?? 0, qty: c.qty ?? 1, pct: c.pct ?? 0, costPct: c.costPct ?? 0, isServiceFee: !!c.isServiceFee, taxable: true, optional: false, selected: true, decorItemId: c.decorItemId ?? null, ...extra };
}

function editableVersion(ev, versionId) {
  const v = ev.proposals.find((p) => p.id === versionId);
  assert(v, 'Proposal version not found');
  assert(v.status === 'draft', `Proposal v${v.version} is ${v.status} — create a new version to edit.`);
  return v;
}

export const salesHandlers = {
  PROPOSAL_CREATE(ctx, { eventId }) {
    const ev = ctx.ev(eventId);
    const et = ctx.state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
    const lines = [...et.proposalTemplate.map((c) => lineFromCatalog(ctx, c)), ...et.optionalTemplate.map((c) => lineFromCatalog(ctx, c, { optional: true, selected: false }))];
    const v = { id: ctx.id('prop'), version: ev.proposals.length + 1, status: 'draft', lines, guestCount: ev.guestCount || 100, jurisdictionId: ev.jurisdictionId, currency: ev.currency, createdAt: new Date().toISOString(), validUntil: addDays(ctx.today, ctx.state.settings.proposalValidityDays), changeSummary: `Created from "${et.name}" template`, moodboard: [], notes: '' };
    ev.proposals.push(v);
    return { summary: `Proposal v${v.version} drafted from ${et.name} template for ${ev.name}`, eventId };
  },
  PROPOSAL_NEW_VERSION(ctx, { eventId, fromId, changeSummary }) {
    const ev = ctx.ev(eventId);
    assert(!ev.contract?.immutable, 'Contract signed — use a Change Order instead of a new proposal version.');
    const src = ev.proposals.find((p) => p.id === fromId);
    const v = { ...structuredClone(src), id: ctx.id('prop'), version: Math.max(...ev.proposals.map((p) => p.version)) + 1, status: 'draft', createdAt: new Date().toISOString(), validUntil: addDays(ctx.today, ctx.state.settings.proposalValidityDays), changeSummary: changeSummary || `Revision of v${src.version}`, acceptedAt: null };
    v.lines = v.lines.map((l) => ({ ...l, id: ctx.id('ln') }));
    ev.proposals.push(v);
    return { summary: `Proposal v${v.version} created from v${src.version} for ${ev.name}`, eventId };
  },
  PROPOSAL_UPDATE(ctx, { eventId, versionId, patch }) {
    const ev = ctx.ev(eventId);
    const v = editableVersion(ev, versionId);
    Object.assign(v, patch);
    return { summary: `Proposal v${v.version} updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  PROPOSAL_LINE_ADD(ctx, { eventId, versionId, catalogId, custom }) {
    const ev = ctx.ev(eventId);
    const v = editableVersion(ev, versionId);
    const l = custom ? { id: ctx.id('ln'), catalogId: null, taxable: true, optional: false, selected: true, qty: 1, pct: 0, costPct: 0, unitCost: 0, ...custom } : lineFromCatalog(ctx, catalogId);
    v.lines.push(l);
    return { summary: `Added line "${l.name}" to proposal v${v.version}`, eventId };
  },
  PROPOSAL_LINE_UPDATE(ctx, { eventId, versionId, lineId, patch }) {
    const ev = ctx.ev(eventId);
    const v = editableVersion(ev, versionId);
    const l = v.lines.find((x) => x.id === lineId);
    Object.assign(l, patch);
    return { summary: `Proposal v${v.version}: "${l.name}" ${Object.entries(patch).map(([k, val]) => `${k}=${val}`).join(', ')}`, eventId };
  },
  PROPOSAL_LINE_REMOVE(ctx, { eventId, versionId, lineId }) {
    const ev = ctx.ev(eventId);
    const v = editableVersion(ev, versionId);
    const l = v.lines.find((x) => x.id === lineId);
    v.lines = v.lines.filter((x) => x.id !== lineId);
    return { summary: `Removed "${l.name}" from proposal v${v.version}`, eventId };
  },
  /** Send/activate: exactly one active version; previous active becomes superseded. */
  PROPOSAL_ACTIVATE(ctx, { eventId, versionId }) {
    const ev = ctx.ev(eventId);
    const v = ev.proposals.find((p) => p.id === versionId);
    assert(v.lines.length > 0, 'Proposal has no lines');
    ev.proposals.forEach((p) => { if (p.status === 'active') p.status = 'superseded'; });
    v.status = 'active';
    v.sentAt = new Date().toISOString();
    if (v.validUntil < ctx.today) v.validUntil = addDays(ctx.today, ctx.state.settings.proposalValidityDays);
    const t = proposalTotals(ctx.state, ev, v);
    ev.estValue = t.total;
    if (['lead', 'qualified'].includes(ev.stage)) { ev.prevStage = ev.stage; ev.stage = 'proposal_sent'; ev.probability = Math.max(ev.probability, 40); }
    return { summary: `Proposal v${v.version} sent to client (${t.total.toFixed(2)} ${v.currency}, valid until ${fmtDate(v.validUntil)})`, eventId };
  },
  /** Client portal: toggle optional (upsell) item on the active version. */
  PROPOSAL_TOGGLE_OPTIONAL(ctx, { eventId, versionId, lineId }) {
    const ev = ctx.ev(eventId);
    const v = ev.proposals.find((p) => p.id === versionId);
    assert(v.status === 'active', 'Only the active proposal can be changed by the client');
    assert(v.validUntil >= ctx.today, 'This proposal has expired — prices are no longer valid. Ask your planner for a refreshed version.');
    const l = v.lines.find((x) => x.id === lineId);
    assert(l.optional, 'Only optional items can be toggled');
    l.selected = !l.selected;
    return { summary: `Client ${l.selected ? 'selected' : 'removed'} optional item "${l.name}" (v${v.version})`, eventId };
  },
  PROPOSAL_ACCEPT(ctx, { eventId, versionId }) {
    const ev = ctx.ev(eventId);
    const v = ev.proposals.find((p) => p.id === versionId);
    assert(v.status === 'active', 'Only the active proposal can be accepted');
    assert(v.validUntil >= ctx.today, 'Proposal expired — cannot accept expired pricing.');
    v.status = 'accepted';
    v.acceptedAt = new Date().toISOString();
    v.acceptedBy = ctx.user.id;
    ev.guestCount = v.guestCount;
    if (['proposal_sent', 'qualified', 'lead'].includes(ev.stage)) { ev.prevStage = ev.stage; ev.stage = 'negotiation'; }
    ev.decisions.unshift({ id: ctx.id('dec'), decision: `Accepted proposal v${v.version}`, decidedBy: ctx.user.name, approvedAt: v.acceptedAt, recordedBy: ctx.user.id, reference: `Proposal v${v.version}` });
    return { summary: `Proposal v${v.version} ACCEPTED by ${ctx.user.name}`, eventId };
  },
  CONTRACT_GENERATE(ctx, { eventId, signers, paymentScheduleId, cancellationPolicyId }) {
    const { state } = ctx;
    const ev = ctx.ev(eventId);
    assert(!ev.contract?.immutable, 'A signed contract already exists and is immutable.');
    const v = ev.proposals.find((p) => p.status === 'accepted') ?? ev.proposals.find((p) => p.status === 'active');
    assert(v, 'Need an accepted/active proposal to generate a contract');
    assert(ev.date, 'Event date required');
    const t = proposalTotals(state, ev, v);
    const ps = state.settings.paymentSchedules.find((x) => x.id === paymentScheduleId);
    const cp = state.settings.cancellationPolicies.find((x) => x.id === cancellationPolicyId);
    const preview = generatePaymentSchedule({ total: t.total, eventDate: ev.date, signDate: ctx.today, template: ps, idFn: ctx.id });
    const client = clientOf(state, ev);
    const body = renderTemplate(state.settings.contractTemplates[0].body, {
      sign_date: fmtDate(ctx.today), company_name: state.settings.company.name, client_name: client.name, event_name: ev.name, event_date: fmtDate(ev.date),
      venue: ev.venue?.name, guest_count: v.guestCount, total: t.total.toFixed(2), currency: v.currency, proposal_version: `v${v.version}`,
      payment_schedule: preview.map((s) => `   - ${s.label}: ${s.amount.toFixed(2)} due ${fmtDate(s.dueDate)}`).join('\n'),
      cancellation_table: cp.rows.map((r) => `   - ${r.minDaysBefore}+ days before event: ${r.forfeitPct}% forfeited`).join('\n'),
      postponement: cp.postponement, force_majeure: cp.forceMajeure, late_fee_pct: state.settings.lateFeePct,
    });
    ev.contract = { id: ctx.id('ctr'), templateId: 'ct_standard', proposalId: v.id, status: 'draft', body, total: t.total, originalTotal: t.total, currency: v.currency, paymentScheduleId, cancellationPolicyId, lateFeePct: state.settings.lateFeePct, signers: signers.map((s) => ({ id: ctx.id('sig'), ...s, signedAt: null, ip: null })), sentAt: null, signedAt: null, immutable: false };
    return { summary: `Contract generated for ${ev.name} (${t.total.toFixed(2)} ${v.currency}, ${signers.length} signer(s))`, eventId };
  },
  CONTRACT_SEND(ctx, { eventId }) {
    const ev = ctx.ev(eventId);
    assert(ev.contract && !ev.contract.immutable, 'No draft contract');
    ev.contract.status = 'sent';
    ev.contract.sentAt = new Date().toISOString();
    return { summary: `Contract sent for e-signature to ${ev.contract.signers.map((s) => s.name).join(', ')}`, eventId };
  },
  /** E-signature. When all signers have signed: contract becomes immutable, schedule generated, deposit invoiced, stage -> booked. */
  CONTRACT_SIGN(ctx, { eventId, signerId, typedName }) {
    const { state } = ctx;
    const ev = ctx.ev(eventId);
    const c = ev.contract;
    assert(c && c.status !== 'draft', 'Contract has not been sent');
    assert(!c.immutable, 'Contract already fully signed');
    const s = c.signers.find((x) => x.id === signerId);
    assert(!s.signedAt, 'Already signed');
    assert(typedName && typedName.trim().length > 2, 'Type your full name to sign');
    s.signedAt = new Date().toISOString();
    s.ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    s.typedName = typedName;
    s.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'n/a';
    c.status = 'partially_signed';
    let summary = `${s.name} e-signed the contract for ${ev.name}`;
    if (contractFullySigned(c)) {
      c.status = 'signed';
      c.signedAt = new Date().toISOString();
      c.immutable = true;
      const ps = state.settings.paymentSchedules.find((x) => x.id === c.paymentScheduleId);
      ev.paymentSchedule = generatePaymentSchedule({ total: c.total, eventDate: ev.date, signDate: ctx.today, template: ps, idFn: ctx.id });
      if (!ev.payers.length) ev.payers.push({ id: ctx.id('py'), name: clientOf(state, ev).name, userId: null, categories: [] });
      createInvoiceForSchedule(ctx, ev, ev.paymentSchedule[0]);
      const et = state.settings.eventTypes.find((t) => t.id === ev.eventTypeId);
      if (!ev.tasks.length) ev.tasks = generateTasks(et.taskTemplate, ev.date, ctx.id);
      if (!ev.subEvents.length) ev.subEvents = et.defaultSubEvents.map((name) => ({ id: ctx.id('se'), name, date: ev.date, venue: ev.venue?.name, room: '', start: '18:00', end: '22:00', guestCount: ev.guestCount }));
      if (!ev.forms.length) ev.forms = et.forms.map((name) => ({ id: ctx.id('form'), name, fields: [{ key: 'notes', label: name, type: 'textarea' }], answers: {}, submittedAt: null }));
      ev.prevStage = ev.stage;
      ev.stage = 'booked';
      ev.probability = 100;
      if (ev.dateStatus !== 'locked') ev.dateStatus = 'hold';
      runStageAutomations(ctx, ev, 'booked');
      ctx.notify({ toRoles: ['finance', 'planner', 'admin'], eventId, level: 'success', text: `${ev.name} contract fully signed. Date stays on HOLD until deposit is received.` });
      summary += ' — contract FULLY SIGNED & locked (immutable); payment schedule + deposit invoice generated; stage → Booked';
    }
    return { summary, eventId };
  },
};
