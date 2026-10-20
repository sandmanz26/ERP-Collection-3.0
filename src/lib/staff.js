// Crew cost, overtime and compliance rules (simplified, illustrative — not legal advice).
import { minutesBetween } from './dates.js';
import { round2 } from './money.js';

export const LABOR_RULES = {
  'US-CA': { label: 'California', dailyOT: 8, dailyDT: 12, otMult: 1.5, dtMult: 2, abcTest: true },
  'US-NY': { label: 'New York', weeklyOT: 40, otMult: 1.5 },
  'US-FL': { label: 'Florida', weeklyOT: 40, otMult: 1.5 },
  'US-TX': { label: 'Texas', weeklyOT: 40, otMult: 1.5 },
  EU: { label: 'EU Working Time Directive', maxDaily: 13, maxWeekly: 48, minRest: 11 },
  UK: { label: 'UK Working Time Regulations', maxDaily: 13, maxWeekly: 48, minRest: 11 },
  CH: { label: 'Swiss Labour Act', maxDaily: 12.5, maxWeekly: 50, minRest: 11 },
};

export function shiftHours(shift) {
  const start = shift.clockIn ? shift.clockIn.slice(11, 16) : shift.start;
  const end = shift.clockOut ? shift.clockOut.slice(11, 16) : shift.end;
  return round2(minutesBetween(start, end) / 60);
}

/** Returns { hours, regular, ot, dt, cost, warnings } for a shift. */
export function shiftCost(shift, staff) {
  const hours = shiftHours(shift);
  const rule = LABOR_RULES[staff.laborRegion] ?? {};
  const warnings = [];
  if (staff.rateType === 'event') {
    if (rule.maxDaily && hours > rule.maxDaily) warnings.push(`${hours}h exceeds ${rule.label} daily max ${rule.maxDaily}h`);
    return { hours, regular: hours, ot: 0, dt: 0, cost: round2(staff.rate), warnings };
  }
  let regular = hours;
  let ot = 0;
  let dt = 0;
  if (rule.dailyOT && hours > rule.dailyOT) {
    regular = rule.dailyOT;
    ot = Math.min(hours, rule.dailyDT ?? Infinity) - rule.dailyOT;
    if (rule.dailyDT && hours > rule.dailyDT) dt = hours - rule.dailyDT;
  }
  if (rule.maxDaily && hours > rule.maxDaily) warnings.push(`${hours}h exceeds ${rule.label} daily max ${rule.maxDaily}h`);
  const cost = round2(staff.rate * (regular + ot * (rule.otMult ?? 1.5) + dt * (rule.dtMult ?? 2)));
  if (ot > 0 || dt > 0) warnings.push(`Overtime (${rule.label}): ${round2(ot)}h OT, ${round2(dt)}h DT`);
  return { hours, regular: round2(regular), ot: round2(ot), dt: round2(dt), cost, warnings };
}

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(a, b) {
  if (a.date !== b.date) return false;
  let a1 = toMin(a.start), a2 = toMin(a.end), b1 = toMin(b.start), b2 = toMin(b.end);
  if (a2 <= a1) a2 += 1440;
  if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}

/** All shifts across events: [{...shift, eventId}] -> list of conflict pairs for staff. */
export function findConflicts(allShifts) {
  const conflicts = [];
  for (let i = 0; i < allShifts.length; i++) {
    for (let j = i + 1; j < allShifts.length; j++) {
      const a = allShifts[i];
      const b = allShifts[j];
      if (a.staffId === b.staffId && overlaps(a, b)) conflicts.push([a, b]);
    }
  }
  return conflicts;
}

/** Freelancer misclassification risk heuristic (e.g. California ABC test / AB5). */
export function classificationRisk(staff, shiftsLast90) {
  if (staff.type !== 'freelancer') return null;
  const rule = LABOR_RULES[staff.laborRegion] ?? {};
  if (rule.abcTest && shiftsLast90 >= 8)
    return `High misclassification risk: ${shiftsLast90} shifts in 90 days under ${rule.label} ABC test — review with counsel.`;
  if (shiftsLast90 >= 15) return `Frequent engagement (${shiftsLast90} shifts/90d) — review contractor status.`;
  return null;
}
