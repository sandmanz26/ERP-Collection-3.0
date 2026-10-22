import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Field, Alert, Icon, Callout, Badge, JourneyMap } from '../../design-system/index.js';
import { usePlatform } from '../PlatformStore.jsx';
import { PLATFORM, REGIONS, regionById, BRAND_COLORS, planById, TRIAL_PLAN, TRIAL_DAYS, SEAT_ROLES } from '../plans.js';
import { EVENT_TYPES, PAYMENT_SCHEDULES, JURISDICTIONS, ROLES, FX_RATES_TO_USD } from '../../data/config.js';
import { fmtMoney } from '../../lib/money.js';

const STEPS = [
  { id: 'business', label: 'Your business' },
  { id: 'events', label: 'Events you run' },
  { id: 'money', label: 'Money rules' },
  { id: 'team', label: 'Your team' },
  { id: 'brand', label: 'Client portal' },
  { id: 'start', label: 'Start' },
];
const BUSINESS = [
  { id: 'wedding_planner', icon: 'heart', label: 'Wedding planner', desc: 'Couples, families, multi-day weddings', types: ['wedding', 'birthday'] },
  { id: 'corporate', icon: 'users', label: 'Corporate events', desc: 'Conferences, launches, offsites', types: ['conference', 'product_launch', 'offsite'] },
  { id: 'full_service', icon: 'sparkle', label: 'Full-service EO', desc: 'Social and corporate events', types: ['wedding', 'birthday', 'conference', 'product_launch'] },
  { id: 'venue', icon: 'pin', label: 'Venue / in-house team', desc: 'Events inside your own venue', types: ['wedding', 'birthday', 'conference'] },
];
const VOLUME = ['1-10', '10-25', '25-50', '50-100', '100+'];
const TYPE_ICON = { wedding: 'heart', birthday: 'star', conference: 'users', product_launch: 'sparkle', offsite: 'pin' };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

/** Six questions → a configured workspace (currency, taxes, templates, catalog, team, branding, sample data). */
export default function Onboarding() {
  const { pstate, pact } = usePlatform();
  const nav = useNavigate();
  const t = pstate.tenants.find((x) => x.id === pstate.session.onboardingTenantId);
  const [step, setStep] = useState(t?.onboarding.step ?? 0);
  const [p, setP] = useState(() => t?.onboarding.profile ?? {});
  const [err, setErr] = useState(null);
  useEffect(() => { if (pstate.session.tenantId) nav('/'); }, [pstate.session.tenantId, nav]);
  if (!t) return <Navigate to="/signup" replace />;
  const region = regionById(p.region);
  const set = (patch) => { setErr(null); setP((x) => ({ ...x, ...patch })); };
  const seatsLimit = planById(TRIAL_PLAN).limits.seats;
  const validate = () => {
    if (step === 1 && !p.eventTypeIds?.length) return 'Pick at least one type of event';
    if (step === 3) {
      const rows = (p.invites || []).filter((i) => i.email);
      if (rows.some((i) => !isEmail(i.email))) return 'One of the emails is not valid';
      const emails = rows.map((i) => i.email.trim().toLowerCase());
      if (new Set(emails).size !== emails.length) return 'The same email is invited twice';
      if (emails.includes(t.ownerEmail)) return "You're already in the workspace — no need to invite yourself";
      if (rows.length + 1 > seatsLimit) return `The trial includes ${seatsLimit} team seats`;
    }
    return null;
  };
  const next = () => {
    const e = validate();
    if (e) return setErr(e);
    pact('ONBOARDING_SAVE', { tenantId: t.id, step: step + 1, patch: p });
    if (step < STEPS.length - 1) setStep(step + 1);
    else pact('ONBOARDING_COMPLETE', { tenantId: t.id });
  };
  const Body = [Business, Events, Money, Team, Brand, Start][step];
  return (
    <div className="wizard">
      <aside className="wizard-side">
        <div className="logo-row" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontSize: 20 }}><span className="logo" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--color-brand)', display: 'grid', placeItems: 'center', color: '#fff' }}>E</span>{PLATFORM.name}</div>
        <div><div style={{ opacity: 0.7, fontSize: 13 }}>Setting up</div><div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{t.name}</div><div style={{ opacity: 0.7, fontSize: 13 }}>{t.slug}.{PLATFORM.domain}</div></div>
        <ol className="wizard-steps">
          {STEPS.map((s, i) => <li key={s.id} className={i < step ? 'done' : i === step ? 'on' : ''}><i>{i < step ? '✓' : i + 1}</i><span>{s.label}</span></li>)}
        </ol>
        <div style={{ marginTop: 'auto', fontSize: 13, opacity: 0.75 }}>You can change every answer later in Settings.</div>
      </aside>
      <main className="wizard-main">
        <div className="faint text-sm">Step {step + 1} of {STEPS.length}</div>
        <Body p={p} set={set} region={region} t={t} seatsLimit={seatsLimit} />
        {err && <Alert tone="danger">{err}</Alert>}
        {pstate.lastError?.type?.startsWith('ONBOARDING') && <Alert tone="danger">{pstate.lastError.message}</Alert>}
        <div className="wizard-foot">
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          <span className="grow" style={{ flex: 1 }} />
          {(step === 3 || step === 4) && <Button variant="ghost" onClick={() => { pact('ONBOARDING_SAVE', { tenantId: t.id, step: step + 1, patch: p }); setStep(step + 1); }}>Skip for now</Button>}
          <Button variant="primary" onClick={next}>{step === STEPS.length - 1 ? 'Create my workspace' : 'Continue'} <Icon name="chevron" size={14} /></Button>
        </div>
      </main>
    </div>
  );
}

function Choice({ on, icon, title, desc, onClick, role = 'radio' }) {
  return (
    <button type="button" role={role} aria-checked={on} className={`choice ${on ? 'on' : ''}`} onClick={onClick}>
      {icon && <span className="ic"><Icon name={icon} size={16} /></span>}
      <span><b>{title}</b>{desc && <small>{desc}</small>}</span>
    </button>
  );
}

function Business({ p, set }) {
  return (
    <>
      <div><h1>Tell us about your business</h1><p className="lead">We use this to set your currency, taxes and templates.</p></div>
      <section className="stack" style={{ gap: 10 }}>
        <b>What best describes you?</b>
        <div className="choice-grid" role="radiogroup">{BUSINESS.map((b) => <Choice key={b.id} on={p.businessType === b.id} icon={b.icon} title={b.label} desc={b.desc} onClick={() => set({ businessType: b.id, eventTypeIds: b.types })} />)}</div>
      </section>
      <section className="stack" style={{ gap: 10 }}>
        <b>Where do you run events?</b>
        <div className="choice-grid" role="radiogroup">{REGIONS.map((r) => <Choice key={r.id} on={p.region === r.id} icon="pin" title={r.label} desc={`${r.currency} · ${JURISDICTIONS.filter((j) => r.jurisdictionIds.includes(j.id)).map((j) => `${j.taxLabel ?? (r.id === 'US' ? 'sales tax' : 'VAT')}`)[0]}`} onClick={() => set({ region: r.id, jurisdictionId: r.jurisdictionIds[0] })} />)}</div>
      </section>
      <Field label="How many events a year?"><select value={p.eventsPerYear} onChange={(e) => set({ eventsPerYear: e.target.value })}>{VOLUME.map((v) => <option key={v}>{v}</option>)}</select></Field>
    </>
  );
}

function Events({ p, set }) {
  const ids = p.eventTypeIds || [];
  const toggle = (id) => set({ eventTypeIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  return (
    <>
      <div><h1>Which events do you run?</h1><p className="lead">Each type comes with its own proposal template, task timeline (T-minus), guest features and payment terms.</p></div>
      <div className="choice-grid">
        {EVENT_TYPES.map((t) => <Choice key={t.id} role="checkbox" on={ids.includes(t.id)} icon={TYPE_ICON[t.id] ?? 'sparkle'} title={t.name} desc={`${t.segment} · ${t.taskTemplate.length} planning tasks · ${[t.features.seating && 'seating', t.features.rsvp && 'RSVP', t.features.registration && 'registration', t.features.multiplePayers && 'multiple payers'].filter(Boolean).join(', ')}`} onClick={() => toggle(t.id)} />)}
      </div>
    </>
  );
}

function Money({ p, set, region }) {
  const juris = JURISDICTIONS.filter((j) => region.jurisdictionIds.includes(j.id));
  return (
    <>
      <div><h1>How do you get paid?</h1><p className="lead">Your default payment schedule and rules. Prices and taxes are in <b>{region.currency}</b>.</p></div>
      <Callout tone="info" icon="lock" title="A date is only locked when the deposit lands">Until then it is a hold that expires, so you never turn down a couple for a date that was never paid.</Callout>
      <section className="stack" style={{ gap: 10 }}>
        <b>Default payment schedule (social events)</b>
        <div className="choice-grid" role="radiogroup">{PAYMENT_SCHEDULES.map((s) => <Choice key={s.id} on={p.paymentScheduleId === s.id} icon="wallet" title={s.name} desc={s.installments.map((i) => i.label.split(' — ')[0]).join(' · ')} onClick={() => set({ paymentScheduleId: s.id })} />)}</div>
      </section>
      <div className="grid g2">
        <Field label="Default tax"><select value={p.jurisdictionId ?? juris[0]?.id} onChange={(e) => set({ jurisdictionId: e.target.value })}>{juris.map((j) => <option key={j.id} value={j.id}>{j.name} — {j.rate}%</option>)}</select></Field>
        <Field label="Date holds expire after (days)"><input type="number" min="1" max="30" value={p.holdExpiryDays} onChange={(e) => set({ holdExpiryDays: e.target.value })} /></Field>
        <Field label="Final headcount due (days before)"><input type="number" min="3" max="60" value={p.finalHeadcountDays} onChange={(e) => set({ finalHeadcountDays: e.target.value })} /></Field>
        <Field label="Late fee (% per month)" hint="0 to switch off"><input type="number" min="0" max="5" step="0.5" value={p.lateFeePct} onChange={(e) => set({ lateFeePct: e.target.value })} /></Field>
      </div>
    </>
  );
}

function Team({ p, set, t, seatsLimit }) {
  const rows = p.invites?.length ? p.invites : [{ email: '', role: 'planner' }];
  const upd = (i, patch) => set({ invites: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const used = 1 + rows.filter((r) => r.email).length;
  return (
    <>
      <div><h1>Invite your team</h1><p className="lead">Each role sees what it needs: sales the pipeline, planners the events, finance the money. Clients, vendors and day-of crew are added later and are free.</p></div>
      <div className="row between"><span className="muted">{t.ownerName} ({t.ownerEmail}) · Owner</span><Badge tone={used > seatsLimit ? 'danger' : 'info'}>{used} of {seatsLimit} seats</Badge></div>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} className="invite-row">
            <Field label={i === 0 ? 'Email' : undefined}><input type="email" value={r.email} placeholder="teammate@yourstudio.com" onChange={(e) => upd(i, { email: e.target.value })} aria-label={`Invite ${i + 1} email`} /></Field>
            <Field label={i === 0 ? 'Role' : undefined}><select value={r.role} onChange={(e) => upd(i, { role: e.target.value })} aria-label={`Invite ${i + 1} role`}>{ROLES.filter((x) => SEAT_ROLES.includes(x.id) && x.id !== 'admin').concat(ROLES.filter((x) => x.id === 'admin')).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
            <Button variant="ghost" onClick={() => set({ invites: rows.filter((_, k) => k !== i) })} aria-label="Remove"><Icon name="x" size={14} /></Button>
          </div>
        ))}
      </div>
      <div><Button onClick={() => set({ invites: [...rows, { email: '', role: 'planner' }] })} disabled={rows.length + 1 >= seatsLimit}>+ Add another</Button></div>
      <div className="faint text-xs">Invitations are mocked: teammates sign in with the temporary password <b>welcome123</b> and are asked to change it.</div>
    </>
  );
}

function Brand({ p, set, t }) {
  const c = BRAND_COLORS.find((b) => b.id === p.brandColor) ?? BRAND_COLORS[0];
  return (
    <>
      <div><h1>Make the client portal yours</h1><p className="lead">Couples and clients see your name and colors — not ours.</p></div>
      <section className="stack" style={{ gap: 10 }}>
        <b>Brand color</b>
        <div className="swatches" role="radiogroup" aria-label="Brand color">{BRAND_COLORS.map((b) => <button key={b.id} type="button" role="radio" aria-checked={p.brandColor === b.id} aria-label={b.label} className={`swatch-btn ${p.brandColor === b.id ? 'on' : ''}`} style={{ background: b.brand }} onClick={() => set({ brandColor: b.id })} />)}</div>
      </section>
      <Field label="Welcome message on the portal" hint="Shown to clients when they open their event"><textarea rows={2} value={p.portalWelcome} maxLength={280} placeholder="We're so happy to plan your day with you." onChange={(e) => set({ portalWelcome: e.target.value })} /></Field>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'var(--hero-bg)', color: 'var(--hero-ink)', padding: 20, borderLeft: `5px solid ${c.brand}` }}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>{t.name} · Client portal</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>Rivera &amp; Tan Wedding</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{p.portalWelcome || "We're so happy to plan your day with you."}</div>
        </div>
        <div style={{ padding: 16, '--color-brand': c.brand }}>
          <JourneyMap stops={[{ id: 'a', label: 'Proposal', status: 'done' }, { id: 'b', label: 'Contract', status: 'done' }, { id: 'c', label: 'Planning', status: 'current', icon: 'list' }, { id: 'd', label: 'Event day', status: 'todo', icon: 'heart', emphasis: true }]} position={2.4} pinLabel="You are here" />
        </div>
      </div>
    </>
  );
}

function Start({ p, set, region, t }) {
  const types = EVENT_TYPES.filter((e) => (p.eventTypeIds || []).includes(e.id)).map((e) => e.name).join(', ');
  const invites = (p.invites || []).filter((i) => i.email);
  return (
    <>
      <div><h1>How would you like to start?</h1><p className="lead">You can delete the sample at any time.</p></div>
      <div className="choice-grid" role="radiogroup">
        <Choice on={p.sample !== false} icon="sparkle" title="With a sample event" desc="A wedding lead with a held date and a draft proposal, so every screen has something to show" onClick={() => set({ sample: true })} />
        <Choice on={p.sample === false} icon="file" title="Empty workspace" desc="Start clean and add your first inquiry" onClick={() => set({ sample: false })} />
      </div>
      <div className="card">
        <b>Your workspace</b>
        <ul className="stack" style={{ gap: 6, marginTop: 10, paddingLeft: 18 }}>
          <li>{t.name} — <span className="faint">{t.slug}.{PLATFORM.domain}</span></li>
          <li>{region.label} · prices in {region.currency} (e.g. planning fee {fmtMoney(Math.round(12000 / (FX_RATES_TO_USD[region.currency] ?? 1) / 1000) * 1000, region.currency, { whole: true })})</li>
          <li>Event types: {types}</li>
          <li>{PAYMENT_SCHEDULES.find((s) => s.id === p.paymentScheduleId)?.name} · holds expire after {p.holdExpiryDays} days</li>
          <li>{invites.length ? `${invites.length} teammate(s) invited` : 'Just you for now'}</li>
          <li>{planById(TRIAL_PLAN).name} trial — {TRIAL_DAYS} days, no card</li>
        </ul>
      </div>
    </>
  );
}
