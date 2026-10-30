// Room blocks & attrition, severe-allergy sign-off, permits, venue capacity and multi-function templates.
import { assert } from './common.js';
import { addDays, fmtDate } from '../../lib/dates.js';
import { roomBlockStatus, allergySheet, permitPlan, FUNCTION_TEMPLATES } from '../../lib/obligations.js';
import { opsHandlers } from './ops.js';

const findBlock = (ev, blockId) => {
  const b = (ev.roomBlocks || []).find((x) => x.id === blockId);
  assert(b, 'Room block not found');
  return b;
};

export const obligationHandlers = {
  ROOM_BLOCK_ADD(ctx, { eventId, hotel, rooms, nights, rate, cutoffDate, attritionPct, auditClause }) {
    const ev = ctx.ev(eventId);
    assert(hotel && hotel.trim(), 'Hotel name is required');
    const n = Number(rooms); const nt = Number(nights); const r = Number(rate); const pct = Number(attritionPct);
    assert(n > 0 && nt > 0, 'Rooms and nights must be at least 1');
    assert(r >= 0, 'Room rate cannot be negative');
    assert(pct >= 0 && pct <= 100, 'Attrition must be between 0 and 100%');
    assert(cutoffDate, 'Cutoff date is required');
    assert(!ev.date || cutoffDate < ev.date, 'The cutoff must be before the event date');
    (ev.roomBlocks ??= []).push({ id: ctx.id('rb'), hotel: hotel.trim(), rooms: n, nights: nt, rate: r, currency: ev.currency, cutoffDate, attritionPct: pct, auditClause: !!auditClause, pickedUp: 0, outsideBookings: 0, status: 'open', log: [] });
    return { summary: `Room block added: ${hotel} — ${n} rooms × ${nt} nights, cutoff ${fmtDate(cutoffDate)}, attrition ${pct}%`, eventId };
  },
  /** The hotel's pick-up report: rooms booked inside the block (and outside it, credited only with an audit clause). */
  ROOM_BLOCK_PICKUP(ctx, { eventId, blockId, pickedUp, outsideBookings }) {
    const ev = ctx.ev(eventId);
    const b = findBlock(ev, blockId);
    assert(b.status === 'open', 'This block is already settled');
    const n = Number(pickedUp);
    assert(Number.isInteger(n) && n >= 0, 'Rooms booked must be a whole number');
    assert(n <= b.rooms, `Only ${b.rooms} rooms are in the block — negotiate more rooms before recording ${n}`);
    b.pickedUp = n;
    if (outsideBookings !== undefined) b.outsideBookings = Math.max(0, Number(outsideBookings) || 0);
    b.log.push({ at: new Date().toISOString(), by: ctx.user?.id, text: `Pick-up ${n}/${b.rooms}${b.outsideBookings ? ` (+${b.outsideBookings} outside)` : ''}` });
    const s = roomBlockStatus(b, ctx.today);
    return { summary: `${b.hotel}: ${n}/${b.rooms} rooms booked (minimum ${s.minRooms})`, eventId };
  },
  /** Releasing rooms is free before the cutoff — the cheapest way to shrink attrition exposure. */
  ROOM_BLOCK_RELEASE(ctx, { eventId, blockId, rooms }) {
    const ev = ctx.ev(eventId);
    const b = findBlock(ev, blockId);
    assert(b.status === 'open', 'This block is already settled');
    assert(ctx.today <= b.cutoffDate, `The cutoff (${fmtDate(b.cutoffDate)}) has passed — rooms can no longer be released without penalty`);
    const n = Number(rooms);
    assert(Number.isInteger(n) && n > 0, 'Release at least one room');
    assert(b.rooms - n >= b.pickedUp, `${b.pickedUp} rooms are already booked — the block cannot go below that`);
    b.rooms -= n;
    b.log.push({ at: new Date().toISOString(), by: ctx.user?.id, text: `Released ${n} room(s) → ${b.rooms}` });
    return { summary: `${b.hotel}: released ${n} room(s) before the cutoff — block now ${b.rooms}`, eventId };
  },
  /** After the cutoff the hotel invoices the shortfall. Optionally passed to the client as a Change Order. */
  ROOM_BLOCK_SETTLE(ctx, { eventId, blockId, passToClient }) {
    const ev = ctx.ev(eventId);
    const b = findBlock(ev, blockId);
    assert(b.status === 'open', 'This block is already settled');
    assert(ctx.today > b.cutoffDate, `Settle after the cutoff (${fmtDate(b.cutoffDate)}) — until then, update the pick-up or release rooms`);
    const s = roomBlockStatus(b, ctx.today);
    b.status = 'settled';
    b.attritionCharge = s.exposure;
    b.settledAt = new Date().toISOString();
    b.log.push({ at: b.settledAt, by: ctx.user?.id, text: s.exposure ? `Attrition invoiced: ${s.shortfall} room(s) × ${b.nights} night(s)` : 'Block met — no attrition' });
    if (s.exposure > 0 && passToClient) {
      assert(ev.contract?.immutable, 'Attrition can be passed to the client only on a signed contract');
      opsHandlers.CO_CREATE(ctx, { eventId, data: { title: `Hotel attrition — ${b.hotel}`, description: `${s.shortfall} room(s) below the ${b.attritionPct}% minimum (${b.pickedUp}/${b.rooms} booked at cutoff ${b.cutoffDate}).`, lines: [{ name: `Attrition ${b.hotel}`, category: 'Accommodation', amount: s.exposure, cost: s.exposure }] } });
      b.coNumber = ev.changeOrders[ev.changeOrders.length - 1].number;
    }
    return { summary: s.exposure ? `${b.hotel}: attrition ${s.exposure} ${b.currency} for ${s.shortfall} room(s)${b.coNumber ? ` — ${b.coNumber} drafted for the client` : ' — absorbed by the agency'}` : `${b.hotel}: block met, nothing owed`, eventId };
  },

  /** The caterer confirms the severe-allergy sheet; the snapshot goes stale when any severe case changes. */
  ALLERGY_SIGNOFF(ctx, { eventId, by }) {
    const ev = ctx.ev(eventId);
    assert(by && by.trim(), 'Who signed for the caterer? (name)');
    const s = allergySheet(ev);
    assert(s.severe.length, 'No severe allergies recorded — nothing to sign');
    assert(!s.unseated.length, `Seat every guest with a severe allergy first: ${s.unseated.map((r) => r.name).join(', ')}`);
    ev.allergySignoff = { by: by.trim(), at: new Date().toISOString(), recordedBy: ctx.user?.id, fingerprint: s.fingerprint, count: s.severe.length };
    return { summary: `Allergy sheet signed by ${by.trim()} for the caterer (${s.severe.length} severe case(s))`, eventId };
  },

  PERMIT_SET(ctx, { eventId, kind, title, authority, dueDate, status, reference }) {
    const ev = ctx.ev(eventId);
    const valid = ['needed', 'applied', 'approved', 'not_required'];
    assert(valid.includes(status), 'Unknown permit status');
    if (status === 'approved') assert(reference && reference.trim(), 'Record the permit number or approval reference');
    const list = (ev.permits ??= []);
    let p = list.find((x) => x.kind === kind);
    if (!p) {
      const sug = permitPlan(ctx.state, ev, ctx.today).rows.find((r) => r.kind === kind);
      assert(title || sug, 'Permit title is required');
      p = { id: ctx.id('pm'), kind: kind || ctx.id('custom'), title: title || sug.title, authority: authority || sug?.authority || '', dueDate: dueDate || sug?.dueDate || null, why: sug?.why || '', status: 'needed', reference: '', log: [] };
      list.push(p);
    }
    p.status = status;
    if (reference !== undefined) p.reference = reference;
    p.log.push({ status, at: new Date().toISOString(), by: ctx.user?.id });
    return { summary: `Permit ${p.title}: ${status.replace('_', ' ')}${p.reference ? ` (${p.reference})` : ''}`, eventId };
  },

  CAPACITY_SET(ctx, { eventId, subEventId, capacity }) {
    const ev = ctx.ev(eventId);
    const n = Number(capacity);
    assert(Number.isInteger(n) && n >= 0, 'Capacity must be a whole number (0 = unknown)');
    if (subEventId) {
      const se = ev.subEvents.find((s) => s.id === subEventId);
      assert(se, 'Function not found');
      se.capacity = n || null;
      return { summary: `${se.name}: licensed capacity ${n || 'cleared'}`, eventId };
    }
    ev.venue.capacity = n || null;
    return { summary: `${ev.venue.name}: licensed capacity ${n || 'cleared'}`, eventId };
  },

  /** Adds a tradition's functions (akad + resepsi, mehndi + sangeet …) relative to the event date. */
  FUNCTIONS_FROM_TEMPLATE(ctx, { eventId, templateId }) {
    const ev = ctx.ev(eventId);
    const t = FUNCTION_TEMPLATES.find((x) => x.id === templateId);
    assert(t, 'Unknown template');
    assert(ev.date, 'Set the event date first');
    const existing = new Set(ev.subEvents.map((s) => s.name.toLowerCase()));
    const added = t.functions.filter((f) => !existing.has(f.name.toLowerCase()));
    assert(added.length, 'These functions already exist');
    added.forEach((f) => ev.subEvents.push({ id: ctx.id('se'), name: f.name, date: addDays(ev.date, f.offset), venue: ev.venue?.name || '', room: '', start: f.start, end: f.end, guestCount: Math.round((ev.guestCount || 0) * f.share), capacity: null }));
    ev.subEvents.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    return { summary: `${t.label}: added ${added.map((f) => f.name).join(', ')}`, eventId };
  },
};
