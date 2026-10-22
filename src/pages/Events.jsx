import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, StageBadge, Badge, Money, PillSelect, SearchInput, Icon } from '../design-system/index.js';
import { fmtDate } from '../lib/dates.js';
import { eventFinancials, clientOf } from '../lib/derived.js';
import { STAGES, EXIT_STAGES } from '../lib/lifecycle.js';

export default function Events() {
  const { state, user } = useStore();
  const nav = useNavigate();
  const [seg, setSeg] = useState('all');
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(['planner', 'sales'].includes(user.role));
  const list = state.events
    .filter((e) => seg === 'all' || e.segment === seg)
    .filter((e) => !stage || e.stage === stage)
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .filter((e) => !mine || e.plannerId === user.id || e.salesId === user.id)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Events</h1><div className="muted">Every deal from Lead to Archived. Open an event for its full planning workspace.</div></div>
      </div>
      <div className="row mb">
        <PillSelect options={[{ id: 'all', label: 'All segments' }, { id: 'social', label: 'Social' }, { id: 'corporate', label: 'Corporate' }]} value={seg} onChange={setSeg} />
        <select value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {[...STAGES, ...EXIT_STAGES].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="Search events…" />
        <label className="row"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Only my events</label>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Stage</th><th>Planner</th><th className="num">Contract</th><th className="num">Margin</th></tr></thead>
            <tbody>
              {list.map((e) => {
                const f = eventFinancials(state, e);
                const et = state.settings.eventTypes.find((t) => t.id === e.eventTypeId);
                return (
                  <tr key={e.id} className="clickable" onClick={() => nav(`/events/${e.id}`)}>
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td><Link to={`/events/${e.id}`}>{e.name}</Link><span className="cell-sub">{clientOf(state, e)?.name}</span></td>
                    <td>{et?.name}<span className="cell-sub">{e.segment}</span></td>
                    <td className="nowrap"><StageBadge stage={e.stage} /><span className="cell-sub">{e.dateStatus === 'locked' ? <><Icon name="lock" size={12} /> date locked</> : e.dateStatus === 'hold' ? <><Icon name="hourglass" size={12} /> date on hold</> : 'no date held'}</span></td>
                    <td className="nowrap">{state.users.find((u) => u.id === e.plannerId)?.name ?? '—'}</td>
                    <td className="num nowrap"><Money value={f.contractTotal} currency={e.currency} />{f.contractTotal > 0 && <span className="cell-sub">{Math.round((f.paid / f.contractTotal) * 100)}% paid</span>}</td>
                    <td className="num nowrap">{f.revenueNet ? `${f.marginPct}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
