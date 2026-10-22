import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field, Alert, Badge, Icon } from '../../design-system/index.js';
import { usePlatform, loadTenantState } from '../PlatformStore.jsx';
import { entitlement } from '../entitlements.js';
import { PLATFORM, planById } from '../plans.js';
import { SiteLogo } from './SiteChrome.jsx';

const STATUS_TONE = { trialing: 'info', active: 'ok', past_due: 'warn', expired: 'danger', canceled: 'danger', suspended: 'danger' };

/** Log in, step 1: find the workspace by its URL or your email; step 2 happens on the workspace's own sign-in page. */
export default function FindWorkspace() {
  const { pstate, pact, today } = usePlatform();
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState('');
  const results = useMemo(() => {
    const term = searched.trim().toLowerCase().replace(`.${PLATFORM.domain}`, '');
    if (!term) return [];
    return pstate.tenants.filter((t) => t.onboarding?.completed !== false).filter((t) => {
      if (t.slug === term || t.ownerEmail === term) return true;
      if (!term.includes('@')) return false;
      const s = loadTenantState(t); // members of the workspace (team, clients, vendors) can find it by email too
      return !!s?.users.some((u) => u.email.toLowerCase() === term);
    });
  }, [searched, pstate.tenants]);
  const enter = (t) => {
    if (searched.includes('@')) { try { sessionStorage.setItem('eo-login-email', searched.trim().toLowerCase()); } catch { /* ignore */ } }
    pact('ENTER_WORKSPACE', { tenantId: t.id });
  };
  const err = pstate.lastError?.type === 'ENTER_WORKSPACE' ? pstate.lastError.message : null;
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="logo-row" style={{ color: 'var(--hero-ink)' }}><span className="logo">E</span>{PLATFORM.name}</div>
        <h1>Welcome back</h1>
        <p>Every company has its own workspace with its own data and sign-in. Find yours by its URL or by the email you were invited with.</p>
        <Button onClick={() => pact('ENTER_WORKSPACE', { tenantId: PLATFORM.demoTenantId })}><Icon name="play" size={14} /> Open the live demo workspace</Button>
      </aside>
      <main className="auth-main">
        <div><SiteLogo /></div>
        <div><h2>Find your workspace</h2><div className="muted">New here? <Link to="/signup">Start a free trial</Link></div></div>
        <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); setSearched(q); }}>
          <Field label="Workspace URL or your email" hint={`e.g. balibliss.${PLATFORM.domain} or you@company.com`}><input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={`yourstudio.${PLATFORM.domain}`} /></Field>
          <Button variant="primary" className="auth-submit" type="submit">Continue</Button>
        </form>
        {err && <Alert tone="danger">{err}</Alert>}
        {searched && !results.length && <Alert tone="warning">No workspace found for “{searched}”. Check the spelling, or ask your admin to invite you.</Alert>}
        {results.length > 0 && (
          <div className="ws-list">
            {results.map((t) => {
              const ent = entitlement(t, today);
              return (
                <button key={t.id} type="button" className="ws-item" onClick={() => enter(t)}>
                  <span className="ws-logo">{t.name[0]}</span>
                  <span className="grow"><b>{t.name}</b><div className="faint text-sm">{t.slug}.{PLATFORM.domain} · {planById(ent.planId).name}</div></span>
                  <Badge tone={STATUS_TONE[ent.status]}>{ent.status.replace('_', ' ')}</Badge>
                  <Icon name="chevron" size={14} />
                </button>
              );
            })}
          </div>
        )}
        <div className="faint text-xs">Demo: try <b>lumiere</b>, <b>balibliss</b>, <b>northwind</b>, <b>petalandpine</b>, <b>sunsetcoast</b> (password demo1234 for every account).</div>
      </main>
    </div>
  );
}
