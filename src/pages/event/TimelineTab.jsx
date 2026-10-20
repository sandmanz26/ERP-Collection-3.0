import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/AppStore.jsx';
import { Card, PillSelect, Alert, Badge, Button, Gantt, hourTicks, dayTicks, CoverageChart, EmptyState, useDialog } from '../../design-system/index.js';
import { planningTimeline, dayTimeline, productionIssues } from '../../lib/timeline.js';
import { coverage, DEPARTMENTS } from '../../lib/workforce.js';
import { addMinutes, fmtDate } from '../../lib/dates.js';

const fmtAbs = (day0) => (t) => {
  const d = Math.floor(t / 1440);
  const m = ((t % 1440) + 1440) % 1440;
  return `${d > 0 ? `D+${d} ` : ''}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export default function TimelineTab({ ev }) {
  const { state, act, today } = useStore();
  const [, setSp] = useSearchParams();
  const [mode, setMode] = useState(ev.date && ev.date < today ? 'day' : 'planning');
  const [group, setGroup] = useState('vendor');
  const [dept, setDept] = useState('');
  const issues = useMemo(() => productionIssues(state, ev), [state, ev]);

  return (
    <div>
      <div className="row mb">
        <PillSelect options={[{ id: 'planning', label: 'Planning timeline (T-minus)' }, { id: 'day', label: 'Event days (production)' }]} value={mode} onChange={setMode} />
        <span className="spacer" />
        {issues.length > 0 && <Badge tone={issues.some((i) => i.level === 'danger') ? 'danger' : 'warn'}>{issues.length} production issue(s)</Badge>}
      </div>
      {mode === 'planning' ? <PlanningView ev={ev} onOpen={(tab) => tab && setSp({ tab })} /> : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(260px,1fr)' }}>
            <Card title="Event-day production timeline" actions={<PillSelect options={[{ id: 'vendor', label: 'By vendor' }, { id: 'function', label: 'By function' }, { id: 'resource', label: 'By venue resource' }, { id: 'crew', label: 'By crew department' }]} value={group} onChange={setGroup} />}>
              <DayView ev={ev} group={group} issues={issues} onMove={(item, delta) => {
                const it = ev.ros.items.find((x) => x.id === item.id);
                act('ROS_ITEM_UPDATE', { eventId: ev.id, itemId: it.id, patch: { start: addMinutes(it.start, delta) } });
              }} />
              <div className="legend mt">
                <span><i className="tone-brand" />Guest timeline</span><span><i className="tone-warn" />Production</span><span><i className="tone-danger" />Conflict</span>
                <span><i className="tone-brand-soft" style={{ border: '1px solid' }} />Vendor booked window</span><span><i style={{ background: 'repeating-linear-gradient(135deg,#ccc 0 3px,transparent 3px 6px)' }} />No venue access</span>
                <span className="muted">Drag a bar (or ←/→) to reschedule in 5-minute steps; conflicts re-check instantly.</span>
              </div>
            </Card>
            <IssuesPanel ev={ev} issues={issues} />
          </div>
          <Card title="Staff coverage — required vs confirmed" className="mt" actions={<select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>}>
            <CoverageView ev={ev} dept={dept} />
          </Card>
          <ProductionSetup ev={ev} />
        </>
      )}
    </div>
  );
}

function PlanningView({ ev, onOpen }) {
  const { state, today } = useStore();
  const tl = planningTimeline(state, ev, today);
  if (!tl) return <Card><EmptyState>Set an event date to see the planning timeline.</EmptyState></Card>;
  const overdue = tl.lanes.flatMap((l) => l.items).filter((i) => i.tone === 'danger' && i.id !== 'm-ev').length;
  return (
    <Card title={`Planning timeline · ${fmtDate(tl.start)} → ${fmtDate(tl.toDate(tl.range[1]))}`} actions={overdue > 0 && <Badge tone="danger">{overdue} overdue</Badge>}>
      <Gantt range={tl.range} lanes={tl.lanes} ticks={dayTicks(tl.range, tl.toDate)} markers={tl.markers} pxPerUnit={3} fit onItemClick={(it) => onOpen(it.href)} labelWidth={220} />
      <div className="legend mt">
        <span><i className="tone-ok" />Done / paid</span><span><i className="tone-brand" />Upcoming</span><span><i className="tone-danger" />Overdue</span><span><i className="tone-warn" />Blocked / deadline</span>
        <span><i className="tone-brand-soft" style={{ border: '1px solid' }} />Vendor engagement (booking → load-out)</span>
        <span className="muted">One lane per vendor: engagement, payables and deliverables in one row. Click a marker to open the related tab.</span>
      </div>
    </Card>
  );
}

export function DayView({ ev, group, issues, onMove, extraMarkers = [] }) {
  const { state } = useStore();
  const [zoom, setZoom] = useState(1);
  const tl = dayTimeline(state, ev, group, issues);
  if (!tl || !tl.lanes.length) return <EmptyState>Nothing scheduled for this view yet.</EmptyState>;
  return (
    <>
      <div className="row mb text-sm"><span className="muted">Zoom</span><PillSelect options={[{ id: 1, label: 'Fit' }, { id: 2, label: '2×' }, { id: 4, label: '4×' }]} value={zoom} onChange={setZoom} /></div>
      <Gantt range={tl.range} lanes={tl.lanes} ticks={hourTicks(tl.range, tl.day0)} markers={[...tl.markers, ...extraMarkers]} shading={tl.shading} pxPerUnit={0.5} fit zoom={zoom} snap={5} onItemMove={onMove} labelWidth={200} />
    </>
  );
}

function CoverageView({ ev, dept }) {
  const days = ev.positions?.length ? [...new Set(ev.positions.map((p) => p.date))].sort() : [];
  if (!days.length) return <EmptyState>No staffing plan yet — add positions in the People tab.</EmptyState>;
  return <CoverageChart slots={coverage(ev, days[0], { department: dept || undefined })} formatT={fmtAbs(days[0])} />;
}

export function IssuesPanel({ ev, issues }) {
  const kinds = { resource: 'Shared resource clash', dependency: 'Vendor dependency', access: 'Venue access', curfew: 'Curfew', window: 'Vendor window', vendor: 'Vendor status', staffing: 'Staffing gap' };
  return (
    <Card title="Production check" actions={<Badge tone={issues.length ? 'danger' : 'ok'}>{issues.length ? `${issues.length} issues` : 'all clear'}</Badge>}>
      {issues.length === 0 && <Alert tone="success">No conflicts: docks, elevators, dependencies, access windows, curfew, vendor windows and staffing all line up.</Alert>}
      {Object.entries(kinds).map(([k, label]) => {
        const list = issues.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <div key={k} className="mb">
            <h4>{label} ({list.length})</h4>
            {list.map((i, n) => <Alert key={n} tone={i.level === 'danger' ? 'danger' : 'warning'}>{i.text}</Alert>)}
          </div>
        );
      })}
    </Card>
  );
}

function ProductionSetup({ ev }) {
  const { act } = useStore();
  const dialog = useDialog();
  const prod = ev.production ?? { resources: [], accessWindows: [] };
  return (
    <div className="grid g2 mt">
      <Card title="Venue resources" actions={<Button size="sm" onClick={async () => {
        const r = await dialog.form({ title: 'Add venue resource', description: 'Exclusive resources (loading dock, service elevator, freight lift) can only be used by one vendor at a time — overlaps are flagged.', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'exclusive', label: 'Exclusive (one vendor at a time)', type: 'checkbox', defaultValue: true }] });
        r && act('RESOURCE_ADD', { eventId: ev.id, ...r });
      }}>+ Resource</Button>}>
        {prod.resources.length === 0 && <div className="faint">No resources yet.</div>}
        {prod.resources.map((r) => (
          <div key={r.id} className="row between" style={{ padding: '4px 0' }}>
            <span>{r.name} {r.exclusive ? <Badge tone="warn">exclusive</Badge> : <Badge>shared</Badge>} <span className="faint">{ev.ros.items.filter((i) => (i.resourceIds || []).includes(r.id)).length} item(s)</span></span>
            <Button variant="ghost" size="sm" aria-label={`Remove ${r.name}`} onClick={() => act('RESOURCE_REMOVE', { eventId: ev.id, resourceId: r.id })}>✕</Button>
          </div>
        ))}
      </Card>
      <Card title="Venue access windows & curfew" actions={<Button size="sm" onClick={async () => {
        const r = await dialog.form({ title: 'Add access window', fields: [{ name: 'date', label: 'Date', type: 'date', defaultValue: ev.date, required: true }, { name: 'start', label: 'Doors open to vendors', type: 'time', defaultValue: '08:00', required: true }, { name: 'end', label: 'Venue must be clear by', type: 'time', defaultValue: '01:00', required: true, hint: 'Earlier than start = after midnight' }] });
        r && act('ACCESS_WINDOW_SET', { eventId: ev.id, windows: [...prod.accessWindows, r] });
      }}>+ Window</Button>}>
        {prod.accessWindows.map((w, i) => (
          <div key={i} className="row between"><span>{fmtDate(w.date, { weekday: 'short' })} · {w.start} → {w.end}{w.end < w.start ? ' (+1 day)' : ''}</span>
            <Button variant="ghost" size="sm" onClick={() => act('ACCESS_WINDOW_SET', { eventId: ev.id, windows: prod.accessWindows.filter((_, j) => j !== i) })}>✕</Button></div>
        ))}
        {prod.accessWindows.length === 0 && <div className="faint">No restrictions recorded.</div>}
        <div className="muted mt">Curfew (guest activity must end): <b>{ev.venue?.curfew || '—'}</b> — edit in Overview → Venue.</div>
      </Card>
    </div>
  );
}
