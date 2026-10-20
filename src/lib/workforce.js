// Event workforce: staffing plan (positions), who fills them (internal shifts or external workers), coverage and cost.
import { minutesBetween, diffDays } from './dates.js';
import { round2 } from './money.js';

export const DEPARTMENTS = ['Front of house', 'Catering & bar', 'Production', 'Guest services', 'Security', 'Talent', 'Logistics'];
export const SOURCES = [
  { id: 'internal', label: 'Internal staff' },
  { id: 'freelance', label: 'Freelance (direct hire)' },
  { id: 'outsourced', label: 'Outsourced (agency / vendor)' },
];
export const CREDENTIAL_ZONES = ['All access', 'Production', 'Backstage', 'Kitchen', 'Front of house', 'VIP'];
export const WORKER_STATUSES = ['invited', 'confirmed', 'declined', 'checked_in', 'checked_out', 'no_show'];
const FILLED = ['confirmed', 'checked_in', 'checked_out'];

export function positionHours(p) {
  return round2(minutesBetween(p.start, p.end) / 60);
}

/** Who fills a position: internal/freelance staff via shifts (positionId) + external workers. */
export function positionFill(ev, p) {
  const shifts = (ev.shifts || []).filter((s) => s.positionId === p.id);
  const workers = (ev.workers || []).filter((w) => w.positionId === p.id);
  const confirmed = shifts.filter((s) => s.confirmed).length + workers.filter((w) => FILLED.includes(w.status)).length;
  const assigned = shifts.length + workers.filter((w) => w.status !== 'declined').length;
  const checkedIn = workers.filter((w) => w.status === 'checked_in').length + shifts.filter((s) => s.clockIn && !s.clockOut).length;
  return { shifts, workers, assigned, confirmed, checkedIn, open: Math.max(0, p.qty - confirmed), unassigned: Math.max(0, p.qty - assigned) };
}

export function staffingSummary(ev) {
  const positions = ev.positions || [];
  const rows = positions.map((p) => ({ p, ...positionFill(ev, p) }));
  const required = rows.reduce((a, r) => a + r.p.qty, 0);
  const confirmed = rows.reduce((a, r) => a + Math.min(r.p.qty, r.confirmed), 0);
  const people = new Set([...(ev.shifts || []).map((s) => `s:${s.staffId}`), ...(ev.workers || []).filter((w) => w.status !== 'declined').map((w) => `w:${w.id}`)]).size;
  return { rows, required, confirmed, open: required - confirmed, people, pct: required ? round2((confirmed / required) * 100) : 100 };
}

/**
 * Workforce cost not already covered by internal shift costing:
 *  - outsourced: the agency bills the BOOKED headcount (qty × hours × rate), no matter how many names arrive
 *  - freelance: billed per confirmed external worker (qty actually engaged)
 *  - internal: costed through shifts (lib/staff.js), so 0 here
 */
export function positionCost(ev, p) {
  const h = positionHours(p);
  if (p.source === 'outsourced') return round2(p.qty * h * (p.rate || 0));
  if (p.source === 'freelance') {
    const ext = (ev.workers || []).filter((w) => w.positionId === p.id && FILLED.includes(w.status)).length;
    return round2(ext * h * (p.rate || 0));
  }
  return 0;
}

export function workforceCost(ev) {
  return round2((ev.positions || []).reduce((a, p) => a + positionCost(ev, p), 0));
}

/** Absolute minutes from the first event day — shared time axis for coverage & timelines. */
export function absMinutes(day0, date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return diffDays(day0, date) * 1440 + h * 60 + m;
}

export function spanOf(day0, date, start, end) {
  const s = absMinutes(day0, date, start);
  let e = absMinutes(day0, date, end);
  if (e <= s) e += 1440; // crosses midnight
  return [s, e];
}

/** Required vs confirmed headcount per time slot (default 30 min) for a department filter. */
export function coverage(ev, day0, { slot = 30, department } = {}) {
  const positions = (ev.positions || []).filter((p) => !department || p.department === department);
  if (!positions.length) return [];
  const spans = positions.map((p) => ({ p, span: spanOf(day0, p.date, p.start, p.end), fill: positionFill(ev, p) }));
  const from = Math.floor(Math.min(...spans.map((x) => x.span[0])) / slot) * slot;
  const to = Math.ceil(Math.max(...spans.map((x) => x.span[1])) / slot) * slot;
  const out = [];
  for (let t = from; t < to; t += slot) {
    const active = spans.filter((x) => x.span[0] < t + slot && x.span[1] > t);
    const required = active.reduce((a, x) => a + x.p.qty, 0);
    const filled = active.reduce((a, x) => a + Math.min(x.p.qty, x.fill.confirmed), 0);
    out.push({ t, required, filled, gap: required - filled });
  }
  return out;
}

export function credentialCode(ev, worker) {
  return `CRW-${ev.id.slice(-4).toUpperCase()}-${worker.id.slice(-5).toUpperCase()}`;
}
