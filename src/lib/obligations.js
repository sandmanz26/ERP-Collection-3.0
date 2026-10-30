// Contractual & safety obligations that sit outside the client contract but can still sink an event:
// hotel room blocks (attrition), venue/caterer guarantees, severe allergies, permits and fire capacity,
// postponement terms and multi-function templates. Pure functions — handlers and UI read the same rules.
// Research notes and sources: docs/PROCESS_REVIEW.md.
import { addDays, diffDays } from './dates.js';
import { headcount } from './derived.js';

const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- hotel room blocks ----------
 * A block holds `rooms` rooms for `nights` nights until the cutoff date. After the cutoff the hotel counts
 * the rooms actually booked (`pickedUp`); below `attritionPct` of the block it invoices the shortfall
 * (typically 75–90%). Rooms booked outside the block count only if the contract has an audit clause. */
export function roomBlockStatus(block, today) {
  const credited = block.pickedUp + (block.auditClause ? block.outsideBookings || 0 : 0);
  const minRooms = Math.ceil((block.rooms * block.attritionPct) / 100);
  const shortfall = Math.max(0, minRooms - credited);
  const exposure = round2(shortfall * block.rate * block.nights);
  const daysToCutoff = diffDays(today, block.cutoffDate);
  const pct = block.rooms ? Math.round((credited / block.rooms) * 100) : 0;
  let level = 'ok';
  if (block.status === 'settled') level = 'settled';
  else if (shortfall > 0 && daysToCutoff < 0) level = 'danger';
  else if (shortfall > 0 && daysToCutoff <= 21) level = 'warning';
  return { credited, minRooms, shortfall, exposure, daysToCutoff, pct, level, pastCutoff: daysToCutoff < 0 };
}

export function roomBlockIssues(ev, today) {
  return (ev.roomBlocks || []).map((b) => ({ b, s: roomBlockStatus(b, today) })).filter((x) => x.s.level === 'warning' || x.s.level === 'danger');
}

/* ---------- guarantees ----------
 * Caterers/venues bill the guarantee or the actual count, whichever is greater; after the guarantee date the
 * count may only go up (some venues allow a small reduction, e.g. 5%). The kitchen prepares a small overset. */
export function guaranteeCheck(state, ev, count) {
  const shortfalls = ev.vendorBookings
    .filter((b) => b.status !== 'cancelled' && b.minGuarantee && count < b.minGuarantee)
    .map((b) => ({ booking: b, category: b.category, min: b.minGuarantee, short: b.minGuarantee - count }));
  const pct = state.settings.guaranteeReductionPct ?? 5;
  const prev = ev.finalHeadcount;
  const floor = prev ? Math.ceil(prev * (1 - pct / 100)) : null;
  return { shortfalls, reductionFloor: floor, reductionPct: pct, overset: Math.ceil(count * ((state.settings.oversetPct ?? 3) / 100)) };
}

/* ---------- severe allergies ----------
 * Allergies belong to a named guest at a table, not a headcount. Severe (anaphylaxis) cases get a sheet the
 * caterer signs; any change after the sign-off makes it stale. */
export function allergySheet(ev) {
  const tables = Object.fromEntries((ev.tables || []).map((t) => [t.id, t.name]));
  const rows = ev.households.flatMap((h) => h.guests
    .filter((g) => (g.dietary || '').trim() || g.allergySeverity)
    .filter((g) => Object.values(g.rsvp).includes('yes') || Object.values(g.rsvp).every((v) => v === 'pending'))
    .map((g) => ({ id: g.id, name: g.name, household: h.name, dietary: g.dietary || '', severity: g.allergySeverity || (/(allerg|anaphyla|epipen)/i.test(g.dietary || '') ? 'allergy' : 'preference'), table: tables[g.tableId] ?? null, meal: g.meal || '' })));
  const rank = { severe: 0, allergy: 1, intolerance: 2, preference: 3 };
  rows.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.table ?? 'zz').localeCompare(b.table ?? 'zz'));
  const severe = rows.filter((r) => r.severity === 'severe');
  const fingerprint = severe.map((r) => `${r.id}:${r.dietary}:${r.table}`).join('|');
  const signoff = ev.allergySignoff || null;
  return { rows, severe, unseated: severe.filter((r) => !r.table), fingerprint, signoff, stale: !!signoff && signoff.fingerprint !== fingerprint, signed: !!signoff && signoff.fingerprint === fingerprint };
}

export function allergyIssues(ev, today) {
  const s = allergySheet(ev);
  if (!s.severe.length) return [];
  const days = ev.date ? diffDays(today, ev.date) : 999;
  const out = [];
  if (s.unseated.length && days <= 21) out.push({ level: 'warning', text: `${s.unseated.length} guest(s) with a severe allergy have no table`, detail: s.unseated.map((r) => r.name).join(', ') });
  if (!s.signed && days <= 10) out.push({ level: days <= 3 ? 'danger' : 'warning', text: s.stale ? 'Allergy sheet changed since the caterer signed it' : 'Caterer has not signed the severe-allergy sheet', detail: `${s.severe.length} severe case(s): ${s.severe.map((r) => `${r.name} (${r.dietary})`).join(', ')}` });
  return out;
}

/* ---------- permits & capacity ---------- */
const PERMIT_RULES = [
  { kind: 'crowd', when: (c) => c.country === 'ID' && c.guests >= 300, title: (c) => 'Izin keramaian (crowd permit)', authority: (c) => (c.guests >= 1000 ? 'Polres / Polresta' : 'Polsek'), leadDays: 14,
    why: (c) => `${c.guests} guests — gatherings of 300+ need a police crowd permit (Polsek; Polres above 1,000). Needs a letter from the kelurahan and the organiser's KTP/KK.` },
  { kind: 'pyro', when: (c) => c.pyro, title: () => 'Pyrotechnics / sparkler approval', authority: () => 'Venue + fire authority', leadDays: 21, why: () => 'Sparklers or fireworks are planned — venues and the fire authority require written approval.' },
  { kind: 'noise', when: (c) => c.lateOutdoor, title: () => 'Noise / late-hours variance', authority: () => 'City / venue', leadDays: 30, why: (c) => `${c.lateOutdoor} runs past 22:00 outdoors — amplified music after the local curfew needs a variance.` },
  { kind: 'road', when: (c) => c.roadClosure, title: () => 'Road use / closure permit', authority: (c) => (c.country === 'ID' ? 'Kepolisian (per road class)' : 'City traffic authority'), leadDays: 30, why: () => 'The plan uses a public road (procession, valet, shuttle stop).' },
];

export function permitContext(state, ev) {
  const j = state.settings.jurisdictions?.find?.((x) => x.id === ev.jurisdictionId);
  const country = j?.country ?? (ev.jurisdictionId || '').split('-')[0];
  const text = [...(ev.changeOrders || []).filter((c) => c.status !== 'rejected').map((c) => `${c.title} ${c.description || ''}`), ...(ev.ros?.items || []).map((i) => i.title || ''), ...(ev.subEvents || []).map((s) => s.notes || '')].join(' ');
  const outdoor = /(terrace|garden|rooftop|beach|lawn|outdoor|taman|pantai)/i;
  const late = (ev.subEvents || []).find((s) => outdoor.test(`${s.venue} ${s.room}`) && s.end && (s.end > '22:00' || s.end < s.start));
  return { country, guests: Math.max(ev.finalHeadcount || 0, ev.guestCount || 0), pyro: /(sparkler|firework|kembang api|pyro)/i.test(text), lateOutdoor: late ? late.name : null, roadClosure: !!ev.venue?.roadClosure };
}

export function permitPlan(state, ev, today) {
  const c = permitContext(state, ev);
  const recorded = ev.permits || [];
  const suggested = PERMIT_RULES.filter((r) => r.when(c)).map((r) => ({ kind: r.kind, title: r.title(c), authority: r.authority(c), why: r.why(c), dueDate: ev.date ? addDays(ev.date, -r.leadDays) : null }));
  const rows = [
    ...recorded.map((p) => ({ ...p, recorded: true })),
    ...suggested.filter((s) => !recorded.some((p) => p.kind === s.kind)).map((s) => ({ ...s, id: null, status: 'needed', recorded: false })),
  ].map((p) => ({ ...p, overdue: !['approved', 'not_required'].includes(p.status) && p.dueDate && p.dueDate < today }));
  return { context: c, rows, open: rows.filter((p) => !['approved', 'not_required'].includes(p.status)) };
}

/** Confirmed guests per function vs the room's legal capacity (fire code), and the venue capacity overall. */
export function capacityIssues(ev) {
  const hc = headcount(ev);
  const out = [];
  (ev.subEvents || []).forEach((s) => {
    const cap = Number(s.capacity) || 0;
    const n = hc.bySubEvent[s.id] || 0;
    if (cap && n > cap) out.push({ level: 'danger', subEventId: s.id, text: `${s.name}: ${n} confirmed for a room licensed for ${cap}`, over: n - cap });
  });
  const vcap = Number(ev.venue?.capacity) || 0;
  const peak = Math.max(ev.finalHeadcount || 0, hc.confirmed);
  if (vcap && peak > vcap) out.push({ level: 'danger', text: `${peak} guests for a venue licensed for ${vcap}`, over: peak - vcap });
  return out;
}

/* ---------- postponement terms ---------- */
export function postponementTerms(state, ev) {
  const t = { feePct: state.settings.postponementFeePct ?? 10, maxCount: state.settings.postponementMax ?? 1 };
  const used = (ev.postponements || []).length;
  const base = ev.contract?.total || 0;
  return { feePct: t.feePct, maxCount: t.maxCount, used, allowed: used < t.maxCount, suggestedFee: round2((base * t.feePct) / 100) };
}

/* ---------- multi-function templates (cultural & multi-day weddings) ---------- */
export const FUNCTION_TEMPLATES = [
  { id: 'id_akad_resepsi', label: 'Indonesian — akad + resepsi', functions: [
    { name: 'Pengajian & siraman', offset: -1, start: '09:00', end: '12:00', share: 0.25 },
    { name: 'Akad nikah', offset: 0, start: '08:00', end: '10:00', share: 0.35 },
    { name: 'Resepsi', offset: 0, start: '11:00', end: '14:00', share: 1 },
  ] },
  { id: 'in_multi_day', label: 'Indian — mehndi, sangeet, wedding, reception', functions: [
    { name: 'Mehndi', offset: -2, start: '14:00', end: '18:00', share: 0.5 },
    { name: 'Sangeet', offset: -1, start: '19:00', end: '23:30', share: 0.8 },
    { name: 'Wedding ceremony', offset: 0, start: '10:00', end: '13:00', share: 1 },
    { name: 'Reception', offset: 0, start: '19:00', end: '23:30', share: 1 },
  ] },
  { id: 'cn_tea_banquet', label: 'Chinese — tea ceremony + banquet', functions: [
    { name: 'Tea ceremony', offset: 0, start: '10:00', end: '12:00', share: 0.2 },
    { name: 'Wedding banquet', offset: 0, start: '18:30', end: '22:30', share: 1 },
  ] },
  { id: 'western_weekend', label: 'Destination weekend — welcome, ceremony, reception, brunch', functions: [
    { name: 'Welcome dinner', offset: -1, start: '19:00', end: '22:00', share: 0.5 },
    { name: 'Ceremony', offset: 0, start: '16:00', end: '16:45', share: 1 },
    { name: 'Reception', offset: 0, start: '18:00', end: '23:30', share: 1 },
    { name: 'Farewell brunch', offset: 1, start: '10:00', end: '12:30', share: 0.4 },
  ] },
  { id: 'conference_2day', label: 'Conference — 2 days + gala', functions: [
    { name: 'Day 1 sessions', offset: 0, start: '08:30', end: '17:30', share: 1 },
    { name: 'Gala dinner', offset: 0, start: '19:00', end: '22:30', share: 0.7 },
    { name: 'Day 2 sessions', offset: 1, start: '08:30', end: '16:00', share: 0.9 },
  ] },
];

/** Every obligation issue for one event, shaped for next steps / blockers. */
export function obligationIssues(state, ev, today) {
  const out = [];
  roomBlockIssues(ev, today).forEach(({ b, s }) => out.push({ area: 'rooms', level: s.level, text: s.pastCutoff ? `${b.hotel}: room block ${s.shortfall} room(s) short after cutoff` : `${b.hotel}: ${b.pickedUp}/${b.rooms} rooms booked, cutoff in ${s.daysToCutoff} day(s)`, detail: `Attrition ${b.attritionPct}% → minimum ${s.minRooms} rooms. Exposure ${s.exposure} ${b.currency || ev.currency}.`, blockId: b.id }));
  allergyIssues(ev, today).forEach((a) => out.push({ area: 'allergy', ...a }));
  capacityIssues(ev).forEach((c) => out.push({ area: 'capacity', ...c, detail: 'Over the licensed capacity — move the function, cap RSVPs or get written approval.' }));
  if (ev.date) permitPlan(state, ev, today).open.filter((p) => p.overdue || diffDays(today, p.dueDate) <= 14).forEach((p) => out.push({ area: 'permit', level: p.overdue ? 'danger' : 'warning', text: `${p.title}${p.overdue ? ' — application overdue' : ` — apply by ${p.dueDate}`}`, detail: `${p.authority}. ${p.why || ''}`.trim() }));
  return out;
}
