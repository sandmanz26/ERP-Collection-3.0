// Risks & contingencies on the event cockpit: the weather call, the final-balance cutoff, vendor fallout,
// personal items in our custody and vendor meals. Rules: lib/risk.js · actions: store/handlers/risk.js.
import React from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Button, Callout, EmptyState, StatusBadge, useDialog, Icon } from '../../design-system/index.js';
import { weatherCall, finalPaymentRisk, vendorGaps, vendorRefundsDue, custodyOpen, vendorMeals } from '../../lib/risk.js';
import { fmtDate, fmtDateTime } from '../../lib/dates.js';
import { fmtMoney } from '../../lib/money.js';
import { stageIndex } from '../../lib/lifecycle.js';

export function RiskPanel({ ev, open, closed }) {
  const { state, today } = useStore();
  const fp = finalPaymentRisk(state, ev, today);
  const gaps = vendorGaps(ev);
  const refunds = vendorRefundsDue(ev);
  const meals = vendorMeals(ev);
  const booked = stageIndex(ev.stage) >= stageIndex('booked');
  if (closed && !(ev.custody || []).length) return null;
  return (
    <div id="risk-card">
      <Card title="Risks & contingencies" actions={<span className="faint text-sm">What usually goes wrong — planned for</span>}>
        <div className="grid g2">
          {!closed && <WeatherPlan ev={ev} />}
          {!closed && booked && fp && (
            <section className="risk-block">
              <h4><Icon name="wallet" size={14} /> Final balance</h4>
              {fp.status === 'ok' && fp.balance === 0 ? <div className="text-success">Everything due before the event is paid.</div> : (
                <Callout compact tone={fp.status === 'breach' ? 'danger' : fp.status === 'at_risk' ? 'warning' : 'info'} icon="wallet" title={`${fmtMoney(fp.balance, ev.currency)} due by ${fmtDate(fp.cutoff)}`} action={{ label: 'Open finance', onClick: () => open?.('finance') }}>
                  {fp.status === 'breach' ? 'Cutoff passed — the event cannot move to Pre-Event without an admin override.' : `Cutoff is ${state.settings.finalPaymentCutoffDays} days before the event: vendors are only released once it is paid.`}
                </Callout>
              )}
            </section>
          )}
          {!closed && (gaps.length > 0 || refunds.length > 0) && (
            <section className="risk-block">
              <h4><Icon name="alert" size={14} /> Vendor fallout</h4>
              {gaps.map((g) => <Callout key={g.category} compact tone="danger" icon="store" title={`${g.category}: no vendor`} action={{ label: 'Replace', onClick: () => open?.('vendors') }}>{g.booking.cancelReason} · {g.rfq ? `${g.quotes}/${g.rfq.vendorIds.length} quotes in` : 'no RFQ yet'}</Callout>)}
              {refunds.map((b) => <Callout key={b.id} compact tone="warning" icon="money" title={`Recover ${fmtMoney(b.refundDue, ev.currency)} from ${state.vendors.find((v) => v.id === b.vendorId)?.name}`} action={{ label: 'Open', onClick: () => open?.('vendors') }}>Deposit paid before the vendor cancelled.</Callout>)}
            </section>
          )}
          {!closed && meals.total > 0 && (
            <section className="risk-block">
              <h4><Icon name="users" size={14} /> Vendor & staff meals</h4>
              <div><b>{meals.total}</b> meals to add to the caterer count <span className="faint">({meals.vendors} vendor crew · {meals.staff} our staff)</span></div>
              <div className="faint text-xs mt">{meals.rows.map((r) => `${r.category} ${r.meals}`).join(' · ')}{ev.finalHeadcount ? ` · guests ${ev.finalHeadcount} → caterer total ${ev.finalHeadcount + meals.total}` : ''}</div>
            </section>
          )}
          <CustodyPanel ev={ev} />
        </div>
      </Card>
    </div>
  );
}

function WeatherPlan({ ev }) {
  const { state, act, user } = useStore();
  const dialog = useDialog();
  const w = weatherCall(state, ev);
  const edit = async () => {
    const c = ev.contingency || {};
    const r = await dialog.form({ title: 'Weather plan', fields: [
      { name: 'outdoor', label: 'Has an outdoor function', type: 'checkbox', defaultValue: c.outdoor ?? true },
      { name: 'subEventId', label: 'Function', type: 'select', options: [{ value: '', label: ev.name }, ...ev.subEvents.map((s) => ({ value: s.id, label: s.name }))], defaultValue: c.subEventId ?? '' },
      { name: 'planA', label: 'Plan A (outdoor)', defaultValue: c.planA ?? '' },
      { name: 'planB', label: 'Plan B (covered / indoor)', defaultValue: c.planB ?? '' },
      { name: 'callHoursBefore', label: 'Make the call (hours before)', type: 'number', defaultValue: c.callHoursBefore ?? state.settings.weatherCallHours ?? 48 },
    ] });
    r && act('WEATHER_PLAN_SET', { eventId: ev.id, ...r });
  };
  const call = async (decision) => {
    const r = await dialog.form({ title: `Go with Plan ${decision}?`, fields: [{ name: 'note', label: 'Forecast / reason (shared with the team)', defaultValue: '' }] });
    r && act('WEATHER_CALL', { eventId: ev.id, decision, note: r.note });
  };
  const canEdit = ['admin', 'planner', 'production'].includes(user.role);
  return (
    <section className="risk-block">
      <h4><Icon name="sun" size={14} /> Weather plan {canEdit && <Button size="sm" variant="ghost" onClick={edit}>{w ? 'Edit' : 'Set up'}</Button>}</h4>
      {!w ? <div className="faint">No outdoor function on record. Add one if any part is open air.</div> : (
        <>
          <div className="text-sm"><b>{w.function}</b> · A: {w.planA} · B: {w.planB}</div>
          {w.decided
            ? <div className="mt"><Badge tone={w.decision === 'B' ? 'warn' : 'ok'}>Plan {w.decision}</Badge> <span className="faint text-xs">decided {fmtDateTime(w.decidedAt)}{w.note ? ` · ${w.note}` : ''}</span></div>
            : <div className="mt"><span className={w.overdue ? 'text-danger' : 'faint'}>Call due {fmtDateTime(w.due)}{w.overdue ? ' — overdue' : ''}</span>
              {canEdit && <div className="row mt" style={{ gap: 6 }}><Button size="sm" onClick={() => call('A')}>Go Plan A</Button><Button size="sm" onClick={() => call('B')}>Go Plan B</Button></div>}</div>}
        </>
      )}
    </section>
  );
}

/** Card box, gifts, heirlooms, licences: who handed them to us and who got them back — with names and times. */
export function CustodyPanel({ ev }) {
  const { act } = useStore();
  const dialog = useDialog();
  const items = ev.custody || [];
  const openItems = custodyOpen(ev);
  const add = async () => {
    const r = await dialog.form({ title: 'Item in our custody', fields: [{ name: 'item', label: 'Item (e.g. card box, cake knife, rings)', required: true }, { name: 'owner', label: 'Belongs to / return to' }, { name: 'notes', label: 'Handling notes' }] });
    r && act('CUSTODY_ADD', { eventId: ev.id, ...r });
  };
  const move = async (c, status) => {
    const r = await dialog.form({ title: status === 'received' ? `Receive: ${c.item}` : `Hand back: ${c.item}`, fields: [{ name: 'person', label: status === 'received' ? 'Handed to us by (name)' : 'Handed back to (name)', defaultValue: status === 'returned' ? c.owner : '', required: true }] });
    r && act('CUSTODY_UPDATE', { eventId: ev.id, itemId: c.id, status, person: r.person });
  };
  return (
    <section className="risk-block">
      <h4><Icon name="key" size={14} /> Personal items in custody {openItems.length > 0 && <Badge tone="warn">{openItems.length} open</Badge>} <Button size="sm" variant="ghost" onClick={add}>+ Item</Button></h4>
      {!items.length ? <EmptyState>Card box, gifts, heirlooms, the marriage licence… track who holds them.</EmptyState> : (
        <ul className="custody">
          {items.map((c) => {
            const last = c.log.at(-1);
            return (
              <li key={c.id}>
                <div style={{ minWidth: 0 }}>
                  <div><b>{c.item}</b> <StatusBadge status={c.status === 'returned' ? 'done' : c.status === 'received' ? 'in_progress' : 'pending'} /></div>
                  <div className="faint text-xs">{c.owner && `Return to ${c.owner}`}{c.notes ? ` · ${c.notes}` : ''}{last ? ` · ${last.status === 'received' ? 'from' : 'to'} ${last.person}, ${fmtDateTime(last.at)}` : ''}</div>
                </div>
                {c.status === 'expected' && <Button size="sm" onClick={() => move(c, 'received')}>Received</Button>}
                {c.status === 'received' && <Button size="sm" variant="primary" onClick={() => move(c, 'returned')}>Hand back</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
