import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Button } from '../../design-system/index.js';
import { PLATFORM, PLANS, FEATURES, planPrice, ANNUAL_DISCOUNT_MONTHS, TRIAL_DAYS } from '../plans.js';
import { usePlatform } from '../PlatformStore.jsx';

export function SiteLogo() {
  return <Link to="/" className="site-logo"><i aria-hidden>E</i>{PLATFORM.name}</Link>;
}

export function SiteNav() {
  const nav = useNavigate();
  const { pact } = usePlatform();
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <header className="site-nav">
      <div className="site-wrap">
        <SiteLogo />
        <nav className="site-links" aria-label="Site">
          <button type="button" className="site-link" onClick={() => go('features')}>Product</button>
          <button type="button" className="site-link" onClick={() => go('pricing')}>Pricing</button>
          <button type="button" className="site-link" onClick={() => go('faq')}>FAQ</button>
          <button type="button" className="site-link" onClick={() => pact('ENTER_WORKSPACE', { tenantId: PLATFORM.demoTenantId })}>Live demo</button>
        </nav>
        <span className="grow" />
        <Link to="/login" className="site-link">Log in</Link>
        <Button variant="primary" onClick={() => nav('/signup')}>Start free trial</Button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-wrap site-foot">
      <span>© {new Date().getFullYear()} {PLATFORM.name} · {PLATFORM.tagline}</span>
      <span style={{ display: 'flex', gap: 18 }}><a className="site-link" href={`mailto:${PLATFORM.supportEmail}`}>Support</a><Link className="site-link" to="/operator">Platform operator</Link></span>
    </footer>
  );
}

export function IntervalToggle({ value, onChange }) {
  return (
    <div className="interval" role="radiogroup" aria-label="Billing interval">
      <button type="button" role="radio" aria-checked={value === 'month'} className={value === 'month' ? 'on' : ''} onClick={() => onChange('month')}>Monthly</button>
      <button type="button" role="radio" aria-checked={value === 'year'} className={value === 'year' ? 'on' : ''} onClick={() => onChange('year')}>Annual <small>{ANNUAL_DISCOUNT_MONTHS} months free</small></button>
    </div>
  );
}

const limitText = (n, unit) => (n === null ? `Unlimited ${unit}` : `${n} ${unit}`);

/** Plan cards, used on the public pricing section and in Settings → Plan & billing. */
export function PricingCards({ interval, onChoose, currentPlanId, ctaFor }) {
  return (
    <div className="pricing">
      {PLANS.map((p) => {
        const price = planPrice(p.id, interval);
        const current = p.id === currentPlanId;
        return (
          <div key={p.id} className={`plan ${p.popular ? 'popular' : ''} ${current ? 'current' : ''}`}>
            {p.popular && <span className="tag">Most popular</span>}
            <h3>{p.name}</h3>
            <div className="blurb">{p.blurb}</div>
            <div className="price">${interval === 'year' ? Math.round(price / 12) : price}<small>/ month{interval === 'year' ? `, $${price} billed yearly` : ''}</small></div>
            <ul>
              <li><Icon name="check" size={15} />{limitText(p.limits.seats, 'team seats')}</li>
              <li><Icon name="check" size={15} />{limitText(p.limits.activeEvents, 'active events')}</li>
              <li><Icon name="check" size={15} />Pipeline, proposals, contracts, invoices</li>
              <li><Icon name="check" size={15} />Planning, run of show, risks & contingencies</li>
              {Object.entries(FEATURES).map(([k, f]) => (
                <li key={k} className={p.features.includes(k) ? '' : 'off'}><Icon name={p.features.includes(k) ? 'check' : 'x'} size={15} />{f.label}</li>
              ))}
            </ul>
            <Button variant={p.popular || current ? 'primary' : 'secondary'} disabled={current && ctaFor?.(p) === 'Current plan'} onClick={() => onChoose(p)}>{ctaFor ? ctaFor(p) : `Start ${TRIAL_DAYS}-day trial`}</Button>
          </div>
        );
      })}
    </div>
  );
}

export function CompareTable() {
  return (
    <table className="compare">
      <thead><tr><th>Compare plans</th>{PLANS.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
      <tbody>
        <tr><td>Team seats (clients, vendors & day-of crew are free)</td>{PLANS.map((p) => <td key={p.id}>{p.limits.seats ?? '∞'}</td>)}</tr>
        <tr><td>Active events</td>{PLANS.map((p) => <td key={p.id}>{p.limits.activeEvents ?? '∞'}</td>)}</tr>
        {Object.entries(FEATURES).map(([k, f]) => <tr key={k}><td>{f.label}<div className="faint text-xs">{f.desc}</div></td>{PLANS.map((p) => <td key={p.id}>{p.features.includes(k) ? <Icon name="check" size={16} /> : <span className="faint">—</span>}</td>)}</tr>)}
      </tbody>
    </table>
  );
}
