import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, StatTile, Button, ProgressBar, Alert, PillSelect, CoverageChart, EmptyState, useDialog, download, printDocument } from '../../design-system/index.js';
import { staffingSummary, positionFill, positionCost, positionHours, coverage, DEPARTMENTS, SOURCES, CREDENTIAL_ZONES, WORKER_STATUSES } from '../../lib/workforce.js';
import { findConflicts } from '../../lib/staff.js';
import { fmtDate } from '../../lib/dates.js';
import QRCode from 'qrcode';

const SOURCE_TONE = { internal: 'info', freelance: 'warn', outsourced: 'brand' };

/**
 * Event workforce: one staffing plan per event (who is needed, when, from where) and the people who fill it —
 * internal staff, direct freelancers and agency/vendor-supplied (outsourced) crews.
 */
export default function PeopleTab({ ev }) {
  const { state, act } = useStore();
  const dialog = useDialog();
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('department');
  const sum = staffingSummary(ev);
  const cur = ev.currency;
  const positions = ev.positions || [];
  const agencies = [...new Set(positions.filter((p) => p.vendorId).map((p) => p.vendorId))];
  const costTotal = positions.reduce((a, p) => a + positionCost(ev, p), 0);
  const groups = view === 'department' ? DEPARTMENTS.filter((d) => positions.some((p) => p.department === d)).map((d) => ({ key: d, list: positions.filter((p) => p.department === d) }))
    : SOURCES.map((s) => ({ key: s.label, list: positions.filter((p) => p.source === s.id) })).filter((g) => g.list.length);

  const addPosition = async () => {
    const r = await dialog.form({
      title: 'Add position to staffing plan',
      fields: [
        { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS, defaultValue: DEPARTMENTS[0] },
        { name: 'role', label: 'Role', required: true, defaultValue: 'Banquet server' },
        { name: 'qty', label: 'Headcount needed', type: 'number', defaultValue: 4, required: true },
        { name: 'date', label: 'Date', type: 'date', defaultValue: ev.date, required: true },
        { name: 'start', label: 'Call time', type: 'time', defaultValue: '15:00', required: true },
        { name: 'end', label: 'Wrap', type: 'time', defaultValue: '23:30', required: true },
        { name: 'source', label: 'Sourced from', type: 'select', options: SOURCES.map((s) => ({ value: s.id, label: s.label })), defaultValue: 'outsourced' },
        { name: 'vendorId', label: 'Agency / vendor (outsourced)', type: 'select', options: [{ value: '', label: '—' }, ...state.vendors.map((v) => ({ value: v.id, label: `${v.name}${v.staffingAgency ? ' (staffing)' : ''}` }))], defaultValue: '' },
        { name: 'rate', label: `Rate per hour (${cur})`, type: 'number', defaultValue: 35, hint: 'Agency: billed per booked head. Freelance: per confirmed person. Internal: costed via shifts.' },
        { name: 'zones', label: 'Credential zones (comma separated)', defaultValue: 'Front of house', hint: CREDENTIAL_ZONES.join(', ') },
      ],
    });
    if (!r) return;
    act('POSITION_ADD', { eventId: ev.id, data: { ...r, vendorId: r.source === 'outsourced' ? r.vendorId || null : null, zones: r.zones.split(',').map((z) => z.trim()).filter(Boolean) } });
  };

  const exportRoster = () => {
    const rows = [['Department', 'Role', 'Name', 'Company', 'Phone', 'Call', 'Wrap', 'Status', 'Credential', 'Zones']];
    positions.forEach((p) => {
      const f = positionFill(ev, p);
      f.shifts.forEach((s) => { const st = state.staff.find((x) => x.id === s.staffId); rows.push([p.department, p.role, st?.name, st?.type === 'employee' ? state.settings.company.name : 'Freelance', st?.phone, s.start, s.end, s.confirmed ? 'confirmed' : 'invited', '', p.zones.join('/')]); });
      f.workers.forEach((w) => rows.push([p.department, p.role, w.name, w.company, w.phone, p.start, p.end, w.status, w.credentialCode, w.zones.join('/')]));
    });
    download(`${ev.name}-crew-roster.csv`, rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    act('DOCUMENT_GENERATED', { eventId: ev.id, kind: 'Crew roster (CSV)', ref: `${rows.length - 1} people` });
  };

  const printCredentials = async () => {
    const people = positions.flatMap((p) => positionFill(ev, p).workers.filter((w) => w.status !== 'declined').map((w) => ({ w, p })));
    const qr = Object.fromEntries(await Promise.all(people.map(async ({ w }) => [w.id, await QRCode.toDataURL(w.credentialCode, { margin: 1, width: 110 })])));
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    printDocument(`${ev.name} crew credentials`, `<h1>${esc(ev.name)} — crew credentials</h1><p class="muted">${fmtDate(ev.date)} · ${esc(ev.venue?.name)}</p><div class="badges">${people.map(({ w, p }) => `<div class="badge"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase">${esc(w.zones.join(' · '))}</div><div style="font-size:16px;font-weight:700;margin-top:4px">${esc(w.name)}</div><div>${esc(p.role)}</div><div class="muted">${esc(w.company)}</div><img src="${qr[w.id]}" width="90" height="90" alt=""><div class="muted">${esc(w.credentialCode)} · call ${p.start}</div></div>`).join('')}</div>`);
    act('DOCUMENT_GENERATED', { eventId: ev.id, kind: 'Crew credentials (QR)', ref: `${people.length} badges` });
  };

  const days = [...new Set(positions.map((p) => p.date))].sort();
  return (
    <div>
      <div className="grid g5">
        <StatTile label="Headcount required" value={sum.required} sub={`${positions.length} positions`} />
        <StatTile label="Confirmed" value={`${sum.confirmed} / ${sum.required}`} sub={`${sum.pct}% staffed`} tone={sum.open ? 'warn' : 'ok'} />
        <StatTile label="Open slots" value={sum.open} tone={sum.open ? 'danger' : 'ok'} sub="need a name or confirmation" />
        <StatTile label="Agencies / vendors supplying crew" value={agencies.length} sub={agencies.map((id) => state.vendors.find((v) => v.id === id)?.name).join(', ') || '—'} />
        <StatTile label="Outsourced + freelance cost" value={<Money value={costTotal} currency={cur} />} sub="internal staff costed via shifts" />
      </div>

      <Card title="Staffing plan" className="mt" actions={<div className="row">
        <PillSelect options={[{ id: 'department', label: 'By department' }, { id: 'source', label: 'By source' }]} value={view} onChange={setView} />
        <Button onClick={exportRoster}>Roster CSV</Button>
        <Button onClick={printCredentials}>Print QR credentials</Button>
        <Button variant="primary" onClick={addPosition}>+ Position</Button>
      </div>}>
        {positions.length === 0 && <EmptyState>No staffing plan yet. Add positions (e.g. 12 × banquet server from the caterer, 2 × licensed security from an agency).</EmptyState>}
        {groups.map((g) => (
          <div key={g.key} className="mb">
            <h4 className="mt">{g.key}</h4>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Role</th><th>When</th><th>Source</th><th style={{ width: 170 }}>Filled</th><th>Zones</th><th className="num">Cost</th><th /></tr></thead>
                <tbody>
                  {g.list.map((p) => {
                    const f = positionFill(ev, p);
                    const vendor = state.vendors.find((v) => v.id === p.vendorId);
                    return (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td><b>{p.role}</b><div className="faint">{p.qty} needed · {positionHours(p)} h</div></td>
                          <td>{fmtDate(p.date, { weekday: 'short' })}<div className="faint">{p.start}–{p.end}</div></td>
                          <td><Badge tone={SOURCE_TONE[p.source]}>{SOURCES.find((s) => s.id === p.source)?.label}</Badge>{vendor && <div className="faint" style={{ fontSize: 12 }}>via {vendor.name}</div>}</td>
                          <td>
                            <div className="row between text-sm"><span>{f.confirmed}/{p.qty} confirmed</span>{f.unassigned > 0 && <Badge tone="danger">{f.unassigned} unnamed</Badge>}</div>
                            <ProgressBar value={(Math.min(p.qty, f.confirmed) / p.qty) * 100} tone={f.open ? (f.unassigned ? 'danger' : 'warn') : 'ok'} />
                          </td>
                          <td className="text-sm">{(p.zones || []).join(', ')}</td>
                          <td className="num">{p.source === 'internal' ? <span className="faint">via shifts</span> : <Money value={positionCost(ev, p)} currency={cur} />}<div className="faint text-xs">{p.rate ? `${p.rate}/h` : ''}</div></td>
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              <Button size="sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide' : `People (${f.assigned})`}</Button>
                              <Button size="sm" variant="ghost" aria-label="Remove position" onClick={async () => (await dialog.confirm({ title: 'Remove position', message: `Remove ${p.role} and its ${f.workers.length} external worker(s)?`, danger: true })) && act('POSITION_REMOVE', { eventId: ev.id, positionId: p.id })}>✕</Button>
                            </div>
                          </td>
                        </tr>
                        {open === p.id && <tr><td colSpan={7} style={{ background: 'var(--color-surface-2)' }}><PositionPeople ev={ev} p={p} /></td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid g2 mt">
        <Card title="Coverage across the day">
          {days.length ? <CoverageChart slots={coverage(ev, days[0])} formatT={(t) => `${String(Math.floor((((t % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((t % 60) + 60) % 60).padStart(2, '0')}`} /> : <EmptyState>—</EmptyState>}
        </Card>
        <Card title="Agencies & vendors supplying people">
          {agencies.length === 0 && <EmptyState>No outsourced positions.</EmptyState>}
          {agencies.map((vid) => {
            const v = state.vendors.find((x) => x.id === vid);
            const ps = positions.filter((p) => p.vendorId === vid);
            const booked = ps.reduce((a, p) => a + p.qty, 0);
            const named = ps.reduce((a, p) => a + positionFill(ev, p).workers.filter((w) => w.status !== 'declined').length, 0);
            return (
              <div key={vid} className="card compact">
                <div className="row between"><b>{v.name}</b><Badge tone={named >= booked ? 'ok' : 'warn'}>roster {named}/{booked}</Badge></div>
                <div className="faint text-sm">{ps.map((p) => `${p.qty}× ${p.role}`).join(' · ')} · {v.contact} {v.phone}</div>
                <div className="text-sm">Booked cost <Money value={ps.reduce((a, p) => a + positionCost(ev, p), 0)} currency={cur} /> — agencies bill the booked headcount; names come from their roster in the vendor portal.</div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function PositionPeople({ ev, p }) {
  const { state, act } = useStore();
  const dialog = useDialog();
  const f = positionFill(ev, p);
  const allShifts = state.events.flatMap((e) => e.shifts.map((s) => ({ ...s, eventId: e.id, eventName: e.name })));
  const assignStaff = async () => {
    const options = state.staff.map((s) => {
      const clash = findConflicts([...allShifts, { id: 'new', staffId: s.id, date: p.date, start: p.start, end: p.end }]).some(([a, b]) => a.id === 'new' || b.id === 'new');
      return { value: s.id, label: `${s.name} — ${s.type}, ${s.skills.join('/')}${clash ? ' ⚠ busy' : ''}` };
    });
    const r = await dialog.form({ title: `Assign staff to ${p.role}`, description: 'Internal employees and registered freelancers get a shift (overtime & conflict rules apply). ⚠ = already booked at that time.', fields: [{ name: 'staffId', label: 'Person', type: 'select', options, defaultValue: options[0].value }] });
    r && act('POSITION_ASSIGN_STAFF', { eventId: ev.id, positionId: p.id, staffId: r.staffId });
  };
  const addWorkers = async () => {
    const r = await dialog.form({ title: `Add external people to ${p.role}`, description: p.vendorId ? 'Agency-supplied crew (the agency can also submit names itself in the vendor portal).' : 'One-off freelancers not in the staff directory.', fields: [{ name: 'names', label: 'Names — one per line, optional ", phone"', type: 'textarea', required: true }, { name: 'status', label: 'Status', type: 'select', options: ['invited', 'confirmed'], defaultValue: 'confirmed' }] });
    if (!r) return;
    act('WORKER_ADD', { eventId: ev.id, positionId: p.id, workers: r.names.split('\n').map((l) => { const [name, phone] = l.split(','); return { name, phone: phone?.trim(), status: r.status }; }) });
  };
  return (
    <div>
      <div className="row mb">
        <Button size="sm" variant="primary" onClick={assignStaff}>+ Assign staff / registered freelancer</Button>
        <Button size="sm" onClick={addWorkers}>+ Add external people</Button>
        {f.unassigned > 0 && <Badge tone="danger">{f.unassigned} slot(s) without a name</Badge>}
      </div>
      <table className="t">
        <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Credential</th><th>Zones</th><th>Status</th><th /></tr></thead>
        <tbody>
          {f.shifts.map((s) => {
            const st = state.staff.find((x) => x.id === s.staffId);
            return (
              <tr key={s.id}>
                <td>{st?.name} <Badge tone="info">{st?.type}</Badge></td><td>{st?.type === 'employee' ? state.settings.company.name : 'Freelance'}</td><td>{st?.phone}</td><td className="faint">staff login</td><td className="text-sm">{p.zones.join(', ')}</td>
                <td>{s.confirmed ? <StatusBadge status="confirmed" /> : <><StatusBadge status="pending" /> <Button size="sm" onClick={() => act('SHIFT_CONFIRM', { eventId: ev.id, shiftId: s.id })}>confirm</Button></>}{s.clockIn && <Badge tone="ok">on site</Badge>}</td>
                <td><Button size="sm" variant="ghost" onClick={() => act('SHIFT_REMOVE', { eventId: ev.id, shiftId: s.id })}>✕</Button></td>
              </tr>
            );
          })}
          {f.workers.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td><td>{w.company}</td><td>{w.phone}</td><td><code>{w.credentialCode}</code></td>
              <td><PillSelect multi options={CREDENTIAL_ZONES} value={w.zones} onChange={(z) => act('WORKER_UPDATE', { eventId: ev.id, workerId: w.id, patch: { zones: z } })} /></td>
              <td><select value={w.status} onChange={(e) => act('WORKER_UPDATE', { eventId: ev.id, workerId: w.id, patch: { status: e.target.value } })}>{WORKER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></td>
              <td><Button size="sm" variant="ghost" onClick={() => act('WORKER_REMOVE', { eventId: ev.id, workerId: w.id })}>✕</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!f.shifts.length && !f.workers.length && <Alert tone="warning">Nobody assigned yet.</Alert>}
    </div>
  );
}
