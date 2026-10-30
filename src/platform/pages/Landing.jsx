import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Card, Callout, JourneyMap, Badge } from '../../design-system/index.js';
import { SiteNav, SiteFooter, PricingCards, CompareTable, IntervalToggle } from './SiteChrome.jsx';
import { PLATFORM, TRIAL_DAYS } from '../plans.js';
import { usePlatform } from '../PlatformStore.jsx';

const DEMO_STOPS = [
  { id: 'p', label: 'Proposal', date: 'Jun 4', status: 'done' },
  { id: 'c', label: 'Contract', date: 'Jun 9', status: 'done' },
  { id: 's', label: 'Date secured', date: 'Jun 9', status: 'done' },
  { id: 'pl', label: 'Planning', status: 'current', icon: 'list' },
  { id: 'f', label: 'Final details', date: 'Dec 26', status: 'todo', icon: 'users' },
  { id: 'd', label: 'Event day', date: 'Jan 9', status: 'todo', icon: 'heart', emphasis: true },
];

const FEATURES = [
  { icon: 'pipeline', title: 'Sell without double-booking', text: 'Inquiries, date holds that expire, proposals with optional extras, and contracts signed online. A date is only locked when the deposit lands.' },
  { icon: 'wallet', title: 'Money that adds up', text: 'Payment schedules, multiple payers (the parents pay catering), change orders, late fees, deferred revenue and local taxes — VAT, sales tax, PPN, GST.' },
  { icon: 'store', title: 'Vendors & outsourced crew', text: 'RFQs, bookings, insurance checks, agency rosters and QR credentials. When a vendor cancels, a replacement request goes out automatically.' },
  { icon: 'clock', title: 'Timelines that catch clashes', text: 'Planning Gantt, run of show and an event-day board that flags a loading dock booked twice or a sound check before the rig is up.' },
  { icon: 'phone', title: 'Day-of, even offline', text: 'Mobile run of show, guest and crew check-in, vendor arrivals, overtime approved on site and the card box handed back with names.' },
  { icon: 'heart', title: 'Clients who know where they are', text: 'A portal with a journey map, one “to prepare” list, payments and the people behind their event. Fewer “just checking in” emails.' },
];

const FAQ = [
  ['Do I need a credit card for the trial?', `No. You get ${TRIAL_DAYS} days with everything in Studio unlocked. When the trial ends your workspace becomes read-only until you pick a plan — nothing is deleted.`],
  ['Do my clients and vendors need a paid seat?', 'No. Seats are for your team. Client portal, vendor portal and day-of crew logins are free and unlimited on plans that include them.'],
  ['Which countries and currencies are supported?', 'United States, the EU, UK, Switzerland, Indonesia, Singapore and Australia — each with its currency, tax rules and local payment rails.'],
  ['Can I leave with my data?', 'Yes. Exports stay available even when a workspace is read-only, and you can delete the workspace (and every record in it) from Plan & billing.'],
];

export default function Landing() {
  const nav = useNavigate();
  const { pact } = usePlatform();
  const [interval, setIv] = useState('month');
  return (
    <div className="site">
      <SiteNav />
      <main>
        <div className="site-wrap hero">
          <div>
            <h1>From first inquiry to the last dance.</h1>
            <p className="lead">{PLATFORM.name} runs a wedding or event agency in one place: sales, contracts and payments, vendors and crews, the run of show — and a portal that keeps every couple and client in the loop.</p>
            <div className="hero-ctas">
              <Button variant="primary" className="lg" onClick={() => nav('/signup')}>Start your {TRIAL_DAYS}-day free trial</Button>
              <Button className="lg" onClick={() => pact('ENTER_WORKSPACE', { tenantId: 'tn_lumiere' })}><Icon name="play" size={15} /> Explore the live demo</Button>
            </div>
            <div className="hero-note">No credit card · set up in about 3 minutes · cancel anytime</div>
          </div>
          <div className="hero-visual" aria-label="Product preview">
            <div className="hero-float" style={{ top: 0, left: -28 }}><span className="ic" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}><Icon name="lock" size={15} /></span><div><b>Deposit received</b>Jan 9 is locked for Emily &amp; James</div></div>
            <Card title="Carter–Walker Wedding" actions={<Badge tone="ok">On track</Badge>} style={{ margin: '52px 0 44px' }}>
              <div className="muted" style={{ marginBottom: 6 }}>You are in <b>Planning</b> · 79 days to go</div>
              <JourneyMap stops={DEMO_STOPS} position={3.6} pinSub="Today" />
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                <Callout compact tone="warning" icon="sun" title="Weather call due Jan 6">Plan A: rooftop terrace · Plan B: Hotel Hugo bistro</Callout>
                <Callout compact tone="info" icon="truck" title="3 of 4 vendors confirmed">Band confirmation pending — COI renewal requested</Callout>
              </div>
            </Card>
            <div className="hero-float" style={{ bottom: 0, right: -18 }}><span className="ic" style={{ background: 'var(--color-brand-soft)', color: 'var(--color-brand-strong)' }}><Icon name="hardhat" size={15} /></span><div><b>29 crew scheduled</b>4 agencies · QR credentials ready</div></div>
          </div>
        </div>
        <div className="site-wrap strip"><span>Built for</span><b>Weddings</b><b>Corporate conferences</b><b>Product launches</b><b>Private celebrations</b><b>Destination events</b></div>

        <section className="section alt" id="features">
          <div className="site-wrap">
            <div className="section-head"><h2>Events are not projects. The tool shouldn't pretend they are.</h2><p>An event is a couple, two families, a dozen vendors and outsourced crews that meet once, on one day, on one timeline. {PLATFORM.name} is built around that.</p></div>
            <div className="feature-grid">{FEATURES.map((f) => <div key={f.title} className="feature"><span className="ic"><Icon name={f.icon} size={18} /></span><h3>{f.title}</h3><p>{f.text}</p></div>)}</div>
          </div>
        </section>

        <section className="section">
          <div className="site-wrap">
            <div className="section-head"><h2>Your workspace, ready in three minutes.</h2></div>
            <div className="steps3">
              <div><h3>Create your workspace</h3><p>Pick a URL like <b>yourstudio.{PLATFORM.domain}</b>. Your data lives in its own isolated workspace.</p></div>
              <div><h3>Answer six quick questions</h3><p>Country and currency, the events you run, your payment terms, your team and your colors — we configure taxes, templates and the catalog for you.</p></div>
              <div><h3>Invite your team and clients</h3><p>Start from a sample wedding or a clean slate. A checklist walks you through your first proposal and online payments.</p></div>
            </div>
          </div>
        </section>

        <section className="section alt" id="pricing">
          <div className="site-wrap">
            <div className="section-head"><h2>Simple plans. Clients and vendors are always free.</h2><p>Every plan starts with a {TRIAL_DAYS}-day trial of Studio. Prices in USD, taxes excluded.</p></div>
            <IntervalToggle value={interval} onChange={setIv} />
            <PricingCards interval={interval} onChoose={() => nav('/signup')} />
            <CompareTable />
          </div>
        </section>

        <section className="section" id="faq">
          <div className="site-wrap">
            <div className="section-head"><h2>Questions planners ask us</h2></div>
            <div className="faq">{FAQ.map(([q, a]) => <div key={q}><h4>{q}</h4><p>{a}</p></div>)}</div>
          </div>
        </section>

        <div className="site-wrap"><div className="cta-band"><h2>Run your next event on {PLATFORM.name}.</h2><Button variant="primary" className="lg" onClick={() => nav('/signup')}>Start free trial</Button></div></div>
      </main>
      <SiteFooter />
    </div>
  );
}
