import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { platformReducer, buildPlatformSeed, PLATFORM_VERSION } from './platformReducer.js';
import { buildWorkspace, STATE_VERSION } from './workspace.js';
import { entitlement, usage } from './entitlements.js';
import { buildSeed } from '../data/seed.js';
import * as decorApi from '../lib/decorApi.js';
import { todayISO } from '../lib/dates.js';

// Storage layout (one browser = one mock "cloud"):
//   eo-platform-v1      → platform state (workspaces, subscriptions, operator log)
//   eo-ws-<tenantId>    → one workspace's app state, fully isolated from the others
const PLATFORM_KEY = 'eo-platform-v1';
const LEGACY_KEY = 'eo-ms-state-v1'; // pre-SaaS single-tenant state becomes the demo workspace
export const tenantKey = (id) => `eo-ws-${id}`;

export function readTenantState(id) {
  try {
    const raw = localStorage.getItem(tenantKey(id));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.version === STATE_VERSION ? parsed : null;
  } catch { return null; }
}
export function saveTenantState(id, state) {
  try {
    const { effects, lastOk, lastError, ...rest } = state;
    localStorage.setItem(tenantKey(id), JSON.stringify(rest));
  } catch { /* quota */ }
}
function removeAllTenantStates() {
  Object.keys(localStorage).filter((k) => k.startsWith('eo-ws-') || k === LEGACY_KEY).forEach((k) => localStorage.removeItem(k));
}

/** Loads a workspace's state, creating it on first open (demo seed, legacy migration, or seeded customer). */
export function loadTenantState(t) {
  const saved = readTenantState(t.id);
  if (saved) return saved;
  let state = null;
  if (t.demo) {
    try { const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); if (legacy?.version === STATE_VERSION) state = legacy; } catch { /* ignore */ }
    if (!state) { state = buildSeed(); decorApi.resetDecorDb(state.decorReservations); }
  } else if (t.seedOwner) {
    state = { ...buildWorkspace({ owner: t.seedOwner, company: { name: t.name }, profile: { ...t.onboarding?.profile, sample: true } }), currentUserId: null };
  } else {
    return null;
  }
  saveTenantState(t.id, state);
  return state;
}

export const usageOf = (tenantId) => usage(readTenantState(tenantId));

function init() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLATFORM_KEY) || 'null');
    if (parsed?.version === PLATFORM_VERSION) return { ...parsed, effects: [] };
  } catch { /* corrupted → reseed */ }
  return buildPlatformSeed();
}

const Ctx = createContext(null);

export function PlatformProvider({ children }) {
  const today = todayISO();
  const [pstate, dispatch] = useReducer((s, a) => platformReducer(s, a, { today, usage: usageOf }), undefined, init);
  const ref = useRef(pstate);
  ref.current = pstate;

  useEffect(() => {
    try { const { effects, lastOk, lastError, ...rest } = pstate; localStorage.setItem(PLATFORM_KEY, JSON.stringify(rest)); } catch { /* quota */ }
  }, [pstate]);

  // Effects the pure reducer asked for: create / delete / reset workspace storage.
  useEffect(() => {
    (pstate.effects || []).forEach((fx) => {
      if (fx.type === 'saveTenantState') saveTenantState(fx.tenantId, fx.state);
      if (fx.type === 'deleteTenantState') localStorage.removeItem(tenantKey(fx.tenantId));
      if (fx.type === 'resetAllTenants') removeAllTenantStates();
    });
  }, [pstate.effects]);

  const pact = useCallback((type, payload = {}) => dispatch({ type, payload }), []);
  // Daily billing run (trial expiry, renewals, scheduled cancellations).
  useEffect(() => { pact('PLATFORM_TICK'); }, [pact]);

  const value = useMemo(() => ({
    pstate, pact, today,
    tenantOf: (id) => pstate.tenants.find((t) => t.id === id),
    entOf: (id) => entitlement(pstate.tenants.find((t) => t.id === id), today),
  }), [pstate, pact, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePlatform = () => useContext(Ctx);

/** Inside a workspace: the tenant record, its entitlement and helpers. Null outside a workspace. */
export const WorkspaceCtx = createContext(null);
export const useWorkspace = () => useContext(WorkspaceCtx);
