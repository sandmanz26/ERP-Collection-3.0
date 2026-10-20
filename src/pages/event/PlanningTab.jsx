import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Modal, Field, useForm, PillSelect, CommitInput, Empty } from '../../components/ui.jsx';
import { Moodboard } from './ProposalTab.jsx';
import DecorPanel from './DecorPanel.jsx';
import { taskBlocked } from '../../lib/tasks.js';
import { decorSnapshot } from '../../lib/decorApi.js';
import { fmtDate, fmtDateTime, diffDays } from '../../lib/dates.js';

export default function PlanningTab({ ev }) {
  const [sub, setSub] = useState('tasks');
  return (
    <div>
      <PillSelect options={[{ id: 'tasks', label: `Tasks (${ev.tasks.length})` }, { id: 'functions', label: `Sub-events (${ev.subEvents.length})` }, { id: 'forms', label: 'Planning forms' }, { id: 'design', label: 'Design board' }, { id: 'decor', label: 'Decor & equipment' }, { id: 'docs', label: 'Documents' }, { id: 'decisions', label: 'Decision log' }]} value={sub} onChange={setSub} />
      <div className="mt">
        {sub === 'tasks' && <Tasks ev={ev} />}
        {sub === 'functions' && <Functions ev={ev} />}
        {sub === 'forms' && <Forms ev={ev} />}
        {sub === 'design' && <Design ev={ev} />}
        {sub === 'decor' && <DecorPanel ev={ev} />}
        {sub === 'docs' && <Docs ev={ev} />}
        {sub === 'decisions' && <Decisions ev={ev} />}
      </div>
    </div>
  );
}

function assigneeName(state, t) {
  if (t.assigneeType === 'client') return state.users.find((u) => u.id === t.assigneeId)?.name ?? 'Client';
  if (t.assigneeType === 'vendor') return state.vendors.find((v) => v.id === t.assigneeId)?.name ?? 'Vendor';
  return state.staff.find((s) => s.id === t.assigneeId)?.name ?? 'Unassigned';
}

function Tasks({ ev }) {
  const { state, act, today } = useStore();
  const [filter, setFilter] = useState('open');
  const [add, setAdd] = useState(false);
  const list = ev.tasks.filter((t) => filter === 'all' || (filter === 'open' ? t.status !== 'done' : t.assigneeType === filter)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = ev.tasks.filter((t) => t.status === 'done').length;
  return (
    <Card title={`Task & checklist — ${done}/${ev.tasks.length} done`} actions={<div className="row">
      <PillSelect options={[{ id: 'open', label: 'Open' }, { id: 'all', label: 'All' }, { id: 'client', label: 'Client' }, { id: 'vendor', label: 'Vendor' }, { id: 'staff', label: 'Staff' }]} value={filter} onChange={setFilter} />
      <button className="btn" onClick={() => act('TASKS_GENERATE', { eventId: ev.id })}>Apply template</button>
      <button className="btn primary" onClick={() => setAdd(true)}>+ Task</button>
    </div>}>
      <div className="faint mb" style={{ fontSize: 12 }}>Due dates are relative to the event date (T-minus). When the event is postponed, every relative task shifts automatically.</div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Due</th><th>T</th><th>Task</th><th>Assignee</th><th>Priority</th><th>Depends on</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((t) => {
              const blocked = taskBlocked(t, ev.tasks);
              const overdue = t.status !== 'done' && t.dueDate < today;
              return (
                <tr key={t.id}>
                  <td style={{ color: overdue ? 'var(--danger)' : undefined }}><CommitInput type="date" value={t.dueDate} onCommit={(d) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { dueDate: d, fixedDue: false } })} /></td>
                  <td className="faint">{t.offsetDays !== null && t.offsetDays !== undefined ? `T${t.offsetDays >= 0 ? '+' : ''}${t.offsetDays}` : '—'}</td>
                  <td>{t.title}<div className="faint">{t.category}</div></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <select value={t.assigneeType} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { assigneeType: e.target.value, assigneeId: null } })}>
                        <option value="staff">Staff</option><option value="client">Client</option><option value="vendor">Vendor</option>
                      </select>
                      <select value={t.assigneeId || ''} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { assigneeId: e.target.value || null } })}>
                        <option value="">—</option>
                        {t.assigneeType === 'staff' && state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        {t.assigneeType === 'client' && state.users.filter((u) => u.role === 'client' && u.clientId === ev.clientId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        {t.assigneeType === 'vendor' && ev.vendorBookings.map((b) => <option key={b.vendorId} value={b.vendorId}>{state.vendors.find((v) => v.id === b.vendorId)?.name}</option>)}
                      </select>
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>{assigneeName(state, t)}</div>
                  </td>
                  <td><select value={t.priority} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { priority: e.target.value } })}>{['low', 'medium', 'high'].map((p) => <option key={p}>{p}</option>)}</select></td>
                  <td className="faint" style={{ fontSize: 12 }}>{t.dependsOn.map((d) => ev.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(', ') || '—'}{blocked && t.status !== 'done' && <div><Badge tone="danger">blocked</Badge></div>}</td>
                  <td>
                    <select value={t.status} onChange={(e) => act('TASK_UPDATE', { eventId: ev.id, taskId: t.id, patch: { status: e.target.value } })}>
                      {['todo', 'in_progress', 'blocked', 'done'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {add && <AddTask ev={ev} onClose={() => setAdd(false)} />}
    </Card>
  );
}

function AddTask({ ev, onClose }) {
  const { act } = useStore();
  const [v, , bind] = useForm({ title: '', dueDate: ev.date, assigneeType: 'staff', priority: 'medium', category: 'general', dependsOn: '' });
  return (
    <Modal title="Add task" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.title} onClick={() => { act('TASK_ADD', { eventId: ev.id, data: { ...v, dependsOn: v.dependsOn ? [v.dependsOn] : [] } }); onClose(); }}>Add</button></>}>
      <div className="grid g2">
        <Field label="Title"><input {...bind('title')} /></Field>
        <Field label="Due date"><input type="date" {...bind('dueDate')} /></Field>
        <Field label="Assignee type"><select {...bind('assigneeType')}><option value="staff">Staff</option><option value="client">Client</option><option value="vendor">Vendor</option></select></Field>
        <Field label="Priority"><select {...bind('priority')}><option>low</option><option>medium</option><option>high</option></select></Field>
        <Field label="Category"><input {...bind('category')} /></Field>
        <Field label="Depends on"><select {...bind('dependsOn')}><option value="">—</option>{ev.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function Functions({ ev }) {
  const { act } = useStore();
  const upd = (id, patch) => act('SUBEVENT_UPDATE', { eventId: ev.id, subEventId: id, patch });
  return (
    <Card title="Sub-events / functions" actions={<button className="btn primary" onClick={() => { const name = prompt('Function name', 'Rehearsal Dinner'); name && act('SUBEVENT_ADD', { eventId: ev.id, data: { name } }); }}>+ Function</button>}>
      <table className="t">
        <thead><tr><th>Name</th><th>Date</th><th>Venue</th><th>Room</th><th>Start</th><th>End</th><th className="num">Guests</th><th /></tr></thead>
        <tbody>
          {ev.subEvents.map((s) => (
            <tr key={s.id}>
              <td><CommitInput value={s.name} onCommit={(v) => upd(s.id, { name: v })} /></td>
              <td><CommitInput type="date" value={s.date} onCommit={(v) => upd(s.id, { date: v })} /></td>
              <td><CommitInput value={s.venue} onCommit={(v) => upd(s.id, { venue: v })} /></td>
              <td><CommitInput value={s.room} onCommit={(v) => upd(s.id, { room: v })} /></td>
              <td><CommitInput type="time" value={s.start} onCommit={(v) => upd(s.id, { start: v })} /></td>
              <td><CommitInput type="time" value={s.end} onCommit={(v) => upd(s.id, { end: v })} /></td>
              <td className="num"><CommitInput className="inline" type="number" value={s.guestCount} onCommit={(v) => upd(s.id, { guestCount: v })} /></td>
              <td><button className="btn sm ghost" onClick={() => act('SUBEVENT_REMOVE', { eventId: ev.id, subEventId: s.id })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Forms({ ev }) {
  const { act } = useStore();
  if (!ev.forms.length) return <Card><Empty>Forms are created from the event type when the contract is signed.</Empty></Card>;
  return (
    <div className="grid g2">
      {ev.forms.map((f) => (
        <Card key={f.id} title={f.name} actions={f.submittedAt ? <Badge tone="ok">submitted {fmtDate(f.submittedAt.slice(0, 10))}</Badge> : <Badge tone="warn">awaiting client</Badge>}>
          {f.fields.map((fd) => (
            <div key={fd.key} className="mb"><div className="faint" style={{ fontSize: 12 }}>{fd.label}</div><div style={{ whiteSpace: 'pre-wrap' }}>{f.answers[fd.key] || <span className="faint">—</span>}</div></div>
          ))}
          {!f.submittedAt && <button className="btn sm" onClick={() => act('MESSAGE_SEND', { eventId: ev.id, text: `Reminder: please complete the "${f.name}" form in your portal.` })}>Nudge client</button>}
        </Card>
      ))}
    </div>
  );
}

function Design({ ev }) {
  const { act } = useStore();
  const db = decorSnapshot();
  const [color, setColor] = useState('#c9a227');
  const d = ev.design;
  return (
    <div className="grid g2">
      <Card title="Palette & concept">
        <div className="row mb">{d.palette.map((c) => <span key={c} className="swatch" title={c} style={{ background: c }} onClick={() => act('DESIGN_UPDATE', { eventId: ev.id, patch: { palette: d.palette.filter((x) => x !== c) } })} />)}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /><button className="btn sm" onClick={() => act('DESIGN_UPDATE', { eventId: ev.id, patch: { palette: [...d.palette, color] } })}>+ color</button></div>
        <Field label="Concept notes"><CommitInput value={d.notes} onCommit={(v) => act('DESIGN_UPDATE', { eventId: ev.id, patch: { notes: v } })} /></Field>
        <h4 className="mt">References</h4>
        {d.references.map((r, i) => <div key={i}>• {r}</div>)}
        <button className="btn sm mt" onClick={() => { const r = prompt('Reference (link or description)'); r && act('DESIGN_UPDATE', { eventId: ev.id, patch: { references: [...d.references, r] } }); }}>+ Reference</button>
      </Card>
      <Card title="Decor items on the board (linked to Decor Inventory)">
        <Moodboard itemIds={d.decorItemIds} />
        <div className="row mt">
          <select onChange={(e) => { if (e.target.value) act('DESIGN_UPDATE', { eventId: ev.id, patch: { decorItemIds: [...d.decorItemIds, e.target.value] } }); e.target.value = ''; }}>
            <option value="">+ Link decor item…</option>
            {db.items.filter((i) => !d.decorItemIds.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </Card>
    </div>
  );
}

function Docs({ ev }) {
  const { state, act, today } = useStore();
  const [v, , bind] = useForm({ name: '', type: 'Vendor contract', expiresAt: '' });
  return (
    <Card title="Document hub">
      <div className="row mb">
        <input placeholder="File name (mock upload)" {...bind('name')} />
        <select {...bind('type')}>{['Vendor contract', 'Floor plan', 'Venue permit', 'Insurance certificate', 'Menu', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
        <input type="date" title="Expiry (optional)" {...bind('expiresAt')} />
        <button className="btn primary" disabled={!v.name} onClick={() => act('DOCUMENT_ADD', { eventId: ev.id, ...v })}>Upload</button>
      </div>
      <table className="t">
        <thead><tr><th>Name</th><th>Type</th><th>Uploaded</th><th>By</th><th>Expires</th></tr></thead>
        <tbody>{ev.documents.map((d) => <tr key={d.id}><td>📄 {d.name}</td><td>{d.type}</td><td>{fmtDateTime(d.at)}</td><td>{state.users.find((u) => u.id === d.uploadedBy)?.name}</td><td>{d.expiresAt ? <span style={{ color: diffDays(today, d.expiresAt) < 30 ? 'var(--danger)' : undefined }}>{fmtDate(d.expiresAt)}</span> : '—'}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Decisions({ ev }) {
  const { state, act } = useStore();
  const [v, , bind] = useForm({ decision: '', decidedBy: '', reference: '' });
  return (
    <Card title="Decision log — “you approved this on…”">
      <div className="row mb">
        <input style={{ flex: 2 }} placeholder="Decision" {...bind('decision')} />
        <input placeholder="Approved by" {...bind('decidedBy')} />
        <input placeholder="Reference (meeting, email…)" {...bind('reference')} />
        <button className="btn primary" disabled={!v.decision || !v.decidedBy} onClick={() => act('DECISION_ADD', { eventId: ev.id, ...v })}>Log decision</button>
      </div>
      <table className="t">
        <thead><tr><th>When</th><th>Decision</th><th>Approved by</th><th>Reference</th><th>Recorded by</th></tr></thead>
        <tbody>{ev.decisions.map((d) => <tr key={d.id}><td>{fmtDateTime(d.approvedAt)}</td><td>{d.decision}</td><td>{d.decidedBy}</td><td>{d.reference}</td><td className="faint">{state.users.find((u) => u.id === d.recordedBy)?.name}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
