import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Alert, EmptyState, Field, CommitInput, Button, useDialog } from '../../design-system/index.js';
import { proposalTotals } from '../../lib/derived.js';
import { proposalExpired } from '../../lib/pricing.js';
import { decorSnapshot } from '../../lib/decorApi.js';
import { fmtDate, fmtDateTime } from '../../lib/dates.js';
import { CURRENCIES } from '../../lib/money.js';
import { BUDGET_CATEGORIES } from '../../data/config.js';

export function ProposalTable({ ev, version, totals, internal, editable, onToggleOptional }) {
  const { act } = useStore();
  const upd = (lineId, patch) => act('PROPOSAL_LINE_UPDATE', { eventId: ev.id, versionId: version.id, lineId, patch });
  const cur = version.currency;
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Item</th><th>Category</th><th>Pricing</th><th className="num">Qty</th><th className="num">Unit price</th>
            {internal && <th className="num">Unit cost</th>}
            <th className="num">Amount</th>
            {internal && <><th className="num">Cost</th><th className="num">Margin</th></>}
            <th>Opt.</th>{editable && <th />}
          </tr>
        </thead>
        <tbody>
          {totals.lines.map((l) => (
            <tr key={l.id} style={!l.active ? { opacity: 0.5 } : undefined}>
              <td>
                {l.name}
                {l.decorItemId && <Badge tone="info">decor</Badge>}
                {l.pricing === 'percentage' && <span className="faint"> ({l.pct}%)</span>}
              </td>
              <td>{l.category}</td>
              <td><Badge>{l.pricing.replace('_', ' ')}</Badge></td>
              <td className="num">
                {editable && l.pricing === 'fixed' ? <CommitInput className="inline" type="number" value={l.qty} onCommit={(n) => upd(l.id, { qty: n })} /> : l.pricing === 'per_guest' ? `${l.qtyEff} guests` : l.pricing === 'percentage' ? '—' : l.qty}
              </td>
              <td className="num">
                {editable && l.pricing !== 'percentage' ? <CommitInput className="inline" type="number" value={l.unitPrice} onCommit={(n) => upd(l.id, { unitPrice: n })} />
                  : editable ? <CommitInput className="inline" type="number" value={l.pct} onCommit={(n) => upd(l.id, { pct: n })} />
                    : l.pricing === 'percentage' ? `${l.pct}%` : <Money value={l.unitPrice} currency={cur} />}
              </td>
              {internal && <td className="num">{editable && l.pricing !== 'percentage' ? <CommitInput className="inline" type="number" value={l.unitCost} onCommit={(n) => upd(l.id, { unitCost: n })} /> : <Money value={l.unitCost} currency={cur} />}</td>}
              <td className="num"><Money value={l.amount} currency={cur} /></td>
              {internal && <><td className="num"><Money value={l.cost} currency={cur} /></td><td className="num" style={{ color: l.margin < 0 ? 'var(--danger)' : 'var(--ok)' }}><Money value={l.margin} currency={cur} /></td></>}
              <td>
                {l.optional ? (
                  onToggleOptional ? <input type="checkbox" checked={l.selected} onChange={() => onToggleOptional(l)} /> : editable ? <input type="checkbox" checked={l.selected} onChange={() => upd(l.id, { selected: !l.selected })} title="selected by default" /> : <Badge tone={l.selected ? 'ok' : ''}>{l.selected ? 'selected' : 'optional'}</Badge>
                ) : editable ? <Button variant="ghost" size="sm" title="Make optional (upsell)" onClick={() => upd(l.id, { optional: true, selected: false })}>make opt.</Button> : null}
              </td>
              {editable && <td><Button variant="ghost" size="sm" onClick={() => act('PROPOSAL_LINE_REMOVE', { eventId: ev.id, versionId: version.id, lineId: l.id })}>✕</Button></td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={internal ? 6 : 5}>Subtotal</td><td className="num"><Money value={totals.subtotal} currency={cur} /></td>{internal && <><td className="num"><Money value={totals.cost} currency={cur} /></td><td className="num"><Money value={totals.margin} currency={cur} /> ({totals.marginPct}%)</td></>}<td colSpan={editable ? 2 : 1} /></tr>
          <tr><td colSpan={internal ? 6 : 5}>{totals.tax.label}{totals.tax.note && <div className="faint" style={{ fontWeight: 400 }}>{totals.tax.note}</div>}</td><td className="num"><Money value={totals.tax.taxAmount} currency={cur} /></td>{internal && <td colSpan={2} />}<td colSpan={editable ? 2 : 1} /></tr>
          <tr><td colSpan={internal ? 6 : 5}>TOTAL</td><td className="num"><Money value={totals.total} currency={cur} /></td>{internal && <td colSpan={2} />}<td colSpan={editable ? 2 : 1} /></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function Moodboard({ itemIds }) {
  const db = decorSnapshot();
  if (!itemIds?.length) return <div className="faint">No moodboard items.</div>;
  return (
    <div className="mood">
      {itemIds.map((id) => {
        const it = db.items.find((i) => i.id === id);
        if (!it) return null;
        return (
          <div className="tile" key={id}>
            <div className="img" style={{ background: `linear-gradient(135deg, ${it.swatch}, ${it.swatch}aa)` }} />
            <div className="cap"><b>{it.name}</b><div className="faint">{it.sku}</div></div>
          </div>
        );
      })}
    </div>
  );
}

export default function ProposalTab({ ev }) {
  const dialog = useDialog();
  const { state, act, today } = useStore();
  const [selId, setSelId] = useState(null);
  const [internal, setInternal] = useState(true);
  const [addCat, setAddCat] = useState('');
  const version = ev.proposals.find((p) => p.id === selId) ?? ev.proposals.find((p) => ['active', 'accepted'].includes(p.status)) ?? ev.proposals[ev.proposals.length - 1];
  if (!version) {
    return <Card><EmptyState>No proposal yet.<div className="mt"><Button variant="primary" onClick={() => act('PROPOSAL_CREATE', { eventId: ev.id })}>Build proposal from event-type template</Button></div></EmptyState></Card>;
  }
  const totals = proposalTotals(state, ev, version);
  const editable = version.status === 'draft';
  const expired = proposalExpired(version, today);
  const db = decorSnapshot();
  const locked = ev.contract?.immutable;

  return (
    <div className="grid" style={{ gridTemplateColumns: '230px minmax(0,1fr)' }}>
      <Card title="Versions">
        {ev.proposals.slice().reverse().map((p) => (
          <div key={p.id} onClick={() => setSelId(p.id)} className="card" style={{ padding: 10, cursor: 'pointer', borderColor: p.id === version.id ? 'var(--brand)' : undefined }}>
            <div className="row between"><b>v{p.version}</b><StatusBadge status={proposalExpired(p, today) && p.status === 'active' ? 'expired' : p.status} /></div>
            <div className="faint" style={{ fontSize: 11.5 }}>{fmtDateTime(p.createdAt)}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{p.changeSummary}</div>
          </div>
        ))}
        {!locked && <Button className="mt" onClick={async () => { const s = await dialog.prompt({ title: 'New proposal version', label: 'What changes in this version?', defaultValue: `Revision of v${version.version}` }); s && act('PROPOSAL_NEW_VERSION', { eventId: ev.id, fromId: version.id, changeSummary: s }); }}>+ New version from v{version.version}</Button>}
        {locked && <Alert tone="info">Contract signed — further changes go through Change Orders.</Alert>}
      </Card>
      <div>
        <Card
          title={`Proposal v${version.version}`}
          actions={
            <div className="row">
              <label className="row" style={{ fontSize: 12 }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal view (cost & margin)</label>
              {version.status === 'draft' && <Button variant="primary" onClick={() => act('PROPOSAL_ACTIVATE', { eventId: ev.id, versionId: version.id })}>Send to client (make active)</Button>}
              {version.status === 'active' && <Button variant="success" disabled={expired} onClick={() => act('PROPOSAL_ACCEPT', { eventId: ev.id, versionId: version.id })}>Record client acceptance</Button>}
            </div>
          }
        >
          {expired && <Alert tone="danger">This proposal expired on {fmtDate(version.validUntil)} — prices are no longer guaranteed. Create a new version to refresh.</Alert>}
          <div className="row mb">
            <Field label="Guest count (per-guest lines)"><CommitInput type="number" disabled={!editable} value={version.guestCount} onCommit={(n) => act('PROPOSAL_UPDATE', { eventId: ev.id, versionId: version.id, patch: { guestCount: n } })} /></Field>
            <Field label="Tax jurisdiction"><select disabled={!editable} value={version.jurisdictionId} onChange={(e) => act('PROPOSAL_UPDATE', { eventId: ev.id, versionId: version.id, patch: { jurisdictionId: e.target.value } })}>{state.settings.jurisdictions.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.rate}%)</option>)}</select></Field>
            <Field label="Currency"><select disabled={!editable} value={version.currency} onChange={(e) => act('PROPOSAL_UPDATE', { eventId: ev.id, versionId: version.id, patch: { currency: e.target.value } })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Valid until"><input type="date" disabled={!editable} value={version.validUntil} onChange={(e) => act('PROPOSAL_UPDATE', { eventId: ev.id, versionId: version.id, patch: { validUntil: e.target.value } })} /></Field>
          </div>
          <ProposalTable ev={ev} version={version} totals={totals} internal={internal} editable={editable} />
          {editable && (
            <div className="row mt">
              <select value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                <option value="">Add from service catalog…</option>
                {state.settings.catalog.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.pricing}</option>)}
              </select>
              <Button disabled={!addCat} onClick={() => { act('PROPOSAL_LINE_ADD', { eventId: ev.id, versionId: version.id, catalogId: addCat }); setAddCat(''); }}>Add</Button>
              <Button onClick={async () => { const r = await dialog.form({ title: 'Custom line item', fields: [{ name: 'name', label: 'Item name', required: true }, { name: 'category', label: 'Category', type: 'select', options: BUDGET_CATEGORIES, defaultValue: 'Other' }, { name: 'pricing', label: 'Pricing', type: 'select', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'per_guest', label: 'Per guest' }], defaultValue: 'fixed' }, { name: 'unitPrice', label: `Unit price (${version.currency})`, type: 'number', required: true, defaultValue: 1000 }, { name: 'unitCost', label: 'Unit cost', type: 'number', defaultValue: 600 }] }); r && act('PROPOSAL_LINE_ADD', { eventId: ev.id, versionId: version.id, custom: r }); }}>+ Custom line</Button>
            </div>
          )}
        </Card>
        <Card title="Visual moodboard (pulled from Decor Inventory)">
          <Moodboard itemIds={version.moodboard} />
          {editable && (
            <div className="row mt">
              <select onChange={(e) => { if (e.target.value) act('PROPOSAL_UPDATE', { eventId: ev.id, versionId: version.id, patch: { moodboard: [...version.moodboard, e.target.value] } }); e.target.value = ''; }}>
                <option value="">+ Add decor item photo…</option>
                {db.items.filter((i) => !version.moodboard.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
