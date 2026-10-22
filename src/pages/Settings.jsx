import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../platform/PlatformStore.jsx';
import BillingPanel from '../platform/pages/Billing.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Card, Tabs, Badge, CommitInput, ConfirmButton, KeyValue, PillSelect, Button, useDialog, Icon, Avatar } from '../design-system/index.js';
import { fmtDateTime } from '../lib/dates.js';
import { ROLES, CLIENT_PERMISSIONS, BUDGET_CATEGORIES } from '../data/config.js';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FEATURES = { guestHouseholds: 'Household-based guest list', seating: 'Seating chart', registration: 'Attendee registration', poRequired: 'PO required', multiplePayers: 'Multiple payers', clientApprovalLayers: 'Layered client approvals', rsvp: 'RSVP', checkInQR: 'QR check-in' };

export default function Settings() {
  const { state, act } = useStore();
  const dialog = useDialog();
  const ws = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'general';
  const setTab = (t) => setSp({ tab: t });
  const s = state.settings;
  const set = (key, value, label) => act('SETTINGS_SET', { key, value, label });
  return (
    <div>
      <div className="page-head"><div className="grow"><h1>Settings</h1><div className="muted">Segment differences (social vs corporate) are configuration on Event Types — not separate code.</div></div>
        {(!ws || ws.isDemo) && <ConfirmButton variant="danger" message="Reset ALL demo data to the original seed? (The reset itself is logged.)" onConfirm={() => act('RESET_DEMO')}>Reset demo data</ConfirmButton>}
      </div>
      <Tabs tabs={[{ id: 'general', label: 'General & capacity' }, { id: 'types', label: 'Event types' }, { id: 'catalog', label: 'Service catalog' }, { id: 'tax', label: 'Tax jurisdictions' }, { id: 'policies', label: 'Payment & cancellation' }, { id: 'users', label: 'Users & roles' }].concat(ws && state.users.find((u) => u.id === state.currentUserId)?.role === 'admin' ? [{ id: 'billing', label: 'Plan & billing' }] : [])} value={tab} onChange={setTab} />
      {tab === 'billing' && ws && <BillingPanel />}
      {tab === 'general' && (
        <div className="grid g2">
          <Card title="Company">
            {[['name', 'Name'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Billing email'], ['website', 'Website'], ['taxId', 'Tax ID (VAT / NPWP / EIN)']].map(([k, l]) => (
              <div key={k} className="row">{l} <CommitInput className="inline" value={s.company[k] ?? ''} onCommit={(v) => act('COMPANY_UPDATE', { patch: { [k]: v } })} /></div>
            ))}
            <KeyValue rows={[['Country', s.company.country], ['Base currency', s.company.baseCurrency], s.company.euVatCountry && ['EU VAT registration', s.company.euVatCountry], s.company.timezone && ['Time zone', s.company.timezone]]} />
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
            <div className="row">RSVP deadline (T-days) <CommitInput className="inline" type="number" value={s.rsvpDeadlineDays} onCommit={(n) => set('rsvpDeadlineDays', n)} /></div>
            <label className="row"><input type="checkbox" checked={!!s.capacity.plannerBased} onChange={(e) => set('capacity', { ...s.capacity, plannerBased: e.target.checked }, 'planner-based capacity')} />Cap daily capacity by number of lead planners</label>
            <div className="row">Late fee % / month <CommitInput className="inline" type="number" value={s.lateFeePct} onCommit={(n) => set('lateFeePct', n)} /></div>
            <h4 className="mt">Risk rules</h4>
            {[['finalPaymentCutoffDays', 'Final balance cutoff (T-days)'], ['leadResponseHours', 'Lead first-response SLA (hours)'], ['returnedPaymentFee', 'Returned-payment fee'], ['overtimeCrewMultiplier', 'Crew overtime multiplier'], ['overtimeMarkupPct', 'Overtime markup %'], ['weatherCallHours', 'Default weather call (hours before)'], ['vendorLateMinutes', 'Vendor late after (minutes)']].map(([k, l]) => <div key={k} className="row">{l} <CommitInput className="inline" type="number" value={s[k]} onCommit={(n) => set(k, n)} /></div>)}
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
              <div style={{ fontSize: 12, maxHeight: 220, overflowY: 'auto' }}>{[...t.taskTemplate].sort((a, b) => a.offsetDays - b.offsetDays).map((x) => (
                <div key={x.key} className="row between">
                  <span>T{x.offsetDays >= 0 ? '+' : ''}{x.offsetDays} · {x.title} {x.assigneeType === 'client' && <Badge>client</Badge>}</span>
                  <Button variant="ghost" size="sm" aria-label="Remove task" onClick={() => act('EVENT_TYPE_UPDATE', { eventTypeId: t.id, patch: { taskTemplate: t.taskTemplate.filter((y) => y.key !== x.key) } })}><Icon name="x" size={14} /></Button>
                </div>
              ))}</div>
              <Button size="sm" className="mt" onClick={async () => {
                const r = await dialog.form({ title: `Add task to ${t.name} template`, fields: [{ name: 'title', label: 'Task', required: true }, { name: 'offsetDays', label: 'Days relative to event (e.g. -30)', type: 'number', required: true, defaultValue: -30 }, { name: 'assigneeType', label: 'Assignee', type: 'select', options: ['staff', 'client', 'vendor'], defaultValue: 'staff' }, { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high'], defaultValue: 'medium' }] });
                r && act('EVENT_TYPE_UPDATE', { eventTypeId: t.id, patch: { taskTemplate: [...t.taskTemplate, { ...r, key: `k${Date.now()}`, category: 'general' }] } });
              }}>+ Template task</Button>
            </div>
          </div>
        </Card>
      ))}
      {tab === 'catalog' && (
        <Card title={`Service catalog (prices in ${s.company.baseCurrency}, converted per proposal currency)`} actions={<Button variant="primary" onClick={async () => {
          const r = await dialog.form({ title: 'Add catalog item', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: BUDGET_CATEGORIES, defaultValue: 'Other' }, { name: 'pricing', label: 'Pricing', type: 'select', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'per_guest', label: 'Per guest' }, { value: 'percentage', label: 'Percentage of subtotal' }], defaultValue: 'fixed' }, { name: 'unitPrice', label: 'Unit price', type: 'number', defaultValue: 0 }, { name: 'unitCost', label: 'Unit cost', type: 'number', defaultValue: 0 }, { name: 'pct', label: 'Percent (percentage pricing)', type: 'number', defaultValue: 0 }] });
          r && act('CATALOG_ADD', { data: { ...r, isServiceFee: r.pricing === 'percentage' } });
        }}>+ Item</Button>}>
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
        <Card title="Users & roles" actions={<Button variant="primary" onClick={async () => {
          const r = await dialog.form({ title: 'Invite user', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'role', label: 'Role', type: 'select', options: ROLES.map((x) => ({ value: x.id, label: x.label })), defaultValue: 'planner' }, { name: 'clientId', label: 'Client account (client role)', type: 'select', options: [{ value: '', label: '—' }, ...state.clients.map((c) => ({ value: c.id, label: c.name }))], defaultValue: '' }, { name: 'vendorId', label: 'Vendor (vendor role)', type: 'select', options: [{ value: '', label: '—' }, ...state.vendors.map((v) => ({ value: v.id, label: v.name }))], defaultValue: '' }] });
          r && act('USER_CREATE', { data: { ...r, clientId: r.clientId || undefined, vendorId: r.vendorId || undefined } });
        }}>+ Invite user</Button>}>
          <table className="t">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Linked to</th><th>Portal permissions (clients)</th><th /></tr></thead>
            <tbody>{state.users.map((u) => (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar name={u.name} /><div><b>{u.name}</b><div className="faint text-xs">{u.email}{u.title ? ` · ${u.title}` : ''}</div></div></div></td>
                <td><select value={u.role} disabled={u.id === state.currentUserId} onChange={(e) => act('USER_UPDATE', { userId: u.id, patch: { role: e.target.value } })}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td>
                <td><Badge tone={{ active: 'ok', invited: 'info', suspended: 'danger' }[u.status]}>{u.status}</Badge>{u.mfa && <div className="faint text-xs"><Icon name="shield" size={11} /> MFA</div>}{(state.loginAttempts?.[u.email.toLowerCase()]?.count ?? 0) > 0 && <div className="text-xs text-danger">{state.loginAttempts[u.email.toLowerCase()].count} failed attempt(s){state.loginAttempts[u.email.toLowerCase()].lockedUntil ? ', locked' : ''}</div>}</td>
                <td className="text-sm">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="faint">never</span>}</td>
                <td>{u.clientId ? state.clients.find((c) => c.id === u.clientId)?.name : u.vendorId ? state.vendors.find((v) => v.id === u.vendorId)?.name : u.staffId ?? '—'}</td>
                <td>{u.role === 'client' ? <PillSelect multi options={CLIENT_PERMISSIONS.map((p) => ({ id: p.id, label: p.label }))} value={u.permissions || []} onChange={(perms) => act('USER_UPDATE', { userId: u.id, patch: { permissions: perms } })} /> : <span className="faint">role-based</span>}{u.payerScope && <div className="faint" style={{ fontSize: 11 }}>pays: {u.payerScope.join(', ')}</div>}</td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <ConfirmButton size="sm" title="Reset password" message={`Issue a temporary password ("welcome123") to ${u.name} and clear any lockout?`} onConfirm={() => act('USER_PASSWORD_RESET', { userId: u.id })}><Icon name="key" size={13} /> Reset</ConfirmButton>
                    {u.id !== state.currentUserId && (u.status === 'suspended'
                      ? <Button size="sm" onClick={() => act('USER_STATUS', { userId: u.id, status: 'active' })}>Reactivate</Button>
                      : <ConfirmButton size="sm" variant="danger" title="Suspend account" message={`${u.name} will no longer be able to sign in. Their history stays in the activity log.`} onConfirm={() => act('USER_STATUS', { userId: u.id, status: 'suspended' })}>Suspend</ConfirmButton>)}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
