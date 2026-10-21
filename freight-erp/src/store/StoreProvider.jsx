import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { buildSeed, STATE_VERSION } from '../data/seed.js';
import { mathRng } from '../lib/util.js';

const KEY = 'freightpilot-state';
const StoreCtx = createContext(null);
const AI_LATENCY = 900;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* corrupted or unavailable storage → reseed */
  }
  return buildSeed();
}

export function StoreProvider({ children }) {
  const { message } = App.useApp();
  const [state, setState] = useState(load);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* storage full: keep working in memory */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [state]);

  const tenant = state.tenants.find((t) => t.id === state.session.tenantId) || state.tenants[0];
  const user = state.users.find((u) => u.id === state.session.userByTenant[tenant.id]) || state.users.find((u) => u.tenantId === tenant.id);

  /**
   * Run a domain operation against a cloned draft. Errors surface as toast messages
   * and leave state untouched. Returns the operation's result (or undefined on error).
   */
  const run = useCallback(
    (op, args, opts = {}) => {
      const draft = structuredClone(stateRef.current);
      const t = draft.tenants.find((x) => x.id === draft.session.tenantId);
      const actor = opts.actor || draft.users.find((u) => u.id === draft.session.userByTenant[t.id]);
      try {
        const result = op(draft, args, { now: Date.now(), actor, rng: mathRng() });
        stateRef.current = draft;
        setState(draft);
        if (opts.success) message.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
        return result;
      } catch (err) {
        message.error(err.message);
        if (opts.throws) throw err;
        return undefined;
      }
    },
    [message],
  );

  /** Same as run, with simulated AI / network latency. */
  const runAsync = useCallback(
    (op, args, opts = {}) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(run(op, args, opts)), opts.latency ?? AI_LATENCY);
      }),
    [run],
  );

  const setSession = useCallback((patch) => {
    setState((s) => {
      const next = { ...s, session: { ...s.session, ...patch, userByTenant: { ...s.session.userByTenant, ...(patch.userByTenant || {}) } } };
      stateRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const fresh = buildSeed();
    stateRef.current = fresh;
    setState(fresh);
    message.success('Demo data regenerated');
  }, [message]);

  const value = useMemo(() => {
    // Tenant isolation: every page reads data through these scoped collections.
    const scope = (arr) => arr.filter((x) => x.tenantId === tenant.id);
    const scoped = {
      users: scope(state.users),
      customers: scope(state.customers),
      partners: scope(state.partners),
      rfqs: scope(state.rfqs),
      quotes: scope(state.quotes),
      shipments: scope(state.shipments),
      documents: scope(state.documents),
      arInvoices: scope(state.arInvoices),
      apInvoices: scope(state.apInvoices),
      audit: scope(state.audit),
      messages: scope(state.messages),
      connectors: scope(state.connectors),
      usage: state.usage[tenant.id] || {},
    };
    const lookup = {
      customer: (id) => state.customers.find((c) => c.id === id),
      partner: (id) => state.partners.find((p) => p.id === id),
      user: (id) => state.users.find((u) => u.id === id),
      shipment: (id) => state.shipments.find((s) => s.id === id),
      quote: (id) => state.quotes.find((q) => q.id === id),
      rfq: (id) => state.rfqs.find((r) => r.id === id),
    };
    return { state, tenant, user, scoped, lookup, run, runAsync, setSession, reset };
  }, [state, tenant, user, run, runAsync, setSession, reset]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
