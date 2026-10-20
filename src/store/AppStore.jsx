import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { reducer } from './reducer.js';
import { buildSeed } from '../data/seed.js';
import { todayISO } from '../lib/dates.js';
import * as decorApi from '../lib/decorApi.js';

// Bump `version` in seed.js whenever the state shape changes; older snapshots are re-seeded.
const STORAGE_KEY = 'eo-ms-state-v1';
const StoreCtx = createContext(null);

function init() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2) return { ...parsed, effects: [] };
    }
  } catch { /* corrupted -> reseed */ }
  const seed = buildSeed();
  decorApi.resetDecorDb(seed.decorReservations);
  return { ...seed, effects: [] };
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;

  // persist
  useEffect(() => {
    try {
      const { effects, lastOk, lastError, ...rest } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch { /* quota */ }
  }, [state]);

  /** act(type, payload) — THE way to change state. Every call is logged into the activity log. */
  const act = useCallback((type, payload = {}, opts = {}) => dispatch({ type, payload, system: !!opts.system }), []);

  // Side effects -> external Decor Inventory API (async), results reported back as actions.
  useEffect(() => {
    if (!state.effects?.length) return;
    state.effects.forEach(async (fx) => {
      const ev = stateRef.current.events.find((e) => e.id === fx.eventId);
      try {
        if (fx.type === 'decor.reset') {
          decorApi.resetDecorDb(fx.reservations);
        } else if (fx.type === 'decor.reserve') {
          const res = await decorApi.reserve({ eventId: fx.eventId, eventName: ev?.name, date: ev?.date, items: fx.items });
          act('DECOR_SYNCED', { eventId: fx.eventId, reservationId: res.id, ok: true }, { system: true });
        } else if (fx.type === 'decor.move') {
          await decorApi.moveReservationDate(fx.eventId, fx.newDate);
          act('DECOR_SYNCED', { eventId: fx.eventId, reservationId: ev?.decorReservationId ?? 'n/a', ok: true }, { system: true });
        } else if (fx.type === 'decor.cancel') {
          await decorApi.cancelReservation(fx.eventId);
          act('DECOR_SYNCED', { eventId: fx.eventId, reservationId: 'cancelled', ok: true }, { system: true });
        }
      } catch (e) {
        act('DECOR_SYNCED', { eventId: fx.eventId, ok: false, message: e.message }, { system: true });
      }
    });
  }, [state.effects, act]);

  // automation engine tick
  useEffect(() => {
    act('SYSTEM_TICK', {}, { system: true });
    const t = setInterval(() => act('SYSTEM_TICK', {}, { system: true }), 60000);
    return () => clearInterval(t);
  }, [act]);

  // browser online/offline (day-of offline mode)
  useEffect(() => {
    const on = () => act('SET_ONLINE', { online: true }, { system: true });
    const off = () => act('SET_ONLINE', { online: false }, { system: true });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [act]);

  const user = state.users.find((u) => u.id === state.currentUserId);
  const value = useMemo(() => ({ state, act, user, today: todayISO() }), [state, act, user]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  return useContext(StoreCtx);
}

export function useEvent(eventId) {
  const { state } = useStore();
  return state.events.find((e) => e.id === eventId);
}
