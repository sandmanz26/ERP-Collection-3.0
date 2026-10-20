// Run-of-show helpers.
import { addMinutes } from './dates.js';

export function sortRos(items) {
  return [...items].sort((a, b) => (a.subEventId || '').localeCompare(b.subEventId || '') || a.start.localeCompare(b.start));
}

/**
 * Delay an item by `mins`: the item and every later item in the same sub-event & track shift.
 */
export function shiftFrom(items, itemId, mins) {
  const target = items.find((i) => i.id === itemId);
  if (!target) return items;
  return items.map((i) => {
    if (i.subEventId === target.subEventId && i.track === target.track && i.start >= target.start && i.liveStatus !== 'done') {
      return { ...i, start: addMinutes(i.start, mins), delayedBy: (i.delayedBy || 0) + mins };
    }
    return i;
  });
}

export function rosForVendor(items, vendorId) {
  return items.filter((i) => (i.vendorIds || []).includes(vendorId));
}

export function rosForStaff(items, staffId) {
  return items.filter((i) => i.ownerStaffId === staffId);
}
