// UI for obligations outside the client contract: hotel room blocks, severe allergies, permits,
// licensed capacity, guarantee-aware final headcount and tradition templates. Rules: lib/obligations.js.
import React from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Button, Money, ProgressBar, EmptyState, Icon, useDialog, printDocument } from '../../design-system/index.js';
import { roomBlockStatus, allergySheet, permitPlan, capacityIssues, guaranteeCheck, FUNCTION_TEMPLATES } from '../../lib/obligations.js';
import { finalHeadcountDeadline, headcount } from '../../lib/derived.js';
import { fmtDate, addDays } from '../../lib/dates.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- hotel room blocks ---------- */
export function RoomBlocksCard({ ev }) {
  const { act, today } = useStore();
  const dialog = useDialog();
  const blocks = ev.roomBlocks || [];
  const add = async () => {
    const r = await dialog.form({ title: 'Add hotel room block', fields: [
      { name: 'hotel', label: 'Hotel', required: true },
      { name: 'rooms', label: 'Rooms in the block', type: 'number', defaultValue: 20 },
      { name: 'nights', label: 'Nights', type: 'number', defaultValue: 2 },
      { name: 'rate', label: `Group rate per night (${ev.currency})`, type: 'number', defaultValue: 0 },
      { name: 'attritionPct', label: 'Attrition — minimum to fill (%)', type: 'number', defaultValue: 80 },
      { name: 'cutoffDate', label: 'Cutoff date', type: 'date', defaultValue: ev.date ? addDays(ev.date, -30) : '' },
      { name: 'auditClause', label: 'Audit clause: rooms booked outside the block count', type: 'checkbox' },
    ] });
    r && act('ROOM_BLOCK_ADD', { eventId: ev.id, ...r });
  };
  const pickup = async (b) => {
    const r = await dialog.form({ title: `Pick-up report — ${b.hotel}`, fields: [
      { name: 'pickedUp', label: 'Rooms booked in the block', type: 'number', defaultValue: b.pickedUp },
      ...(b.auditClause ? [{ name: 'outsideBookings', label: 'Guests found booked outside the block', type: 'number', defaultValue: b.outsideBookings || 0 }] : []),
    ] });
    r && act('ROOM_BLOCK_PICKUP', { eventId: ev.id, blockId: b.id, ...r });
  };
  const release = async (b, s) => {
    const n = await dialog.prompt({ title: `Release rooms — ${b.hotel}`, label: 'Rooms to give back to the hotel', type: 'number', defaultValue: Math.max(1, b.rooms - Math.max(b.pickedUp, Math.ceil(s.credited / (b.attritionPct / 100)))), hint: `Free until ${fmtDate(b.cutoffDate)}. ${b.pickedUp} rooms are booked, so the block can go down to ${b.pickedUp}.` });
    n !== null && act('ROOM_BLOCK_RELEASE', { eventId: ev.id, blockId: b.id, rooms: Number(n) });
  };
  const settle = async (b, s) => {
    if (!s.exposure) return act('ROOM_BLOCK_SETTLE', { eventId: ev.id, blockId: b.id });
    const r = await dialog.form({ title: `Settle attrition — ${b.hotel}`, fields: [{ name: 'passToClient', label: `Pass ${s.exposure} ${b.currency} to the client as a change order`, type: 'checkbox', defaultValue: true }] });
    r && act('ROOM_BLOCK_SETTLE', { eventId: ev.id, blockId: b.id, passToClient: r.passToClient });
  };
  return (
    <Card title="Hotel room blocks" actions={<Button size="sm" onClick={add}>Add block</Button>}>
      {!blocks.length ? <EmptyState>No room block. Destination weddings and conferences usually hold rooms at a group rate — add the block to track pick-up against the attrition clause.</EmptyState> : (
        <div className="ob-list">
          {blocks.map((b) => {
            const s = roomBlockStatus(b, today);
            return (
              <div key={b.id} className={`ob-row ob-${s.level}`}>
                <div className="ob-main">
                  <div className="ob-title"><b>{b.hotel}</b>{s.level === 'settled' ? <Badge>settled</Badge> : s.level === 'danger' ? <Badge tone="danger">short after cutoff</Badge> : s.level === 'warning' ? <Badge tone="warn">below minimum</Badge> : <Badge tone="ok">on track</Badge>}</div>
                  <div className="muted text-sm">{b.rooms} rooms × {b.nights} nights at <Money value={b.rate} currency={b.currency} /> · cutoff {fmtDate(b.cutoffDate)}{s.level !== 'settled' && (s.pastCutoff ? ' (passed)' : ` (in ${s.daysToCutoff} days)`)}</div>
                  <div className="ob-meter" aria-label={`${s.credited} of ${b.rooms} rooms booked; minimum ${s.minRooms}`}>
                    <ProgressBar value={s.pct} tone={s.shortfall ? (s.level === 'danger' ? 'danger' : 'warn') : 'ok'} />
                    <span className="ob-tick" style={{ left: `${b.attritionPct}%` }} title={`Minimum ${s.minRooms} rooms (${b.attritionPct}%)`} />
                  </div>
                  <div className="text-sm">{s.credited} of {b.rooms} booked{b.auditClause && b.outsideBookings ? ` (incl. ${b.outsideBookings} outside the block)` : ''} · minimum {s.minRooms}
                    {b.status === 'settled' ? <> · attrition charged <b><Money value={b.attritionCharge || 0} currency={b.currency} /></b>{b.coNumber && ` via ${b.coNumber}`}</> : s.shortfall ? <> · <span className={s.level === 'danger' ? 'text-danger' : 'text-warning'}>{s.shortfall} short — exposure <b><Money value={s.exposure} currency={b.currency} /></b></span></> : null}
                  </div>
                </div>
                {b.status !== 'settled' && (
                  <div className="ob-actions">
                    <Button size="sm" onClick={() => pickup(b)}>Update pick-up</Button>
                    {!s.pastCutoff && s.shortfall > 0 && <Button size="sm" variant="ghost" onClick={() => release(b, s)}>Release rooms</Button>}
                    {s.pastCutoff && <Button size="sm" variant="ghost" onClick={() => settle(b, s)}>Settle</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- severe allergies ---------- */
const SEV_LABEL = { severe: 'Severe (anaphylaxis)', allergy: 'Allergy', intolerance: 'Intolerance', preference: 'Preference' };
export function AllergyCard({ ev, readOnly }) {
  const { act } = useStore();
  const dialog = useDialog();
  const s = allergySheet(ev);
  const setSev = (g, v) => act('GUEST_UPDATE', { eventId: ev.id, guestId: g.id, patch: { allergySeverity: v } });
  const print = () => printDocument(`${ev.name} — allergy sheet`, `<h1>${esc(ev.name)} — allergy & dietary sheet</h1><p>${esc(fmtDate(ev.date))} · for the kitchen and floor captain · severe cases first</p>
    <table><thead><tr><th>Table</th><th>Guest</th><th>Requirement</th><th>Severity</th><th>Meal</th></tr></thead><tbody>${s.rows.map((r) => `<tr><td>${esc(r.table ?? 'not seated')}</td><td>${esc(r.name)}</td><td>${esc(r.dietary)}</td><td>${r.severity === 'severe' ? '<b>SEVERE</b>' : esc(SEV_LABEL[r.severity])}</td><td>${esc(r.meal)}</td></tr>`).join('')}</tbody></table>
    <p>Signed for the caterer: ${s.signed ? `${esc(s.signoff.by)} on ${esc(fmtDate(s.signoff.at.slice(0, 10)))}` : '______________________ date ________'}</p>`);
  const sign = async () => { const by = await dialog.prompt({ title: 'Caterer sign-off', label: 'Signed by (name, company)', hint: 'The chef or catering manager confirms every severe case per table.' }); by !== null && act('ALLERGY_SIGNOFF', { eventId: ev.id, by }); };
  return (
    <Card title="Allergies & dietary" actions={<div className="row">{s.rows.length > 0 && <Button size="sm" onClick={print}><Icon name="file" size={13} /> Print sheet</Button>}{!readOnly && s.severe.length > 0 && <Button size="sm" onClick={sign}>{s.stale ? 'Sign again' : s.signed ? 'Re-sign' : 'Record caterer sign-off'}</Button>}</div>}>
      {s.severe.length > 0 && (
        <div className={`ob-note ${s.signed ? 'ok' : 'warn'}`}>
          <Icon name={s.signed ? 'check' : 'alert'} size={15} />
          <span>{s.signed ? `Signed by ${s.signoff.by} on ${fmtDate(s.signoff.at.slice(0, 10))} — ${s.severe.length} severe case(s).` : s.stale ? `The sheet changed after ${s.signoff.by} signed it. Ask the caterer to sign again.` : `${s.severe.length} guest(s) with a severe allergy. The caterer signs the sheet before the event moves to Pre-Event.`}{s.unseated.length > 0 && ` Not seated yet: ${s.unseated.map((r) => r.name).join(', ')}.`}</span>
        </div>
      )}
      {!s.rows.length ? <EmptyState>No dietary requirements recorded.</EmptyState> : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="t">
            <thead><tr><th>Guest</th><th>Requirement</th><th>Table</th><th>Severity</th></tr></thead>
            <tbody>{s.rows.map((r) => {
              const g = ev.households.flatMap((h) => h.guests).find((x) => x.id === r.id);
              return (
                <tr key={r.id}>
                  <td>{r.name}<span className="cell-sub">{r.household}</span></td>
                  <td>{r.dietary || '—'}</td>
                  <td className="nowrap">{r.table ?? <span className={r.severity === 'severe' ? 'text-danger' : 'faint'}>not seated</span>}</td>
                  <td className="nowrap">{readOnly ? (r.severity === 'severe' ? <Badge tone="danger">severe</Badge> : SEV_LABEL[r.severity]) : (
                    <select aria-label={`Severity for ${r.name}`} value={g?.allergySeverity || ''} onChange={(e) => setSev(g, e.target.value)}>
                      <option value="">{r.severity === 'allergy' ? 'Allergy (from text)' : 'Preference'}</option>
                      <option value="intolerance">Intolerance</option>
                      <option value="allergy">Allergy</option>
                      <option value="severe">Severe (anaphylaxis)</option>
                    </select>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------- final headcount with the guarantee rules ---------- */
export function FinalHeadcount({ ev }) {
  const { act, state, today } = useStore();
  const dialog = useDialog();
  const hc = headcount(ev);
  const deadline = finalHeadcountDeadline(state, ev);
  const set = async () => {
    const n = await dialog.prompt({ title: 'Confirm final headcount', label: 'Guests', type: 'number', defaultValue: ev.finalHeadcount ?? hc.confirmed, hint: 'Sent to the venue and caterer as the guaranteed number. They bill this number or the actual count, whichever is higher.' });
    if (n === null) return;
    const count = Number(n);
    const g = guaranteeCheck(state, ev, count);
    let acknowledgeShortfall = false; let override;
    if (g.shortfalls.length) {
      acknowledgeShortfall = await dialog.confirm({ title: 'Below the minimum guarantee', message: `${g.shortfalls.map((x) => `${x.category} guarantees ${x.min}`).join('; ')}. With ${count} guests you are still billed for the minimum. Continue?` });
      if (!acknowledgeShortfall) return;
    }
    if (ev.finalHeadcount && today > deadline && g.reductionFloor && count < g.reductionFloor) {
      override = await dialog.prompt({ title: 'Reduction after the guarantee date', label: 'Venue’s written agreement (reference)', hint: `After ${fmtDate(deadline)} the count may drop at most ${g.reductionPct}% (to ${g.reductionFloor}).` });
      if (override === null) return;
    }
    act('FINAL_HEADCOUNT_SET', { eventId: ev.id, count, acknowledgeShortfall, override });
  };
  const g = ev.finalHeadcount ? guaranteeCheck(state, ev, ev.finalHeadcount) : null;
  return (
    <div className="mt">
      <div className="row between"><span>Final headcount</span><b className="num-tabular">{ev.finalHeadcount ?? '—'}</b></div>
      {g && <div className="faint text-sm">Kitchen prepares {ev.finalHeadcount + g.overset} ({state.settings.oversetPct ?? 3}% overset)</div>}
      <div className="faint text-sm mt">Guarantee due {fmtDate(deadline)}{today > deadline && ` — passed; the count can only go up (−${state.settings.guaranteeReductionPct ?? 5}% max)`}</div>
      <Button size="sm" className="mt" onClick={set}>{ev.finalHeadcount ? 'Change final headcount' : 'Set final headcount'}</Button>
    </div>
  );
}

/* ---------- permits & capacity ---------- */
const PERMIT_TONE = { needed: 'warn', applied: 'info', approved: 'ok', not_required: undefined };
export function PermitsCard({ ev }) {
  const { act, state, today } = useStore();
  const dialog = useDialog();
  const plan = permitPlan(state, ev, today);
  const cap = capacityIssues(ev);
  const update = async (p) => {
    const r = await dialog.form({ title: p.title, fields: [
      { name: 'status', label: 'Status', type: 'select', defaultValue: p.status, options: [{ value: 'needed', label: 'Needed' }, { value: 'applied', label: 'Applied' }, { value: 'approved', label: 'Approved' }, { value: 'not_required', label: 'Not required (venue confirmed)' }] },
      { name: 'reference', label: 'Permit number / reference', defaultValue: p.reference || '' },
    ] });
    r && act('PERMIT_SET', { eventId: ev.id, kind: p.kind, status: r.status, reference: r.reference });
  };
  const add = async () => {
    const r = await dialog.form({ title: 'Add permit', fields: [{ name: 'title', label: 'Permit', required: true }, { name: 'authority', label: 'Issued by' }, { name: 'dueDate', label: 'Apply by', type: 'date', defaultValue: ev.date ? addDays(ev.date, -21) : '' }] });
    r && act('PERMIT_SET', { eventId: ev.id, kind: `custom_${Date.now().toString(36)}`, title: r.title, authority: r.authority, dueDate: r.dueDate, status: 'needed' });
  };
  return (
    <Card title="Permits & capacity" actions={<Button size="sm" onClick={add}>Add permit</Button>}>
      {cap.map((c, i) => <div key={i} className="ob-note danger"><Icon name="users" size={15} /><span>{c.text}. Move the function, cap RSVPs or get the venue’s written approval.</span></div>)}
      {!plan.rows.length ? <EmptyState>No permits suggested for this event. Suggestions come from the country, guest count, outdoor late hours, sparklers or fireworks and road use.</EmptyState> : (
        <table className="t">
          <thead><tr><th>Permit</th><th>Issued by</th><th>Apply by</th><th>Status</th><th /></tr></thead>
          <tbody>{plan.rows.map((p) => (
            <tr key={p.kind}>
              <td>{p.title}{p.why && <span className="cell-sub">{p.why}</span>}</td>
              <td>{p.authority || '—'}</td>
              <td className={`nowrap ${p.overdue ? 'text-danger' : ''}`}>{p.dueDate ? fmtDate(p.dueDate) : '—'}{p.overdue && <span className="cell-sub">overdue</span>}</td>
              <td className="nowrap"><Badge tone={PERMIT_TONE[p.status]}>{p.status.replace('_', ' ')}</Badge>{p.reference && <span className="cell-sub">{p.reference}</span>}{!p.recorded && <span className="cell-sub">suggested</span>}</td>
              <td><Button size="sm" variant="ghost" onClick={() => update(p)}>Update</Button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div className="faint text-sm mt">Rules are a starting point, not legal advice — confirm with the venue and the local authority.</div>
    </Card>
  );
}

/** Licensed capacity per function, next to the confirmed count. */
export function CapacityCell({ ev, s }) {
  const { act } = useStore();
  const n = headcount(ev).bySubEvent[s.id] || 0;
  const over = s.capacity && n > s.capacity;
  return (
    <span className="row nowrap" style={{ gap: 6 }}>
      <input className="inline" type="number" min="0" aria-label={`Licensed capacity for ${s.name}`} defaultValue={s.capacity ?? ''} placeholder="—" onBlur={(e) => { const v = Number(e.target.value || 0); if (v !== (s.capacity || 0)) act('CAPACITY_SET', { eventId: ev.id, subEventId: s.id, capacity: v }); }} style={{ width: 70 }} />
      {over && <Badge tone="danger">{n - s.capacity} over</Badge>}
    </span>
  );
}

export function TemplatePicker({ ev }) {
  const { act } = useStore();
  const dialog = useDialog();
  const pick = async () => {
    const r = await dialog.form({ title: 'Add functions from a tradition', fields: [{ name: 'templateId', label: 'Template', type: 'select', defaultValue: FUNCTION_TEMPLATES[0].id, options: FUNCTION_TEMPLATES.map((t) => ({ value: t.id, label: `${t.label} (${t.functions.length})` })) }] });
    r && act('FUNCTIONS_FROM_TEMPLATE', { eventId: ev.id, templateId: r.templateId });
  };
  return <Button onClick={pick}>Add from template</Button>;
}
