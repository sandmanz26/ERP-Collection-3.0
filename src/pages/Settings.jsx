import React, { useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Card, Tabs, Badge, CommitInput, ConfirmButton, KeyValue } from '../design-system/index.js';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FEATURES = { guestHouseholds: 'Household-based guest list', seating: 'Seating chart', registration: 'Attendee registration', poRequired: 'PO required', multiplePayers: 'Multiple payers', clientApprovalLayers: 'Layered client approvals', rsvp: 'RSVP', checkInQR: 'QR check-in' };

export default function Settings() {
  const { state, act } = useStore();
  const [tab, setTab] = useState('general');
  const s = state.settings;
  const set = (key, value, label) => act('SETTINGS_SET', { key, value, label });
  return (
    <div>
      <div className="page-head"><div className="grow"><h1>Settings</h1><div className="muted">Segment differences (social vs corporate) are configuration on Event Types — not separate code.</div></div>
        <ConfirmButton variant="danger" message="Reset ALL demo data to the original seed? (The reset itself is logged.)" onConfirm={() => act('RESET_DEMO')}>Reset demo data</ConfirmButton>
      </div>
      <Tabs tabs={[{ id: 'general', label: 'General & capacity' }, { id: 'types', label: 'Event types' }, { id: 'catalog', label: 'Service catalog' }, { id: 'tax', label: 'Tax jurisdictions' }, { id: 'policies', label: 'Payment & cancellation' }, { id: 'users', label: 'Users & roles' }]} value={tab} onChange={setTab} />
      {tab === 'general' && (
        <div className="grid g2">
          <Card title="Company">
            <KeyValue rows={[['Name', s.company.name], ['Country', s.company.country], ['EU VAT registration', s.company.euVatCountry], ['Base currency', s.company.baseCurrency], ['Address', s.company.address]]} />
            <h4 className="mt2">Exchange rates (1 unit → USD)</h4>
            {Object.entries(s.fxRates).map(([c, r]) => <div key={c} className="row">{c} <CommitInput className="inline" type="number" value={r} onCommit={(n) => set('fxRates', { ...s.fxRates, [c]: n }, `FX ${c}`)} /></div>)}
          </Card>
          <Card title="Capacity, holds & deadlines">
            <div className="row mb">Default events per date <CommitInput className="inline" type="number" value={s.capacity.default} onCommit={(n) => set('capacity', { ...s.capacity, default: n }, 'default capacity')} /></div>
            {DOW.map((d, i) => <div key={d} className="row">{d} <CommitInput className="inline" type="number" value={s.capacity.byWeekday[i] ?? ''} onCommit={(n) => set('capacity', { ...s.capacity, byWeekday: { ...s.capacity.byWeekday, [i]: n || undefined } }, `capacity ${d}`)} /></div>)}
            <div className="row mt">Hold expiry (days) <CommitInput className="inline" type="number" value={s.holdExpiryDays} onCommit={(n) => set('holdExpiryDays', n)} /></div>
            <div className="row">Hold reminder (days before) <CommitInput className="inline" type="number" value={s.holdReminderDays} onCommit={(n) => set('holdReminderDays', n)} /></div>
            <div className="row">Proposal validity (days) <CommitInput className="inline" type="number" value={s.proposalValidityDays} onCommit={(n) => set('proposalValidityDays', n)} /></div>
            <div className="row">Final headcount deadline (T-days) <CommitInput className="inline" type="number" value={s.finalHeadcountDays} onCommit={(n) => set('finalHeadcountDays', n)} /></div>
            <div className="row">Late fee % / month <CommitInput className="inline" type="number" value={s.lateFeePct} onCommit={(n) => set('lateFeePct', n)} /></div>
            <div className="row">Accounting provider <select value={s.accountingProvider} onChange={(e) => set('accountingProvider', e.target.value)}><option value="quickbooks">QuickBooks</option><option value="xero">Xero</option></select></div>
          </Card>
        </div>
      )}
      {tab === 'types' && s.eventTypes.map((t) => (
        <Card key={t.id} title={`${t.name}`} actions={<Badge tone={t.segment === 'social' ? 'info' : 'brand'}>{t.segment}</Badge>}>
          <div className="grid g3">
            <div>
              <h4>Active features</h4>
              {Object.entries(FEATURES).map(([k, l]) => <label key={k} className="row"><input type="checkbox" checked={!!t.features[k]} onChange={(e) => act('EVENT_TYPE_UPDATE', { eventTypeId: t.id, patch: { features: { ...t.features, [k]: e.target.checked } } })} />{l}</label>)}
            </div>
            <div>
              <h4>Templates</h4>
              <div className="faint" style={{ fontSize: 12 }}>Proposal: {t.proposalTemplate.map((c) => s.catalog.find((x) => x.id === c)?.name).join(', ')}</div>
              <div className="faint mt" style={{ fontSize: 12 }}>Upsells: {t.optionalTemplate.map((c) => s.catalog.find((x) => x.id === c)?.name).join(', ')}</div>
              <div className="faint mt" style={{ fontSize: 12 }}>Functions: {t.defaultSubEvents.join(', ')}</div>
              <div className="faint mt" style={{ fontSize: 12 }}>Forms: {t.forms.join(', ')}</div>
              <div className="faint mt" style={{ fontSize: 12 }}>Payment: {s.paymentSchedules.find((p) => p.id === t.paymentScheduleId)?.name} · Cancellation: {s.cancellationPolicies.find((p) => p.id === t.cancellationPolicyId)?.name}</div>
            </div>
            <div>
              <h4>Task template (T-minus)</h4>
              <div style={{ fontSize: 12, maxHeight: 180, overflowY: 'auto' }}>{t.taskTemplate.map((x) => <div key={x.key}>T{x.offsetDays >= 0 ? '+' : ''}{x.offsetDays} · {x.title} {x.assigneeType === 'client' && <Badge>client</Badge>}</div>)}</div>
            </div>
          </div>
        </Card>
      ))}
      {tab === 'catalog' && (
        <Card>
          <table className="t">
            <thead><tr><th>Service</th><th>Category</th><th>Pricing</th><th className="num">Unit price / %</th><th className="num">Unit cost / cost %</th><th>Decor item</th></tr></thead>
            <tbody>{s.catalog.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.category}</td><td><Badge>{c.pricing}</Badge></td>
                <td className="num">{c.pricing === 'percentage' ? <CommitInput className="inline" type="number" value={c.pct} onCommit={(n) => act('CATALOG_UPDATE', { catalogId: c.id, patch: { pct: n } })} /> : <CommitInput className="inline" type="number" value={c.unitPrice} onCommit={(n) => act('CATALOG_UPDATE', { catalogId: c.id, patch: { unitPrice: n } })} />}</td>
                <td className="num">{c.pricing === 'percentage' ? `${c.costPct}%` : <CommitInput className="inline" type="number" value={c.unitCost} onCommit={(n) => act('CATALOG_UPDATE', { catalogId: c.id, patch: { unitCost: n } })} />}</td>
                <td className="faint">{c.decorItemId || '—'}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'tax' && (
        <Card>
          <table className="t">
            <thead><tr><th>Jurisdiction</th><th>Region</th><th className="num">Rate %</th><th>Service fees taxable (US)</th><th>Notes</th></tr></thead>
            <tbody>{s.jurisdictions.map((j) => (
              <tr key={j.id}><td>{j.name}</td><td>{j.region}</td>
                <td className="num"><CommitInput className="inline" type="number" value={j.rate} onCommit={(n) => set('jurisdictions', s.jurisdictions.map((x) => (x.id === j.id ? { ...x, rate: n } : x)), `tax rate ${j.name}`)} /></td>
                <td>{j.region === 'US' ? <input type="checkbox" checked={j.taxServiceFees} onChange={(e) => set('jurisdictions', s.jurisdictions.map((x) => (x.id === j.id ? { ...x, taxServiceFees: e.target.checked } : x)), `service fee taxability ${j.name}`)} /> : '—'}</td>
                <td className="faint" style={{ fontSize: 12 }}>{j.region !== 'US' ? 'Reverse charge for B2B clients with a VAT ID in another country' : ''}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'policies' && (
        <div className="grid g2">
          {s.paymentSchedules.map((p) => <Card key={p.id} title={p.name}>{p.installments.map((i) => <div key={i.label}>{i.label}</div>)}</Card>)}
          {s.cancellationPolicies.map((p) => <Card key={p.id} title={`Cancellation: ${p.name}`}>{p.rows.map((r) => <div key={r.minDaysBefore}>≥ {r.minDaysBefore} days: {r.forfeitPct}% forfeited</div>)}<p className="faint" style={{ fontSize: 12 }}>{p.forceMajeure}</p></Card>)}
        </div>
      )}
      {tab === 'users' && (
        <Card>
          <table className="t">
            <thead><tr><th>User</th><th>Role</th><th>Email</th><th>Linked to</th><th>Portal permissions</th></tr></thead>
            <tbody>{state.users.map((u) => <tr key={u.id}><td>{u.name}</td><td><Badge>{u.role}</Badge></td><td>{u.email}</td><td>{u.clientId ? state.clients.find((c) => c.id === u.clientId)?.name : u.vendorId ? state.vendors.find((v) => v.id === u.vendorId)?.name : u.staffId ?? '—'}</td><td style={{ fontSize: 12 }}>{(u.permissions || []).join(', ')}{u.payerScope ? ` · pays: ${u.payerScope.join(', ')}` : ''}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
