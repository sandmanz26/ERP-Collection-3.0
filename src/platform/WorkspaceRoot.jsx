import React, { Suspense, lazy, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoreProvider, useStore } from '../store/AppStore.jsx';
import { usePlatform, WorkspaceCtx, loadTenantState, readTenantState, saveTenantState } from './PlatformStore.jsx';
import { entitlement, checkAction, hasFeature } from './entitlements.js';
import { BRAND_COLORS } from './plans.js';

const App = lazy(() => import('../App.jsx')); // the event-management app loads only when a workspace is opened

/** Mounts one workspace: its isolated store, the entitlement guard on every action, and its branding. */
export default function WorkspaceRoot({ tenantId, children }) {
  const { pstate, pact, today } = usePlatform();
  const nav = useNavigate();
  const tenant = pstate.tenants.find((t) => t.id === tenantId);
  const ent = useMemo(() => entitlement(tenant, today), [tenant, today]);
  const load = useCallback(() => {
    // A workspace just created by onboarding may not be flushed to storage yet: take it from the pending effect.
    const pending = pstate.effects?.find((e) => e.type === 'saveTenantState' && e.tenantId === tenantId)?.state;
    return readTenantState(tenantId) ?? pending ?? loadTenantState(tenant);
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback((s) => saveTenantState(tenantId, s), [tenantId]);
  const guard = useCallback((type, payload, state) => checkAction(ent, type, payload, state), [ent]);
  const leave = useCallback((to = '/login') => { pact('LEAVE_WORKSPACE'); nav(to); }, [pact, nav]);
  const ctx = useMemo(() => ({ tenant, ent, isDemo: !!tenant?.demo, leave }), [tenant, ent, leave]);

  useEffect(() => { if (!tenant || !ent?.canEnter) pact('LEAVE_WORKSPACE'); }, [tenant, ent, pact]);
  if (!tenant || !ent?.canEnter) return null;
  return (
    <WorkspaceCtx.Provider value={ctx}>
      <StoreProvider key={tenantId} load={load} save={save} guard={guard}>
        <BrandSync ent={ent} />
        <Suspense fallback={<div className="empty">Loading workspace…</div>}>{children ?? <App />}</Suspense>
      </StoreProvider>
    </WorkspaceCtx.Provider>
  );
}

/** Applies the workspace brand color (Studio+) to the whole app, with a lighter variant in dark mode. */
function BrandSync({ ent }) {
  const { state } = useStore();
  const id = state.settings.company.brandColor;
  useEffect(() => {
    const root = document.documentElement;
    const c = hasFeature(ent, 'branding') && id && id !== 'violet' ? BRAND_COLORS.find((b) => b.id === id) : null;
    const apply = () => {
      const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (!c) { ['--color-brand', '--color-brand-strong', '--color-brand-soft', '--color-brand-tint'].forEach((k) => root.style.removeProperty(k)); return; }
      const brand = dark ? `color-mix(in srgb, ${c.brand} 60%, white)` : c.brand;
      root.style.setProperty('--color-brand', brand);
      root.style.setProperty('--color-brand-strong', dark ? `color-mix(in srgb, ${c.brand} 35%, white)` : c.strong);
      root.style.setProperty('--color-brand-soft', `color-mix(in srgb, ${c.brand} ${dark ? 22 : 10}%, var(--color-surface))`);
      root.style.setProperty('--color-brand-tint', `color-mix(in srgb, ${c.brand} ${dark ? 35 : 22}%, var(--color-surface))`);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener?.('change', apply); obs.disconnect(); ['--color-brand', '--color-brand-strong', '--color-brand-soft', '--color-brand-tint'].forEach((k) => root.style.removeProperty(k)); };
  }, [ent, id]);
  return null;
}
