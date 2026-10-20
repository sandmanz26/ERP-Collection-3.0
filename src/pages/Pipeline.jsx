import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Modal, Field, useForm, Badge, Money, PillSelect, Button } from '../design-system/index.js';
import { AvailabilityCheck } from '../components/Availability.jsx';
import { stageLabel, transitionBlockers } from '../lib/lifecycle.js';
import { fmtDate, diffDays } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { proposalTotals, eventContext, toUSD, clientOf } from '../lib/derived.js';
import { CURRENCIES } from '../lib/money.js';
import { LOST_REASONS } from '../data/config.js';

const COLS = ['lead', 'qualified', 'proposal_sent', 'negotiation', 'booked'];

export default function Pipeline() {
  const { state, act, today } = useStore();
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [source, setSource] = useState('All');
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [lostFor, setLostFor] = useState(null);

  const evs = state.events.filter((e) => source === 'All' || e.source === source);
  // Simulates an inbound marketplace lead email (The Knot / WeddingWire / Bark) parsed into a structured inquiry.
  const simulateMarketplace = () => {
    const markets = ['The Knot', 'WeddingWire', 'Bark'];
    const m = markets[Math.floor(Math.random() * markets.length)];
    const names = ['Taylor Brooks', 'Jordan Reyes', 'Morgan Ellis', 'Casey Nguyen', 'Riley Patel'];
    const n = names[Math.floor(Math.random() * names.length)];
    const d = new Date(); d.setDate(d.getDate() + 120 + Math.floor(Math.random() * 200)); while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    act('LEAD_CREATE', { name: `${n.split(' ')[1]} Wedding`, eventTypeId: 'wedding', clientName: n, email: `${n.split(' ')[0].toLowerCase()}@example.com`, source: m, date: d.toISOString().slice(0, 10), guestCount: 80 + Math.floor(Math.random() * 120), budget: 40000 + Math.floor(Math.random() * 80) * 1000, message: `Parsed from ${m} lead notification email` }, { system: true });
  };
  const value = (e) => proposalTotals(state, e)?.total ?? e.budget ?? 0;

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <h1>CRM & Sales Pipeline</h1>
          <div className="muted">Drag cards between stages. Transitions are validated (e.g. Booked requires a fully signed contract).</div>
        </div>
        <a className="btn" href="#/inquiry" target="_blank" rel="noreferrer">Public inquiry form ↗</a>
        <Button onClick={simulateMarketplace}>Simulate marketplace lead</Button>
        <Button variant="primary" onClick={() => setShowNew(true)}>+ New inquiry</Button>
      </div>
      <div className="row mb">
        <span className="muted">Lead source:</span>
        <PillSelect options={['All', ...state.settings.leadSources]} value={source} onChange={setSource} />
      </div>
      <div className="kanban">
        {COLS.map((col) => {
          const items = evs.filter((e) => e.stage === col && (col !== 'booked' || diffDays(e.contract?.signedAt?.slice(0, 10) ?? today, today) <= 60));
          const total = items.reduce((a, e) => a + toUSD(state, value(e), e.currency), 0);
          const weighted = items.reduce((a, e) => a + toUSD(state, value(e), e.currency) * (e.probability / 100), 0);
          return (
            <div key={col} className={`kcol ${over === col ? 'dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(col); }}
              onDragLeave={() => setOver(null)}
              onDrop={() => { setOver(null); if (drag && drag.stage !== col) act('STAGE_CHANGE', { eventId: drag.id, to: col }); setDrag(null); }}>
              <h4><span>{stageLabel(col)}</span><span>{items.length}</span></h4>
              <div className="faint" style={{ fontSize: 11 }}>{fmtMoney(total)} · weighted {fmtMoney(weighted)}</div>
              {items.map((e) => {
                const hold = state.holds.find((h) => h.eventId === e.id && h.status === 'active');
                const next = COLS[COLS.indexOf(col) + 1];
                const blockers = next ? transitionBlockers(e, next, eventContext(state, e, today)) : [];
                return (
                  <div key={e.id} className="kcard" draggable onDragStart={() => setDrag(e)} onDoubleClick={() => nav(`/events/${e.id}`)}>
                    <div className="row between">
                      <Link className="title" to={`/events/${e.id}`}>{e.name}</Link>
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>{clientOf(state, e)?.name}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <Badge>{e.source}</Badge>
                      <Badge tone="brand">{e.probability}%</Badge>
                      {e.date ? <Badge>{fmtDate(e.date)}</Badge> : <Badge tone="warn">no date</Badge>}
                    </div>
                    <div className="row between" style={{ marginTop: 6 }}>
                      <b><Money value={value(e)} currency={e.currency} /></b>
                      {hold && <Badge tone={diffDays(today, hold.expiresAt) <= 2 ? 'danger' : 'warn'}>hold #{hold.priority} · {diffDays(today, hold.expiresAt)}d</Badge>}
                    </div>
                    {next && blockers.length > 0 && <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>Next: {blockers[0]}</div>}
                    {col !== 'booked' && (
                      <div className="row" style={{ marginTop: 6 }}>
                        {next && <Button size="sm" onClick={() => act('STAGE_CHANGE', { eventId: e.id, to: next })}>→ {stageLabel(next)}</Button>}
                        <Button variant="danger" size="sm" onClick={() => setLostFor(e)}>Lost</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Card title="Lost & cancelled" className="mt">
        <table className="t">
          <thead><tr><th>Event</th><th>Source</th><th>Stage</th><th>Reason</th><th>Created</th></tr></thead>
          <tbody>
            {evs.filter((e) => ['lost', 'cancelled_client', 'cancelled_eo'].includes(e.stage)).map((e) => (
              <tr key={e.id}><td><Link to={`/events/${e.id}`}>{e.name}</Link></td><td>{e.source}</td><td>{stageLabel(e.stage)}</td><td>{e.lostReason || e.cancellation?.reason}</td><td>{fmtDate(e.createdAt.slice(0, 10))}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showNew && <NewLeadModal onClose={() => setShowNew(false)} onCreated={() => setShowNew(false)} />}
      {lostFor && <LostModal ev={lostFor} onClose={() => setLostFor(null)} />}
    </div>
  );
}

function LostModal({ ev, onClose }) {
  const { act } = useStore();
  const [reason, setReason] = useState('Budget too low');
  return (
    <Modal title={`Mark "${ev.name}" as lost`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger-solid" onClick={() => { act('MARK_LOST', { eventId: ev.id, reason }); onClose(); }}>Mark lost</Button></>}>
      <Field label="Reason (used in conversion analytics)">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <p className="muted">Active date holds will be released and the next hold in line notified.</p>
    </Modal>
  );
}

export function NewLeadModal({ onClose }) {
  const { state, act } = useStore();
  const [touched, setTouched] = useState(false);
  const [v, , bind] = useForm({ name: '', eventTypeId: 'wedding', clientName: '', clientType: 'individual', email: '', phone: '', country: 'US', vatId: '', source: 'Website form', date: '', guestCount: '', budget: '', currency: 'USD', jurisdictionId: 'US-NY-NYC', venue: '', message: '', hold: true });
  const submit = () => {
    if (!v.name || !v.clientName || !v.email) return setTouched(true);
    act('LEAD_CREATE', v);
    onClose();
  };
  return (
    <Modal title="Capture new inquiry" onClose={onClose} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create lead</Button></>}>
      <div className="grid g3">
        <Field label="Event name" error={touched && !v.name ? 'Required' : null}><input {...bind('name')} placeholder="e.g. Smith–Jones Wedding" /></Field>
        <Field label="Event type (drives templates)">
          <select {...bind('eventTypeId')}>{state.settings.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.segment})</option>)}</select>
        </Field>
        <Field label="Lead source">
          <select {...bind('source')}>{state.settings.leadSources.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Client name" error={touched && !v.clientName ? 'Required' : null}><input {...bind('clientName')} /></Field>
        <Field label="Client type">
          <select {...bind('clientType')}><option value="individual">Individual</option><option value="company">Company</option></select>
        </Field>
        <Field label="Email" error={touched && !v.email ? 'Required' : null}><input {...bind('email')} type="email" /></Field>
        <Field label="Phone"><input {...bind('phone')} /></Field>
        <Field label="Country (ISO)"><input {...bind('country')} /></Field>
        <Field label="VAT ID (B2B EU)"><input {...bind('vatId')} /></Field>
        <Field label="Event date"><input type="date" {...bind('date')} /></Field>
        <Field label="Est. guests"><input type="number" {...bind('guestCount')} /></Field>
        <Field label="Budget"><input type="number" {...bind('budget')} /></Field>
        <Field label="Currency"><select {...bind('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Tax jurisdiction"><select {...bind('jurisdictionId')}>{state.settings.jurisdictions.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></Field>
        <Field label="Location / venue idea"><input {...bind('venue')} /></Field>
      </div>
      <Field label="Inquiry message" style={{ marginTop: 10 }}><textarea {...bind('message')} /></Field>
      <div className="mt"><AvailabilityCheck date={v.date} /></div>
    </Modal>
  );
}
