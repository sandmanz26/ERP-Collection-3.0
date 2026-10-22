import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Alert, Icon } from '../../design-system/index.js';
import { usePlatform } from '../PlatformStore.jsx';
import { PLATFORM, TRIAL_DAYS } from '../plans.js';
import { slugify, slugError } from '../workspace.js';
import { SiteLogo } from './SiteChrome.jsx';

/** Step 0 of the SaaS funnel: account + workspace URL. Onboarding configures the rest. */
export default function Signup() {
  const { pstate, pact } = usePlatform();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', company: '', slug: '', acceptTerms: false });
  const [slugEdited, setSlugEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [show, setShow] = useState(false);
  const slug = slugEdited ? f.slug : slugify(f.company);
  const taken = useMemo(() => pstate.tenants.map((t) => t.slug), [pstate.tenants]);
  const errs = {
    name: f.name.trim().length < 2 && 'Tell us your name',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && 'Enter a valid work email',
    password: f.password.length < 8 && 'At least 8 characters',
    company: f.company.trim().length < 2 && 'Enter your company name',
    slug: slugError(slug, taken),
    acceptTerms: !f.acceptTerms && 'Please accept the terms',
  };
  const serverErr = pstate.lastError?.type === 'SIGNUP' ? pstate.lastError.message : null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  useEffect(() => { if (pstate.session.onboardingTenantId && pstate.lastOk?.type === 'SIGNUP') nav('/onboarding'); }, [pstate.session.onboardingTenantId, pstate.lastOk, nav]);
  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    pact('SIGNUP', { ...f, slug });
  };
  const err = (k) => (touched ? errs[k] || undefined : undefined);
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="logo-row" style={{ color: 'var(--hero-ink)' }}><span className="logo">E</span>{PLATFORM.name}</div>
        <h1>Start your {TRIAL_DAYS}-day free trial</h1>
        <p>Everything in Studio is unlocked. No credit card. When the trial ends you choose a plan — or your workspace simply becomes read-only.</p>
        <ul className="points">
          {['Your own isolated workspace and URL', 'Taxes, currency and templates set up for your country', 'Client & vendor portals included in the trial', 'Invite your team now, pay for seats later'].map((x) => <li key={x}><Icon name="check" size={16} /> {x}</li>)}
        </ul>
      </aside>
      <main className="auth-main">
        <div><SiteLogo /></div>
        <div><h2>Create your workspace</h2><div className="muted">Already have one? <Link to="/login">Log in</Link></div></div>
        {serverErr && <Alert tone="danger">{serverErr}</Alert>}
        <form className="stack" style={{ gap: 12 }} onSubmit={submit} noValidate>
          <Field label="Your name" error={err('name')}><input value={f.name} onChange={set('name')} autoComplete="name" autoFocus /></Field>
          <Field label="Work email" error={err('email')}><input type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@yourstudio.com" /></Field>
          <Field label="Password" error={err('password')} hint="At least 8 characters">
            <div className="row" style={{ gap: 6 }}><input style={{ flex: 1 }} type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete="new-password" /><Button type="button" variant="ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></Button></div>
          </Field>
          <Field label="Company name" error={err('company')}><input value={f.company} onChange={set('company')} placeholder="Bali Bliss Weddings" /></Field>
          <Field label="Workspace URL" error={touched || slugEdited ? errs.slug || undefined : undefined} hint={!errs.slug && slug ? 'Available' : 'Lowercase letters, numbers and dashes'}>
            <div className="slug-field"><input value={slug} onChange={(e) => { setSlugEdited(true); setF({ ...f, slug: slugify(e.target.value) }); }} aria-label="Workspace URL" /><span>.{PLATFORM.domain}</span></div>
          </Field>
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={f.acceptTerms} onChange={set('acceptTerms')} /> I agree to the Terms of Service and the Data Processing Agreement.</label>
          {touched && errs.acceptTerms && <div className="text-danger text-sm">{errs.acceptTerms}</div>}
          <Button variant="primary" className="auth-submit" type="submit">Create workspace</Button>
        </form>
        <div className="faint text-xs">Mock sign-up: no email is sent and nothing leaves this browser.</div>
      </main>
    </div>
  );
}
