// In-app SaaS chrome: subscription banner, upgrade walls, getting-started checklist.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Card, ProgressBar } from '../design-system/index.js';
import { useStore } from '../store/AppStore.jsx';
import { useWorkspace } from './PlatformStore.jsx';
import { FEATURES, PLANS } from './plans.js';
import { SEAT_ROLES, BRAND_COLORS, DEFAULT_BRAND } from './plans.js';

/** Trial countdown, read-only, past-due or scheduled-cancel notice — shown to everyone in the workspace. */
export function SubscriptionBanner() {
  const ws = useWorkspace();
  const { user } = useStore();
  const nav = useNavigate();
  const b = ws?.ent?.banner;
  if (!b || ['client', 'vendor', 'crew'].includes(user?.role)) return null;
  return (
    <div className={`saas-banner tone-${b.tone}`} role="status">
      <Icon name={b.tone === 'danger' ? 'alert' : b.tone === 'warning' ? 'clock' : 'info'} size={15} />
      <span className="grow">{b.text}</span>
      {user?.role === 'admin' ? <Button size="sm" variant={b.tone === 'info' ? 'secondary' : 'primary'} onClick={() => nav('/settings?tab=billing')}>{b.cta}</Button> : <span className="text-sm">Ask your workspace owner to {b.cta.toLowerCase()}.</span>}
    </div>
  );
}

/** Shown instead of a feature the workspace's plan does not include. */
export function UpgradeWall({ feature }) {
  const nav = useNavigate();
  const { user } = useStore();
  const f = FEATURES[feature];
  const plan = PLANS.find((p) => p.features.includes(feature));
  return (
    <div className="upgrade-wall">
      <span className="ic"><Icon name="lock" size={24} /></span>
      <h2>{f.label}</h2>
      <p className="muted">{f.desc}. It's included from the <b>{plan?.name}</b> plan.</p>
      {user?.role === 'admin' ? <Button variant="primary" onClick={() => nav('/settings?tab=billing')}>See plans</Button> : <p className="faint text-sm">Ask your workspace owner to upgrade.</p>}
    </div>
  );
}

export function useFeature(f) {
  const ws = useWorkspace();
  return !ws || ws.ent.features.has(f); // outside the SaaS shell (tests, legacy) everything is on
}

/** First-week checklist for a new workspace — every item is derived from real data, not ticked by hand. */
export function GettingStarted() {
  const { state, act, user } = useStore();
  const ws = useWorkspace();
  const nav = useNavigate();
  const [all, setAll] = useState(false);
  if (!ws || user?.role !== 'admin' || state.settings.gettingStarted?.dismissed) return null;
  const s = state.settings;
  const realEvents = state.events.filter((e) => !e.sample);
  const items = [
    { id: 'profile', title: 'Complete your company profile', hint: 'Address & contact on proposals and invoices', done: !!s.company.address, go: () => nav('/settings?tab=general') },
    { id: 'team', title: 'Invite your team', hint: 'Sales, planners, production, finance', done: state.users.filter((u) => SEAT_ROLES.includes(u.role)).length > 1, go: () => nav('/settings?tab=users') },
    { id: 'lead', title: 'Add your first real inquiry', hint: 'Or share your inquiry form', done: realEvents.length > 0, go: () => nav('/pipeline') },
    { id: 'proposal', title: 'Send a proposal', hint: 'Clients pick extras and accept online', done: state.events.some((e) => e.proposals.some((p) => ['active', 'accepted'].includes(p.status))), go: () => nav(state.events[0] ? `/events/${state.events[0].id}?tab=proposal` : '/pipeline') },
    { id: 'vendors', title: 'Add vendors you work with', hint: 'Florists, caterers, AV, agencies', done: state.vendors.length > 0, go: () => nav('/vendors') },
    { id: 'payments', title: 'Accept online payments', hint: 'Connect Stripe (test mode)', done: !!s.paymentsConnected, action: () => act('PAYMENTS_CONNECT', { provider: 'stripe' }) },
    { id: 'brand', title: 'Brand your client portal', hint: 'Colors & welcome message', done: !!(s.company.brandColor && BRAND_COLORS.some((b) => b.id === s.company.brandColor && b.id !== DEFAULT_BRAND)) || !!s.company.portalWelcome, go: () => nav('/settings?tab=billing') },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const shown = all ? items : items.filter((i) => !i.done).slice(0, 3);
  return (
    <Card className="gs-card">
      <div className="gs-head">
        <div className="gs-progress">
          <b>Get {s.company.name} ready</b>
          <span className="faint text-sm">{done} of {items.length} steps done</span>
          <ProgressBar value={(done / items.length) * 100} tone="ok" />
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Button size="sm" variant="ghost" onClick={() => setAll((x) => !x)}>{all ? 'Show next steps only' : `Show all ${items.length} steps`}</Button>
          <Button size="sm" variant="ghost" onClick={() => act('GETTING_STARTED_DISMISS')}>Hide</Button>
        </div>
      </div>
      <ul className="gs-list">
        {shown.map((i) => (
          <li key={i.id} className={`gs-item ${i.done ? 'done' : ''}`}>
            <span className="gs-check">{i.done && <Icon name="check" size={13} strokeWidth={2.5} />}</span>
            <span className="grow"><div className="gs-title"><b>{i.title}</b></div><div className="faint text-sm">{i.hint}</div></span>
            {!i.done && <Button size="sm" onClick={i.action ?? i.go}>{i.action ? 'Connect' : 'Open'}</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
