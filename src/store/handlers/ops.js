// Change orders, run of show, incidents, staff scheduling, decor integration results, post-event.
import { addDays, fmtDate } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { shiftFrom } from '../../lib/ros.js';
import { proposalTotals } from '../../lib/derived.js';
import { assert, runStageAutomations, sendTemplateEmail, eventVars, clientEmail } from './common.js';

function jurisdictionRateFor(ctx, ev) {
  const v = ev.proposals.find((p) => p.status === 'accepted') ?? ev.proposals[0];
  const t = v ? proposalTotals(ctx.state, ev, v) : null;
  if (!t || !t.tax.taxableBase) return 0;
  return t.tax.taxAmount / t.tax.taxableBase;
}

/** Applying an approved CO updates contract total, payment schedule, budget (via CO lines), decor & guest count. */
function applyChangeOrder(ctx, ev, co) {
  const total = round2(co.costImpact + co.taxImpact);
  ev.contract.total = round2(ev.contract.total + total);
  if (total > 0) {
    ev.paymentSchedule.push({ id: ctx.id('pay'), label: `Change Order ${co.number}`, pct: null, dueDate: addDays(ctx.today, 7) > ev.date ? ctx.today : addDays(ctx.today, 7), amount: total, status: 'scheduled', invoiceId: null, source: 'change_order', coId: co.id });
  } else if (total < 0) {
    ev.creditNotes.push({ id: ctx.id('cn'), number: `CN-${ctx.next('creditNote')}`, amount: -total, reason: `Change Order ${co.number} reduction`, refund: false, at: new Date().toISOString(), status: 'issued' });
    co.invoiced = true;
  }
  if (co.guestCountDelta) {
    ev.guestCount = (ev.guestCount || 0) + co.guestCountDelta;
    if (ev.finalHeadcount) ev.finalHeadcount += co.guestCountDelta;
  }
  co.decorImpact.forEach((d) => {
    const ex = ev.decorRequests.find((r) => r.itemId === d.itemId);
    if (ex) ex.qty += d.qty;
    else ev.decorRequests.push({ itemId: d.itemId, qty: d.qty });
  });
  ev.decorRequests = ev.decorRequests.filter((r) => r.qty > 0);
  if (co.decorImpact.length) ctx.sideEffects.push({ type: 'decor.reserve', eventId: ev.id, items: co.decorImpact.filter((d) => d.qty > 0) });
  co.appliedAt = new Date().toISOString();
  ev.decisions.unshift({ id: ctx.id('dec'), decision: `Change Order ${co.number} approved: ${co.title} (${total >= 0 ? '+' : ''}${total} ${ev.currency})`, decidedBy: co.approvals.map((a) => a.name).join(', '), approvedAt: co.appliedAt, recordedBy: ctx.user.id, reference: co.number });
}

export const opsHandlers = {
  CO_CREATE(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    assert(ev.contract?.immutable, 'Change Orders apply only after the contract is signed');
    const deadline = addDays(ev.date, -ctx.state.settings.finalHeadcountDays);
    const isException = !!data.guestCountDelta && ctx.today > deadline;
    const costImpact = round2(data.lines.reduce((a, l) => a + Number(l.amount), 0));
    const costImpactCost = round2(data.lines.reduce((a, l) => a + Number(l.cost || 0), 0));
    const rate = jurisdictionRateFor(ctx, ev);
    const co = {
      id: ctx.id('co'), number: `CO-${ctx.next('changeOrder')}`, status: 'draft', createdAt: new Date().toISOString(), createdBy: ctx.user.id, approvals: [], invoiced: false,
      decorImpact: [], guestCountDelta: 0, vendorImpact: '', timelineImpact: '', ...data,
      lines: data.lines.map((l) => ({ ...l, amount: Number(l.amount), cost: Number(l.cost || 0) })),
      costImpact, costImpactCost, taxImpact: round2(costImpact * rate), isException, specialApproval: null,
    };
    ev.changeOrders.push(co);
    return { summary: `Change Order ${co.number} drafted: ${co.title} (${costImpact >= 0 ? '+' : ''}${costImpact} ${ev.currency})${isException ? ' — EXCEPTION: guest count change after final headcount deadline' : ''}`, eventId };
  },
  CO_SEND(ctx, { eventId, coId }) {
    const ev = ctx.ev(eventId);
    const co = ev.changeOrders.find((c) => c.id === coId);
    co.status = 'sent';
    co.sentAt = new Date().toISOString();
    ctx.notify({ toRoles: ['client'], eventId, level: 'info', text: `Change Order ${co.number} awaits your approval (${ev.name}).` });
    return { summary: `Change Order ${co.number} sent to client for approval`, eventId };
  },
  CO_SPECIAL_APPROVE(ctx, { eventId, coId, note }) {
    const ev = ctx.ev(eventId);
    const co = ev.changeOrders.find((c) => c.id === coId);
    assert(['admin', 'planner'].includes(ctx.user.role), 'Only Admin / Lead planner can grant exception approval');
    co.specialApproval = { by: ctx.user.id, name: ctx.user.name, at: new Date().toISOString(), note };
    return { summary: `Exception approval granted for ${co.number} by ${ctx.user.name} (${note || 'vendor capacity confirmed'})`, eventId };
  },
  /** Client approves via portal: signature/click with audit trail. */
  CO_APPROVE(ctx, { eventId, coId, method, typedName }) {
    const ev = ctx.ev(eventId);
    const co = ev.changeOrders.find((c) => c.id === coId);
    assert(co.status === 'sent', 'Change Order is not awaiting approval');
    assert(!co.isException || co.specialApproval, 'This exception (post-deadline headcount change) needs internal special approval first');
    co.approvals.push({ by: ctx.user.id, name: typedName || ctx.user.name, at: new Date().toISOString(), method, ip: `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
    co.status = 'approved';
    applyChangeOrder(ctx, ev, co);
    ctx.notify({ toRoles: ['planner', 'finance', 'production'], eventId, level: 'success', text: `${co.number} approved by client — contract, schedule, budget${co.decorImpact.length ? ', decor' : ''} updated.` });
    return { summary: `Change Order ${co.number} APPROVED by ${typedName || ctx.user.name} (${method}); contract total now ${ev.contract.total}`, eventId };
  },
  CO_REJECT(ctx, { eventId, coId, reason }) {
    const ev = ctx.ev(eventId);
    const co = ev.changeOrders.find((c) => c.id === coId);
    co.status = 'rejected';
    co.rejectedReason = reason;
    return { summary: `Change Order ${co.number} rejected (${reason || 'no reason'})`, eventId };
  },
  // ----- Run of show -----
  ROS_ITEM_ADD(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    ev.ros.items.push({ id: ctx.id('ros'), track: 'guest', duration: 15, vendorIds: [], cue: '', notes: '', liveStatus: 'pending', ...data });
    markRosChanged(ctx, ev, data.vendorIds || [], data.ownerStaffId);
    return { summary: `Run of show item added: ${data.start} ${data.activity}`, eventId };
  },
  ROS_ITEM_UPDATE(ctx, { eventId, itemId, patch }) {
    const ev = ctx.ev(eventId);
    const it = ev.ros.items.find((x) => x.id === itemId);
    Object.assign(it, patch);
    markRosChanged(ctx, ev, it.vendorIds, it.ownerStaffId);
    return { summary: `Run of show: "${it.activity}" updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  ROS_ITEM_REMOVE(ctx, { eventId, itemId }) {
    const ev = ctx.ev(eventId);
    const it = ev.ros.items.find((x) => x.id === itemId);
    ev.ros.items = ev.ros.items.filter((x) => x.id !== itemId);
    markRosChanged(ctx, ev, it.vendorIds, it.ownerStaffId);
    return { summary: `Run of show item removed: ${it.activity}`, eventId };
  },
  ROS_SET_STATUS(ctx, { eventId, status }) {
    const ev = ctx.ev(eventId);
    ev.ros.status = status;
    ev.ros.version += 1;
    ev.ros.history.push({ version: ev.ros.version, status, at: new Date().toISOString(), by: ctx.user.id });
    if (status !== 'draft') {
      const vendorIds = [...new Set(ev.ros.items.flatMap((i) => i.vendorIds))];
      ctx.notify({ toRoles: ['vendor', 'crew'], eventId, level: 'info', text: `Run of show for ${ev.name} is now ${status.toUpperCase()} (v${ev.ros.version}).` });
      return { summary: `Run of show → ${status.toUpperCase()} v${ev.ros.version}; ${vendorIds.length} vendors notified`, eventId };
    }
    return { summary: `Run of show back to DRAFT v${ev.ros.version}`, eventId };
  },
  /** Day-of: live status update. */
  ROS_LIVE(ctx, { eventId, itemId, liveStatus }) {
    const ev = ctx.ev(eventId);
    const it = ev.ros.items.find((x) => x.id === itemId);
    it.liveStatus = liveStatus;
    if (liveStatus === 'in_progress' && !it.actualStart) it.actualStart = new Date().toTimeString().slice(0, 5);
    return { summary: `LIVE: ${it.start} "${it.activity}" → ${liveStatus.replace('_', ' ')}`, eventId };
  },
  /** Day-of: delay item, subsequent items in same function/track shift. */
  ROS_SHIFT(ctx, { eventId, itemId, minutes }) {
    const ev = ctx.ev(eventId);
    const it = ev.ros.items.find((x) => x.id === itemId);
    const before = ev.ros.items.filter((i) => i.subEventId === it.subEventId && i.track === it.track && i.start >= it.start && i.liveStatus !== 'done').length;
    ev.ros.items = shiftFrom(ev.ros.items, itemId, Number(minutes));
    if (Number(minutes) > 0) ev.ros.items.find((x) => x.id === itemId).liveStatus = ev.ros.items.find((x) => x.id === itemId).liveStatus === 'pending' ? 'delayed' : ev.ros.items.find((x) => x.id === itemId).liveStatus;
    ctx.notify({ toRoles: ['crew', 'vendor', 'planner'], eventId, level: 'warning', text: `${ev.name}: timeline shifted ${minutes} min from "${it.activity}" (${before} items).` });
    return { summary: `LIVE: shifted ${before} item(s) by ${minutes} min starting "${it.activity}"`, eventId };
  },
  INCIDENT_ADD(ctx, { eventId, type, description, severity, photo }) {
    const ev = ctx.ev(eventId);
    ev.incidents.unshift({ id: ctx.id('inc'), type, description, severity, photo: photo || null, at: new Date().toISOString(), by: ctx.user.staffId || ctx.user.id });
    ctx.notify({ toRoles: ['planner', 'admin', 'production'], eventId, level: severity === 'high' ? 'danger' : 'warning', text: `INCIDENT (${type}, ${severity}) at ${ev.name}: ${description}` });
    return { summary: `Incident reported (${type}/${severity}): ${description}${photo ? ' [photo attached]' : ''}`, eventId };
  },
  // ----- Staff -----
  STAFF_ADD(ctx, { data }) {
    ctx.state.staff.push({ id: ctx.id('st'), skills: [], ...data, rate: Number(data.rate) });
    return `Staff added: ${data.name} (${data.type}, ${data.rate}/${data.rateType})`;
  },
  STAFF_UPDATE(ctx, { staffId, patch }) {
    const s = ctx.state.staff.find((x) => x.id === staffId);
    Object.assign(s, patch);
    return `Staff ${s.name} updated (${Object.keys(patch).join(', ')})`;
  },
  SHIFT_ADD(ctx, { eventId, data }) {
    const ev = ctx.ev(eventId);
    ev.shifts.push({ id: ctx.id('sh'), confirmed: false, date: ev.date, ...data });
    const st = ctx.state.staff.find((s) => s.id === data.staffId);
    ctx.notify({ toRoles: ['crew'], eventId, level: 'info', text: `${st?.name}: new shift ${data.role} on ${fmtDate(data.date || ev.date)} ${data.start}-${data.end} — please confirm.` });
    return { summary: `Shift scheduled: ${st?.name} as ${data.role} ${data.start}-${data.end}`, eventId };
  },
  SHIFT_REMOVE(ctx, { eventId, shiftId }) {
    const ev = ctx.ev(eventId);
    const sh = ev.shifts.find((x) => x.id === shiftId);
    ev.shifts = ev.shifts.filter((x) => x.id !== shiftId);
    return { summary: `Shift removed: ${ctx.state.staff.find((s) => s.id === sh.staffId)?.name}`, eventId };
  },
  SHIFT_CONFIRM(ctx, { eventId, shiftId }) {
    const ev = ctx.ev(eventId);
    const sh = ev.shifts.find((x) => x.id === shiftId);
    sh.confirmed = true;
    return { summary: `Shift confirmed by ${ctx.state.staff.find((s) => s.id === sh.staffId)?.name}`, eventId };
  },
  CLOCK(ctx, { eventId, shiftId, direction, location }) {
    const ev = ctx.ev(eventId);
    const sh = ev.shifts.find((x) => x.id === shiftId);
    const now = new Date();
    const local = `${ev.date}T${now.toTimeString().slice(0, 8)}`;
    if (direction === 'in') { sh.clockIn = local; sh.clockLocation = location; }
    else sh.clockOut = local;
    return { summary: `Clock ${direction.toUpperCase()}: ${ctx.state.staff.find((s) => s.id === sh.staffId)?.name} at ${now.toTimeString().slice(0, 5)} (${location || 'no GPS'})`, eventId };
  },
  // ----- Decor Inventory integration results (async side effects report back here) -----
  DECOR_REQUEST_SET(ctx, { eventId, items }) {
    const ev = ctx.ev(eventId);
    ev.decorRequests = items.filter((i) => i.qty > 0);
    return { summary: `Decor request updated: ${ev.decorRequests.length} item type(s)`, eventId };
  },
  DECOR_SYNCED(ctx, { eventId, reservationId, ok, message }) {
    const ev = ctx.ev(eventId);
    if (ok) ev.decorReservationId = reservationId;
    ev.decorSyncError = ok ? null : message;
    return { summary: ok ? `Decor Inventory API: reservation ${reservationId} confirmed` : `Decor Inventory API error: ${message}`, eventId };
  },
  DECOR_RETURN_RECORDED(ctx, { eventId, report }) {
    const ev = ctx.ev(eventId);
    const totalCharge = round2(report.reduce((a, r) => a + r.charge, 0));
    ev.decorReturn = { checkedAt: new Date().toISOString(), items: report, totalCharge };
    if (totalCharge > 0) ctx.notify({ toRoles: ['finance', 'planner'], eventId, level: 'warning', text: `${ev.name}: decor damage/loss ${totalCharge} — bill client or venue.` });
    return { summary: `Decor return report pulled from Decor Inventory: ${report.reduce((a, r) => a + r.damaged, 0)} damaged, ${report.reduce((a, r) => a + r.lost, 0)} lost, charge ${totalCharge}`, eventId };
  },
  DAMAGE_BILL(ctx, { eventId, billTo }) {
    const ev = ctx.ev(eventId);
    assert(ev.decorReturn?.totalCharge > 0, 'No damage charges');
    const inv = { id: ctx.id('inv'), number: `INV-${ctx.next('invoice')}`, eventId, kind: 'damage', label: `Decor damage/loss (${billTo})`, payerId: billTo === 'client' ? ev.payers[0]?.id : null, billTo, amount: ev.decorReturn.totalCharge, currency: ev.currency, fxRateToUSD: ctx.state.settings.fxRates[ev.currency], issuedAt: ctx.today, dueDate: addDays(ctx.today, 14), status: 'sent', lateFeeApplied: 0 };
    ev.invoices.push(inv);
    ev.closing.damageBilled = true;
    return { summary: `Damage/loss invoice ${inv.number} (${inv.amount}) billed to ${billTo}`, eventId };
  },
  CLOSING_UPDATE(ctx, { eventId, patch }) {
    const ev = ctx.ev(eventId);
    Object.assign(ev.closing, patch);
    if (patch.surveySent) sendTemplateEmail(ctx, { key: `survey:${ev.id}`, templateId: 'tpl_survey', to: clientEmail(ctx.state, ev), vars: eventVars(ctx.state, ev), eventId });
    return { summary: `Close-out: ${Object.entries(patch).map(([k, v]) => `${k}=${typeof v === 'object' ? 'submitted' : v}`).join(', ')}`, eventId };
  },
  SURVEY_SUBMIT(ctx, { eventId, rating, comment }) {
    const ev = ctx.ev(eventId);
    ev.closing.survey = { rating: Number(rating), comment, at: new Date().toISOString() };
    return { summary: `Client survey submitted: ${rating}/5`, eventId };
  },
  STAGE_AUTOMATION_RERUN(ctx, { eventId }) {
    const ev = ctx.ev(eventId);
    runStageAutomations(ctx, ev, ev.stage);
    return { summary: 'Stage automations re-run', eventId };
  },
};

function markRosChanged(ctx, ev, vendorIds, staffId) {
  if (ev.ros.status === 'final') {
    const names = vendorIds.map((id) => ctx.state.vendors.find((v) => v.id === id)?.name).filter(Boolean);
    ev.ros.changedAfterFinal = true;
    ctx.notify({ toRoles: ['vendor', 'crew', 'planner'], eventId: ev.id, level: 'warning', text: `FINAL run of show changed for ${ev.name}. Affected: ${[...names, ctx.state.staff.find((s) => s.id === staffId)?.name].filter(Boolean).join(', ') || 'team'}.` });
  }
}
