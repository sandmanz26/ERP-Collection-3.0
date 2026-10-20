// Workforce (staffing plan, internal/freelance/outsourced people, credentials, crew check-in),
// production setup (venue resources, access windows) and the visual site plan.
import { fmtDate } from '../../lib/dates.js';
import { positionFill, credentialCode } from '../../lib/workforce.js';
import { assert } from './common.js';

function parts(ev) {
  ev.positions ??= [];
  ev.workers ??= [];
  ev.production ??= { accessWindows: [], resources: [] };
  ev.sitePlan ??= { rooms: [] };
  return ev;
}

export const workforceHandlers = {
  POSITION_ADD(ctx, { eventId, data }) {
    const ev = parts(ctx.ev(eventId));
    const p = { id: ctx.id('pos'), qty: 1, date: ev.date, start: '16:00', end: '23:59', source: 'internal', vendorId: null, rate: 0, zones: ['Front of house'], notes: '', ...data, qty: Number(data.qty) || 1, rate: Number(data.rate) || 0 };
    ev.positions.push(p);
    const agency = p.vendorId ? ctx.state.vendors.find((v) => v.id === p.vendorId)?.name : null;
    if (agency) ctx.notify({ toRoles: ['vendor'], eventId, level: 'info', text: `${ev.name}: ${p.qty} × ${p.role} requested from ${agency} (${fmtDate(p.date)} ${p.start}–${p.end}). Please submit your crew roster.` });
    return { summary: `Staffing plan: ${p.qty} × ${p.role} (${p.department}, ${p.source}${agency ? ` via ${agency}` : ''}) ${p.start}–${p.end}`, eventId };
  },
  POSITION_UPDATE(ctx, { eventId, positionId, patch }) {
    const ev = parts(ctx.ev(eventId));
    const p = ev.positions.find((x) => x.id === positionId);
    Object.assign(p, patch);
    return { summary: `Position "${p.role}" updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  POSITION_REMOVE(ctx, { eventId, positionId }) {
    const ev = parts(ctx.ev(eventId));
    const p = ev.positions.find((x) => x.id === positionId);
    ev.positions = ev.positions.filter((x) => x.id !== positionId);
    ev.workers = ev.workers.filter((w) => w.positionId !== positionId);
    ev.shifts.forEach((s) => { if (s.positionId === positionId) s.positionId = null; });
    return { summary: `Position removed: ${p.role}`, eventId };
  },
  /** Internal staff or registered freelancer → creates a shift linked to the position (OT & conflict rules apply). */
  POSITION_ASSIGN_STAFF(ctx, { eventId, positionId, staffId }) {
    const ev = parts(ctx.ev(eventId));
    const p = ev.positions.find((x) => x.id === positionId);
    assert(!ev.shifts.some((s) => s.positionId === positionId && s.staffId === staffId), 'Already assigned');
    const st = ctx.state.staff.find((s) => s.id === staffId);
    ev.shifts.push({ id: ctx.id('sh'), staffId, positionId, role: p.role, date: p.date, start: p.start, end: p.end, confirmed: false });
    ctx.notify({ toRoles: ['crew'], eventId, level: 'info', text: `${st?.name}: you were scheduled as ${p.role} on ${fmtDate(p.date)} ${p.start}–${p.end}. Please confirm.` });
    return { summary: `${st?.name} assigned to ${p.role} (${positionFill(ev, p).assigned}/${p.qty})`, eventId };
  },
  /** External person: agency-supplied (outsourced) or a one-off freelancer not in the staff directory. */
  WORKER_ADD(ctx, { eventId, positionId, workers }) {
    const ev = parts(ctx.ev(eventId));
    const p = ev.positions.find((x) => x.id === positionId);
    assert(ctx.user.role !== 'vendor' || p.vendorId === ctx.user.vendorId, 'Agencies can only submit crew for positions booked with them');
    const added = workers.filter((w) => w.name?.trim()).map((w) => {
      const worker = { id: ctx.id('wk'), positionId, name: w.name.trim(), phone: w.phone || '', email: w.email || '', vendorId: p.vendorId ?? null, company: w.company || (p.vendorId ? ctx.state.vendors.find((v) => v.id === p.vendorId)?.name : 'Freelance'), status: w.status || 'invited', zones: [...(p.zones || [])], checkIn: null, checkOut: null, addedBy: ctx.user.id };
      worker.credentialCode = credentialCode(ev, worker);
      return worker;
    });
    assert(added.length, 'Enter at least one name');
    ev.workers.push(...added);
    return { summary: `${added.length} worker(s) added to ${p.role}${ctx.user.role === 'vendor' ? ` by agency ${ctx.user.name}` : ''}: ${added.map((w) => w.name).join(', ')}`, eventId };
  },
  WORKER_UPDATE(ctx, { eventId, workerId, patch }) {
    const ev = parts(ctx.ev(eventId));
    const w = ev.workers.find((x) => x.id === workerId);
    assert(ctx.user.role !== 'vendor' || w.vendorId === ctx.user.vendorId, 'Agencies can only edit their own crew');
    Object.assign(w, patch);
    return { summary: `Worker ${w.name}: ${Object.entries(patch).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`).join(', ')}`, eventId };
  },
  WORKER_REMOVE(ctx, { eventId, workerId }) {
    const ev = parts(ctx.ev(eventId));
    const w = ev.workers.find((x) => x.id === workerId);
    ev.workers = ev.workers.filter((x) => x.id !== workerId);
    return { summary: `Worker removed: ${w.name}`, eventId };
  },
  /** Day-of crew check-in by credential code (QR) — external workers or staff shifts. */
  CREW_CHECKIN(ctx, { eventId, code, direction = 'in' }) {
    const ev = parts(ctx.ev(eventId));
    const w = ev.workers.find((x) => x.credentialCode.toLowerCase() === String(code).trim().toLowerCase() || x.id === code);
    assert(w, `Credential "${code}" not found for this event`);
    assert(w.status !== 'declined', `${w.name} declined this job`);
    const now = new Date().toISOString();
    if (direction === 'in') { w.status = 'checked_in'; w.checkIn = now; } else { w.status = 'checked_out'; w.checkOut = now; }
    const p = ev.positions.find((x) => x.id === w.positionId);
    return { summary: `Crew check-${direction}: ${w.name} (${p?.role}, ${w.company})`, eventId };
  },
  CREW_NO_SHOW(ctx, { eventId, workerId }) {
    const ev = parts(ctx.ev(eventId));
    const w = ev.workers.find((x) => x.id === workerId);
    w.status = 'no_show';
    const p = ev.positions.find((x) => x.id === w.positionId);
    ctx.notify({ toRoles: ['planner', 'production', 'vendor'], eventId, level: 'danger', text: `NO-SHOW: ${w.name} (${p?.role}, ${w.company}) at ${ev.name} — replacement needed.` });
    return { summary: `No-show recorded: ${w.name} (${p?.role})`, eventId };
  },
  // ----- production setup -----
  RESOURCE_ADD(ctx, { eventId, name, exclusive }) {
    const ev = parts(ctx.ev(eventId));
    ev.production.resources.push({ id: ctx.id('res'), name, exclusive: !!exclusive });
    return { summary: `Venue resource added: ${name}${exclusive ? ' (exclusive)' : ''}`, eventId };
  },
  RESOURCE_REMOVE(ctx, { eventId, resourceId }) {
    const ev = parts(ctx.ev(eventId));
    const r = ev.production.resources.find((x) => x.id === resourceId);
    ev.production.resources = ev.production.resources.filter((x) => x.id !== resourceId);
    ev.ros.items.forEach((i) => { i.resourceIds = (i.resourceIds || []).filter((x) => x !== resourceId); });
    return { summary: `Venue resource removed: ${r.name}`, eventId };
  },
  ACCESS_WINDOW_SET(ctx, { eventId, windows }) {
    const ev = parts(ctx.ev(eventId));
    ev.production.accessWindows = windows;
    return { summary: `Venue access windows: ${windows.map((w) => `${w.date} ${w.start}–${w.end}`).join('; ') || 'none'}`, eventId };
  },
  // ----- site plan -----
  SITE_ROOM_ADD(ctx, { eventId, name, width, height }) {
    const ev = parts(ctx.ev(eventId));
    ev.sitePlan.rooms.push({ id: ctx.id('room'), name, width: Number(width) || 30, height: Number(height) || 20, elements: [] });
    return { summary: `Site plan: room "${name}" (${width}×${height} m) added`, eventId };
  },
  SITE_ELEMENT_ADD(ctx, { eventId, roomId, element }) {
    const ev = parts(ctx.ev(eventId));
    const room = ev.sitePlan.rooms.find((r) => r.id === roomId);
    const el = { id: ctx.id('el'), x: room.width / 2 - 1, y: room.height / 2 - 1, w: 2, h: 2, shape: 'rect', vendorId: null, ...element };
    room.elements.push(el);
    return { summary: `Site plan (${room.name}): placed ${el.label}`, eventId };
  },
  SITE_ELEMENT_UPDATE(ctx, { eventId, roomId, elementId, patch }) {
    const ev = parts(ctx.ev(eventId));
    const room = ev.sitePlan.rooms.find((r) => r.id === roomId);
    const el = room.elements.find((x) => x.id === elementId);
    Object.assign(el, patch);
    const moved = 'x' in patch || 'y' in patch;
    return { summary: `Site plan (${room.name}): ${el.label} ${moved ? `moved to ${el.x.toFixed(1)}, ${el.y.toFixed(1)} m` : `updated (${Object.keys(patch).join(', ')})`}`, eventId };
  },
  SITE_ELEMENT_REMOVE(ctx, { eventId, roomId, elementId }) {
    const ev = parts(ctx.ev(eventId));
    const room = ev.sitePlan.rooms.find((r) => r.id === roomId);
    const el = room.elements.find((x) => x.id === elementId);
    room.elements = room.elements.filter((x) => x.id !== elementId);
    return { summary: `Site plan (${room.name}): removed ${el.label}`, eventId };
  },
};
