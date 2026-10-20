// Date capacity & hold logic.
import { weekday, diffDays } from './dates.js';
import { ACTIVE_BOOKED_STAGES } from './lifecycle.js';

export function capacityFor(date, capacityCfg) {
  const wd = weekday(date);
  return capacityCfg.byWeekday?.[wd] ?? capacityCfg.default;
}

/** Events that consume capacity on a date: booked-or-later (not cancelled) events. */
export function bookedOn(date, events) {
  return events.filter((e) => e.date === date && ACTIVE_BOOKED_STAGES.includes(e.stage));
}

export function activeHoldsOn(date, holds) {
  return holds
    .filter((h) => h.date === date && h.status === 'active')
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Availability summary for a date.
 * - capacity: max events for the date (configurable per weekday)
 * - booked:   events already booked (consume capacity, locked or not)
 * - holds:    ordered active holds (first hold, second hold, ...)
 * - free:     remaining slots for new bookings without conflict
 */
export function availability(date, { events, holds, capacity }) {
  const cap = capacityFor(date, capacity);
  const booked = bookedOn(date, events);
  const h = activeHoldsOn(date, holds);
  const free = Math.max(0, cap - booked.length);
  // holds ahead of a new hold that would compete for the free slots
  const status = free === 0 ? 'full' : h.length >= free ? 'held' : 'available';
  return { date, capacity: cap, booked, holds: h, free, status };
}

export function holdDaysLeft(hold, today) {
  return diffDays(today, hold.expiresAt);
}

export function nextPriority(date, holds) {
  const h = activeHoldsOn(date, holds);
  return h.length ? Math.max(...h.map((x) => x.priority)) + 1 : 1;
}
