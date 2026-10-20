// Date helpers. All dates stored as ISO strings "YYYY-MM-DD" (date-only) or full ISO timestamps.
const DAY = 86400000;

export function todayISO() {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = parseDate(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', ...opts });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function weekday(iso) {
  return parseDate(iso).getDay(); // 0 = Sunday
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function nowISO() {
  return new Date().toISOString();
}

/** "HH:MM" + minutes -> "HH:MM" */
export function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function minutesBetween(a, b) {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d < 0) d += 1440; // crosses midnight
  return d;
}
