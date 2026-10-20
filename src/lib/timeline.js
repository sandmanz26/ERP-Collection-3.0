// Timeline builders (planning Gantt + event-day production Gantt) and the production conflict engine.
import { addDays, diffDays, minutesBetween } from './dates.js';
import { absMinutes, spanOf, positionFill } from './workforce.js';
import { invoiceStatus } from './derived.js';
import { stageLabel } from './lifecycle.js';

// ---------- helpers ----------
export function rosDate(ev, item) {
  return ev.subEvents.find((s) => s.id === item.subEventId)?.date ?? ev.date;
}

export function rosSpan(ev, day0, item) {
  const s = absMinutes(day0, rosDate(ev, item), item.start);
  return [s, s + Number(item.duration || 0)];
}

/** First calendar day of on-site activity (functions, ROS, vendor load-ins, staffing) — the event-day axis origin. */
export function eventDays(ev) {
  const dates = new Set();
  ev.subEvents.forEach((s) => s.date && dates.add(s.date));
  (ev.positions || []).forEach((p) => p.date && dates.add(p.date));
  ev.vendorBookings.forEach((b) => { if (b.loadIn) dates.add(b.loadIn.slice(0, 10)); if (b.loadOut) dates.add(b.loadOut.slice(0, 10)); });
  if (!dates.size && ev.date) dates.add(ev.date);
  return [...dates].sort();
}

function dtToAbs(day0, dt) {
  return absMinutes(day0, dt.slice(0, 10), dt.slice(11, 16));
}

function accessWindowsAbs(ev, day0) {
  return (ev.production?.accessWindows || []).map((w) => ({ ...w, span: spanOf(day0, w.date, w.start, w.end) }));
}

function curfewAbs(ev, day0, date) {
  const c = ev.venue?.curfew;
  if (!c) return null;
  const m = absMinutes(day0, date, c);
  // curfews at or after midnight belong to the night of `date`
  return c < '06:00' ? m + 1440 : m;
}

// ---------- conflict engine ----------
/**
 * Event production is a multi-vendor puzzle, not a task list. Detects:
 *  - two vendors needing the same EXCLUSIVE resource (dock, service elevator) at the same time
 *  - vendor-to-vendor dependency violations (florals before lighting rig is finished)
 *  - activity outside the venue access window or after curfew
 *  - vendor activity outside that vendor's booked load-in/load-out window
 *  - unconfirmed vendors on a shared/final run of show, staffing gaps
 */
export function productionIssues(state, ev) {
  const days = eventDays(ev);
  if (!days.length) return [];
  const day0 = days[0];
  const issues = [];
  const items = ev.ros.items.map((i) => ({ i, span: rosSpan(ev, day0, i) }));
  const resources = ev.production?.resources || [];
  const vname = (id) => state.vendors.find((v) => v.id === id)?.name ?? id;
  const fmt = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

  resources.filter((r) => r.exclusive).forEach((r) => {
    const using = items.filter((x) => (x.i.resourceIds || []).includes(r.id)).sort((a, b) => a.span[0] - b.span[0]);
    for (let a = 0; a < using.length; a++) {
      for (let b = a + 1; b < using.length; b++) {
        if (using[b].span[0] < using[a].span[1]) {
          issues.push({ level: 'danger', kind: 'resource', itemIds: [using[a].i.id, using[b].i.id], text: `${r.name} double-booked ${fmt(using[b].span[0])}–${fmt(Math.min(using[a].span[1], using[b].span[1]))}: "${using[a].i.activity}" vs "${using[b].i.activity}"` });
        }
      }
    }
  });

  items.forEach(({ i, span }) => {
    (i.dependsOn || []).forEach((depId) => {
      const dep = items.find((x) => x.i.id === depId);
      if (dep && span[0] < dep.span[1]) issues.push({ level: 'danger', kind: 'dependency', itemIds: [i.id, depId], text: `"${i.activity}" starts ${fmt(span[0])} but depends on "${dep.i.activity}" which ends ${fmt(dep.span[1])}` });
    });
  });

  const windows = accessWindowsAbs(ev, day0);
  if (windows.length) {
    items.forEach(({ i, span }) => {
      const inside = windows.some((w) => span[0] >= w.span[0] && span[1] <= w.span[1]);
      if (!inside) issues.push({ level: 'warning', kind: 'access', itemIds: [i.id], text: `"${i.activity}" (${fmt(span[0])}–${fmt(span[1])}) is outside the venue access window` });
    });
  }

  items.forEach(({ i, span }) => {
    const cf = curfewAbs(ev, day0, rosDate(ev, i));
    if (cf !== null && i.track === 'guest' && span[1] > cf) issues.push({ level: 'warning', kind: 'curfew', itemIds: [i.id], text: `"${i.activity}" runs past the venue curfew (${ev.venue.curfew})` });
  });

  items.forEach(({ i, span }) => {
    (i.vendorIds || []).forEach((vid) => {
      const b = ev.vendorBookings.find((x) => x.vendorId === vid && x.status !== 'cancelled');
      if (!b) return issues.push({ level: 'warning', kind: 'vendor', itemIds: [i.id], text: `"${i.activity}" references ${vname(vid)} but there is no booking` });
      if (b.loadIn && b.loadOut && i.track === 'production') {
        const bs = dtToAbs(day0, b.loadIn);
        const be = dtToAbs(day0, b.loadOut);
        if (span[0] < bs || span[1] > be) issues.push({ level: 'warning', kind: 'window', itemIds: [i.id], text: `${vname(vid)}: "${i.activity}" is outside their booked window (${b.loadIn.slice(11)}–${b.loadOut.slice(11)})` });
      }
    });
  });

  if (ev.ros.status !== 'draft') {
    ev.vendorBookings.filter((b) => b.status === 'requested' && ev.ros.items.some((i) => (i.vendorIds || []).includes(b.vendorId))).forEach((b) =>
      issues.push({ level: 'warning', kind: 'vendor', itemIds: [], text: `${vname(b.vendorId)} is on the ${ev.ros.status} run of show but has not confirmed the booking` }));
  }

  (ev.positions || []).forEach((p) => {
    const f = positionFill(ev, p);
    if (f.open > 0) issues.push({ level: f.unassigned > 0 ? 'danger' : 'warning', kind: 'staffing', itemIds: [], positionId: p.id, text: `${p.role} (${p.department}): ${f.confirmed}/${p.qty} confirmed${f.unassigned ? `, ${f.unassigned} unassigned` : ''}` });
  });
  return issues;
}

// ---------- planning (macro) timeline ----------
const TASK_TONE = (t, today) => (t.status === 'done' ? 'ok' : t.dueDate < today ? 'danger' : t.status === 'blocked' ? 'warn' : 'brand');

/** Months-to-event view: milestones, tasks, every vendor's lifecycle, payments, guest milestones. Units = days from start. */
export function planningTimeline(state, ev, today) {
  if (!ev.date) return null;
  const created = ev.createdAt?.slice(0, 10) ?? today;
  const start = [created, ...ev.tasks.map((t) => t.dueDate)].sort()[0];
  const end = addDays(ev.date, 21);
  const x = (d) => diffDays(start, d);
  const lanes = [];
  const signed = ev.contract?.signedAt?.slice(0, 10);
  const depositPaid = ev.payments.find((p) => ev.paymentSchedule.find((s) => s.invoiceId === p.invoiceId && s.isDeposit))?.at.slice(0, 10);
  const deadlineHeadcount = addDays(ev.date, -state.settings.finalHeadcountDays);
  const deadlineRsvp = addDays(ev.date, -state.settings.rsvpDeadlineDays);
  lanes.push({ id: 'milestones', label: 'Milestones', sub: stageLabel(ev.stage), items: [
    { id: 'm-in', start: x(created), label: 'Inquiry', milestone: true, showLabel: true, tone: 'info' },
    signed && { id: 'm-sign', start: x(signed), label: 'Contract signed', milestone: true, showLabel: true, tone: 'brand' },
    depositPaid && { id: 'm-dep', start: x(depositPaid), label: 'Deposit → date locked', milestone: true, showLabel: true, tone: 'ok' },
    ev.households.length && { id: 'm-rsvp', start: x(deadlineRsvp), label: 'RSVP deadline', milestone: true, showLabel: true, tone: 'warn' },
    { id: 'm-hc', start: x(deadlineHeadcount), label: 'Final headcount', milestone: true, showLabel: true, tone: 'warn' },
    { id: 'm-ev', start: x(ev.date), end: x(ev.date) + 1, label: 'EVENT', tone: 'danger' },
  ].filter(Boolean) });
  const cats = [...new Set(ev.tasks.map((t) => t.category))];
  cats.forEach((c) => lanes.push({ id: `t-${c}`, label: `Tasks · ${c}`, sub: `${ev.tasks.filter((t) => t.category === c && t.status === 'done').length}/${ev.tasks.filter((t) => t.category === c).length} done`, items: ev.tasks.filter((t) => t.category === c).map((t) => ({ id: t.id, start: x(t.dueDate), label: t.title, milestone: true, tone: TASK_TONE(t, today), href: 'planning', meta: `${t.status} · due ${t.dueDate}` })) }));
  ev.vendorBookings.filter((b) => b.status !== 'cancelled').forEach((b) => {
    const v = state.vendors.find((y) => y.id === b.vendorId);
    const from = (b.confirmedAt ?? signed ?? created).slice(0, 10);
    const until = (b.loadOut ?? ev.date).slice(0, 10);
    const its = [{ id: `vb-${b.id}`, start: x(from), end: Math.max(x(from) + 1, x(until) + 1), label: `${b.category} · ${b.status}`, tone: b.status === 'confirmed' ? 'brand-soft' : 'warn-soft', href: 'vendors' }];
    b.payments.forEach((p) => its.push({ id: p.id, start: x(p.dueDate), label: `Pay ${p.label}`, milestone: true, tone: p.status === 'paid' ? 'ok' : p.dueDate < today ? 'danger' : 'neutral', href: 'vendors', meta: `${p.amount} · ${p.status}` }));
    ev.tasks.filter((t) => t.assigneeType === 'vendor' && t.assigneeId === b.vendorId).forEach((t) => its.push({ id: `vt-${t.id}`, start: x(t.dueDate), label: t.title, milestone: true, tone: TASK_TONE(t, today), href: 'planning' }));
    lanes.push({ id: `v-${b.id}`, label: v?.name ?? 'Vendor', sub: `${b.model === 'pass_through' ? 'pass-through' : 'direct'}`, items: its });
  });
  ev.rfqs.filter((r) => !r.awardedVendorId).forEach((r) => lanes.push({ id: `rfq-${r.id}`, label: `RFQ · ${r.category}`, sub: `${r.responses.length}/${r.vendorIds.length} quotes`, items: [{ id: r.id, start: x(r.createdAt.slice(0, 10)), end: x(r.dueDate) + 1, label: 'Quotes due', tone: 'info-soft', href: 'vendors' }] }));
  lanes.push({ id: 'client-pay', label: 'Client payments', sub: `${ev.paymentSchedule.filter((p) => p.status === 'paid').length}/${ev.paymentSchedule.length} paid`, items: ev.paymentSchedule.map((p) => {
    const inv = ev.invoices.find((i) => i.id === p.invoiceId);
    const st = p.status === 'paid' ? 'paid' : inv ? invoiceStatus(ev, inv, today) : p.status;
    return { id: p.id, start: x(p.dueDate), label: p.label, milestone: true, tone: st === 'paid' ? 'ok' : st === 'overdue' ? 'danger' : 'neutral', href: 'finance', meta: `${p.amount} · ${st}` };
  }) });
  return { start, end, range: [0, x(end)], lanes, markers: [{ at: x(today), label: 'Today', tone: 'brand' }, { at: x(ev.date), label: 'Event', tone: 'danger' }], unit: 'day', toDate: (n) => addDays(start, n) };
}

// ---------- event-day (micro) timeline ----------
const TRACK_TONE = { guest: 'brand', production: 'warn' };

/** Hour-scale production Gantt. groupBy = function | vendor | resource | crew. Units = minutes from day0 00:00. */
export function dayTimeline(state, ev, groupBy = 'vendor', issues = []) {
  const days = eventDays(ev);
  if (!days.length) return null;
  const day0 = days[0];
  const flagged = new Set(issues.flatMap((i) => i.itemIds || []));
  const rosItem = (i, extra = {}) => {
    const [s, e] = rosSpan(ev, day0, i);
    return { id: i.id, start: s, end: e, label: i.activity, tone: flagged.has(i.id) ? 'danger' : TRACK_TONE[i.track] ?? 'brand', draggable: true, meta: `${i.start} · ${i.duration}m${i.cue ? ` · ${i.cue}` : ''}`, kind: 'ros', ...extra };
  };
  let lanes = [];
  if (groupBy === 'function') {
    lanes = ev.subEvents.map((se) => {
      const [s, e] = spanOf(day0, se.date ?? ev.date, se.start, se.end);
      return { id: se.id, label: se.name, sub: `${se.room || se.venue} · ${se.guestCount ?? '—'} pax`, items: [{ id: `se-${se.id}`, start: s, end: e, label: se.name, tone: 'brand-soft', background: true }, ...ev.ros.items.filter((i) => i.subEventId === se.id).map((i) => rosItem(i))] };
    });
  } else if (groupBy === 'vendor') {
    lanes = ev.vendorBookings.filter((b) => b.status !== 'cancelled').map((b) => {
      const v = state.vendors.find((y) => y.id === b.vendorId);
      const its = [];
      if (b.loadIn && b.loadOut) its.push({ id: `win-${b.id}`, start: dtToAbs(day0, b.loadIn), end: dtToAbs(day0, b.loadOut), label: 'Booked window', tone: b.status === 'confirmed' ? 'brand-soft' : 'warn-soft', background: true });
      ev.ros.items.filter((i) => (i.vendorIds || []).includes(b.vendorId)).forEach((i) => its.push(rosItem(i)));
      return { id: b.id, label: v?.name ?? 'Vendor', sub: `${b.category} · ${b.status}`, items: its };
    });
    const internal = ev.ros.items.filter((i) => !(i.vendorIds || []).length);
    if (internal.length) lanes.push({ id: 'in-house', label: 'In-house team', sub: 'no vendor', items: internal.map((i) => rosItem(i)) });
  } else if (groupBy === 'resource') {
    lanes = (ev.production?.resources || []).map((r) => ({ id: r.id, label: r.name, sub: r.exclusive ? 'exclusive — one at a time' : 'shared space', items: ev.ros.items.filter((i) => (i.resourceIds || []).includes(r.id)).map((i) => rosItem(i)) }));
  } else if (groupBy === 'crew') {
    const depts = [...new Set((ev.positions || []).map((p) => p.department))];
    lanes = depts.map((d) => ({ id: d, label: d, sub: `${(ev.positions || []).filter((p) => p.department === d).reduce((a, p) => a + p.qty, 0)} required`, items: (ev.positions || []).filter((p) => p.department === d).map((p) => {
      const [s, e] = spanOf(day0, p.date, p.start, p.end);
      const f = positionFill(ev, p);
      return { id: p.id, start: s, end: e, label: `${p.role} ${f.confirmed}/${p.qty}`, tone: f.open ? (f.unassigned ? 'danger' : 'warn') : 'ok', meta: `${p.source}${p.vendorId ? ` · ${state.vendors.find((v) => v.id === p.vendorId)?.name}` : ''}`, kind: 'position' };
    }) }));
    const unplanned = ev.shifts.filter((s) => !s.positionId);
    if (unplanned.length) lanes.push({ id: 'shifts', label: 'Other shifts', sub: 'not in staffing plan', items: unplanned.map((s) => { const [a, b] = spanOf(day0, s.date, s.start, s.end); return { id: s.id, start: a, end: b, label: `${state.staff.find((x) => x.id === s.staffId)?.name} · ${s.role}`, tone: s.confirmed ? 'ok' : 'warn' }; }) });
  }
  const all = lanes.flatMap((l) => l.items);
  if (!all.length) return { day0, lanes, range: [0, 1440], markers: [], shading: [], unit: 'minute' };
  const from = Math.floor((Math.min(...all.map((i) => i.start)) - 60) / 60) * 60;
  const to = Math.ceil((Math.max(...all.map((i) => i.end ?? i.start)) + 60) / 60) * 60;
  // shade time OUTSIDE venue access windows
  const windows = accessWindowsAbs(ev, day0).sort((a, b) => a.span[0] - b.span[0]);
  const shading = [];
  let cursor = from;
  windows.forEach((w) => { if (w.span[0] > cursor) shading.push({ start: cursor, end: w.span[0], label: 'No venue access' }); cursor = Math.max(cursor, w.span[1]); });
  if (windows.length && cursor < to) shading.push({ start: cursor, end: to, label: 'No venue access' });
  const markers = days.map((d) => { const c = curfewAbs(ev, day0, d); return c !== null && c > from && c < to ? { at: c, label: `Curfew ${ev.venue.curfew}`, tone: 'danger' } : null; }).filter(Boolean);
  return { day0, days, lanes, range: [from, to], markers, shading, unit: 'minute' };
}

/** Portfolio view: each planner's events from booking to close-out (workload). Units = days. */
export function workloadTimeline(state, today) {
  const start = addDays(today, -30);
  const end = addDays(today, 240);
  const x = (d) => diffDays(start, d);
  const active = state.events.filter((e) => e.date && e.plannerId && !['lost', 'cancelled_client', 'cancelled_eo', 'archived'].includes(e.stage) && e.date >= start);
  const planners = state.users.filter((u) => u.role === 'planner');
  const lanes = planners.map((u) => ({ id: u.id, label: u.name, sub: `${active.filter((e) => e.plannerId === u.id).length} events`, items: active.filter((e) => e.plannerId === u.id).map((e) => {
    const from = Math.max(0, x(addDays(e.date, -45)));
    return { id: e.id, start: from, end: x(addDays(e.date, 7)), label: e.name, tone: e.segment === 'social' ? 'brand-soft' : 'info-soft', meta: `${e.date} · ${stageLabel(e.stage)}`, href: e.id, peak: x(e.date) };
  }) }));
  return { start, lanes, range: [0, x(end)], markers: [{ at: x(today), label: 'Today', tone: 'brand' }], unit: 'day', toDate: (n) => addDays(start, n) };
}

export { minutesBetween };
