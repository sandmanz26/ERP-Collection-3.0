// Guest management, RSVP, seating, check-in.
import { assert } from './common.js';
import { addDays } from '../../lib/dates.js';

function guestById(ev, guestId) {
  for (const h of ev.households) {
    const g = h.guests.find((x) => x.id === guestId);
    if (g) return { h, g };
  }
  return {};
}

function makeCode(name) {
  return `${name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GST'}${Math.floor(1000 + Math.random() * 9000)}`;
}

export const guestHandlers = {
  HOUSEHOLD_ADD(ctx, { eventId, name, category, email, invitedSubEventIds, plusOnesAllowed, guests }) {
    const ev = ctx.ev(eventId);
    const h = {
      id: ctx.id('hh'), name, code: makeCode(name), category, email, invitedSubEventIds, plusOnesAllowed: Number(plusOnesAllowed) || 0, respondedAt: null,
      guests: guests.map((g) => ({ id: ctx.id('g'), name: g.name, isChild: !!g.isChild, isPlusOne: false, meal: '', dietary: g.dietary || '', accessibility: '', rsvp: Object.fromEntries(invitedSubEventIds.map((s) => [s, 'pending'])), tableId: null, checkedIn: false })),
    };
    ev.households.push(h);
    return { summary: `${ev.segment === 'corporate' ? 'Attendee registered' : 'Household added'}: ${name} (${h.guests.length} guest(s), code ${h.code})`, eventId };
  },
  HOUSEHOLD_UPDATE(ctx, { eventId, householdId, patch }) {
    const ev = ctx.ev(eventId);
    const h = ev.households.find((x) => x.id === householdId);
    if (patch.invitedSubEventIds) {
      h.guests.forEach((g) => {
        const r = {};
        patch.invitedSubEventIds.forEach((s) => (r[s] = g.rsvp[s] ?? 'pending'));
        g.rsvp = r;
      });
    }
    Object.assign(h, patch);
    return { summary: `Household ${h.name} updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  HOUSEHOLD_REMOVE(ctx, { eventId, householdId }) {
    const ev = ctx.ev(eventId);
    const h = ev.households.find((x) => x.id === householdId);
    ev.households = ev.households.filter((x) => x.id !== householdId);
    return { summary: `Household removed: ${h.name}`, eventId };
  },
  GUEST_ADD(ctx, { eventId, householdId, name, isPlusOne, isChild }) {
    const ev = ctx.ev(eventId);
    const h = ev.households.find((x) => x.id === householdId);
    if (isPlusOne) {
      const used = h.guests.filter((g) => g.isPlusOne).length;
      assert(used < h.plusOnesAllowed, `Household allows ${h.plusOnesAllowed} plus-one(s)`);
    }
    h.guests.push({ id: ctx.id('g'), name, isChild: !!isChild, isPlusOne: !!isPlusOne, meal: '', dietary: '', accessibility: '', rsvp: Object.fromEntries(h.invitedSubEventIds.map((s) => [s, 'pending'])), tableId: null, checkedIn: false });
    return { summary: `Guest ${name}${isPlusOne ? ' (plus-one)' : ''} added to ${h.name}`, eventId };
  },
  GUEST_UPDATE(ctx, { eventId, guestId, patch }) {
    const ev = ctx.ev(eventId);
    const { g } = guestById(ev, guestId);
    Object.assign(g, patch);
    return { summary: `Guest ${g.name} updated (${Object.keys(patch).join(', ')})`, eventId };
  },
  GUEST_REMOVE(ctx, { eventId, guestId }) {
    const ev = ctx.ev(eventId);
    const { h, g } = guestById(ev, guestId);
    h.guests = h.guests.filter((x) => x.id !== guestId);
    return { summary: `Guest ${g.name} removed`, eventId };
  },
  /** RSVP per sub-event; can come from public RSVP page (by household code), portal or staff. */
  RSVP_SET(ctx, { eventId, guestId, subEventId, value, meal, dietary, viaPublic }) {
    const ev = ctx.ev(eventId);
    const deadline = addDays(ev.date, -ctx.state.settings.rsvpDeadlineDays);
    assert(!viaPublic || ctx.today <= deadline, `The RSVP deadline (${deadline}) has passed — please contact the hosts.`);
    const { h, g } = guestById(ev, guestId);
    assert(h.invitedSubEventIds.includes(subEventId), `${g.name} is not invited to this function`);
    g.rsvp[subEventId] = value;
    if (meal !== undefined) g.meal = meal;
    if (dietary !== undefined) g.dietary = dietary;
    h.respondedAt = new Date().toISOString();
    const se = ev.subEvents.find((s) => s.id === subEventId);
    return { summary: `RSVP: ${g.name} → ${value.toUpperCase()} for ${se?.name}${meal ? `, meal ${meal}` : ''}`, eventId };
  },
  TABLE_ADD(ctx, { eventId, name, capacity, shape }) {
    const ev = ctx.ev(eventId);
    ev.tables.push({ id: ctx.id('tb'), name, capacity: Number(capacity) || 10, shape: shape || 'round' });
    return { summary: `Table added: ${name} (${capacity} seats)`, eventId };
  },
  TABLE_UPDATE(ctx, { eventId, tableId, patch }) {
    const ev = ctx.ev(eventId);
    const t = ev.tables.find((x) => x.id === tableId);
    Object.assign(t, patch);
    return { summary: `Table ${t.name} updated`, eventId };
  },
  TABLE_REMOVE(ctx, { eventId, tableId }) {
    const ev = ctx.ev(eventId);
    const t = ev.tables.find((x) => x.id === tableId);
    ev.tables = ev.tables.filter((x) => x.id !== tableId);
    ev.households.forEach((h) => h.guests.forEach((g) => { if (g.tableId === tableId) g.tableId = null; }));
    return { summary: `Table removed: ${t.name} (guests unseated)`, eventId };
  },
  SEAT_GUEST(ctx, { eventId, guestId, tableId }) {
    const ev = ctx.ev(eventId);
    const { g } = guestById(ev, guestId);
    if (tableId) {
      const t = ev.tables.find((x) => x.id === tableId);
      const seated = ev.households.flatMap((h) => h.guests).filter((x) => x.tableId === tableId && x.id !== guestId).length;
      assert(seated < t.capacity, `${t.name} is full (${t.capacity} seats)`);
    }
    g.tableId = tableId;
    return { summary: `Seated ${g.name} at ${ev.tables.find((t) => t.id === tableId)?.name ?? 'unassigned'}`, eventId };
  },
  SEATING_RULE_ADD(ctx, { eventId, guestA, guestB, type, note }) {
    const ev = ctx.ev(eventId);
    ev.seatingRules.push({ id: ctx.id('rule'), guestA, guestB, type, note });
    return { summary: `Seating rule: ${guestById(ev, guestA).g?.name} & ${guestById(ev, guestB).g?.name} must sit ${type}`, eventId };
  },
  SEATING_RULE_REMOVE(ctx, { eventId, ruleId }) {
    const ev = ctx.ev(eventId);
    ev.seatingRules = ev.seatingRules.filter((r) => r.id !== ruleId);
    return { summary: 'Seating rule removed', eventId };
  },
  GUEST_CHECKIN(ctx, { eventId, guestId, value = true, via = 'manual' }) {
    const ev = ctx.ev(eventId);
    const { g } = guestById(ev, guestId);
    g.checkedIn = value;
    g.checkedInAt = value ? new Date().toISOString() : null;
    return { summary: `${value ? 'Checked in' : 'Undo check-in'}: ${g.name} (${via})`, eventId };
  },
};
