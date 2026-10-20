import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Modal, Field, useForm, Alert, StatTile, PillSelect, download, Button, useDialog, printDocument, QrCode } from '../../design-system/index.js';
import { badgesHtml } from '../../lib/documents.js';
import QRCode from 'qrcode';
import { headcount, guaranteeWarnings, finalHeadcountDeadline } from '../../lib/derived.js';
import { fmtDate, addDays } from '../../lib/dates.js';

const CYCLE = { pending: 'yes', yes: 'no', no: 'pending' };

export function RsvpCell({ ev, g, h, s, readOnly }) {
  const { act } = useStore();
  if (!h.invitedSubEventIds.includes(s.id)) return <span className="faint">—</span>;
  const v = g.rsvp[s.id] ?? 'pending';
  const tone = v === 'yes' ? 'ok' : v === 'no' ? 'danger' : 'warn';
  return (
    <button className={`badge ${tone}`} style={{ border: 'none', cursor: readOnly ? 'default' : 'pointer' }} disabled={readOnly}
      onClick={() => act('RSVP_SET', { eventId: ev.id, guestId: g.id, subEventId: s.id, value: CYCLE[v] })}>{v}</button>
  );
}

export function GuestTable({ ev, readOnly, canEdit = true }) {
  const dialog = useDialog();
  const { act } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...new Set(ev.households.map((h) => h.category))];
  const list = ev.households.filter((h) => (cat === 'All' || h.category === cat) && (!q || h.name.toLowerCase().includes(q.toLowerCase()) || h.guests.some((g) => g.name.toLowerCase().includes(q.toLowerCase()))));
  return (
    <>
      <div className="row mb"><input placeholder="Search guest/household…" value={q} onChange={(e) => setQ(e.target.value)} /><PillSelect options={cats} value={cat} onChange={setCat} /></div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr><th>Household / guest</th><th>Category</th><th>Code</th>{ev.subEvents.map((s) => <th key={s.id}>{s.name}</th>)}<th>Meal</th><th>Dietary</th><th>Access.</th>{ev.tables.length > 0 && <th>Table</th>}<th>Check-in</th></tr>
          </thead>
          <tbody>
            {list.map((h) => (
              <React.Fragment key={h.id}>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <td colSpan={3 + ev.subEvents.length + 4 + (ev.tables.length > 0 ? 1 : 0)}>
                    <div className="row between">
                      <span><b>{h.name}</b> <span className="faint">{h.email}{h.company ? ` · ${h.company}` : ''}</span> <Badge>{h.category}</Badge> <code>{h.code}</code> {h.plusOnesAllowed > 0 && <Badge tone="info">+{h.plusOnesAllowed} allowed</Badge>}</span>
                      {canEdit && !readOnly && (
                        <span className="row">
                          {h.plusOnesAllowed > h.guests.filter((g) => g.isPlusOne).length && <Button size="sm" onClick={async () => { const n = await dialog.prompt({ title: `Plus-one for ${h.name}`, label: 'Name' }); n && act('GUEST_ADD', { eventId: ev.id, householdId: h.id, name: n, isPlusOne: true }); }}>+ plus-one</Button>}
                          <Button size="sm" onClick={async () => { const r = await dialog.form({ title: `Add guest to ${h.name}`, fields: [{ name: 'name', label: 'Guest name', required: true }, { name: 'isChild', label: 'Child', type: 'checkbox' }] }); r && act('GUEST_ADD', { eventId: ev.id, householdId: h.id, name: r.name, isChild: r.isChild }); }}>+ guest</Button>
                          <Button variant="ghost" size="sm" onClick={async () => (await dialog.confirm({ title: 'Remove household', message: `Remove ${h.name} and all their guests?`, danger: true })) && act('HOUSEHOLD_REMOVE', { eventId: ev.id, householdId: h.id })}>✕</Button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {h.guests.map((g) => (
                  <tr key={g.id}>
                    <td style={{ paddingLeft: 22 }}>{g.name} {g.isChild && <Badge tone="info">child</Badge>} {g.isPlusOne && <Badge>+1</Badge>}</td>
                    <td className="faint">{h.category}</td><td />
                    {ev.subEvents.map((s) => <td key={s.id}><RsvpCell ev={ev} g={g} h={h} s={s} readOnly={readOnly} /></td>)}
                    <td>{readOnly ? g.meal : <select value={g.meal} onChange={(e) => act('GUEST_UPDATE', { eventId: ev.id, guestId: g.id, patch: { meal: e.target.value } })}><option value="">—</option>{['Beef tenderloin', 'Sea bass', 'Wild mushroom risotto (V)', 'Kids menu'].map((m) => <option key={m}>{m}</option>)}</select>}</td>
                    <td>{readOnly ? g.dietary : <input className="inline" style={{ width: 120 }} defaultValue={g.dietary} onBlur={(e) => e.target.value !== g.dietary && act('GUEST_UPDATE', { eventId: ev.id, guestId: g.id, patch: { dietary: e.target.value } })} />}</td>
                    <td className="faint">{g.accessibility}</td>
                    {ev.tables.length > 0 && <td>{ev.tables.find((t) => t.id === g.tableId)?.name ?? '—'}</td>}
                    <td><input type="checkbox" checked={g.checkedIn} disabled={readOnly} onChange={(e) => act('GUEST_CHECKIN', { eventId: ev.id, guestId: g.id, value: e.target.checked })} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AddHouseholdModal({ ev, et, onClose }) {
  const { act } = useStore();
  const [v, , bind] = useForm({ name: '', category: et.features.registration ? 'Attendee' : 'Friends', email: '', plusOnesAllowed: 0, guests: '' });
  const [subs, setSubs] = useState(ev.subEvents.map((s) => s.id));
  const submit = () => {
    const guests = (v.guests || v.name).split('\n').map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
    act('HOUSEHOLD_ADD', { eventId: ev.id, name: v.name, category: v.category, email: v.email, plusOnesAllowed: v.plusOnesAllowed, invitedSubEventIds: subs, guests });
    onClose();
  };
  return (
    <Modal title={et.features.registration ? 'Register attendee' : 'Add household / party'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.name} onClick={submit}>Add</Button></>}>
      <div className="grid g2">
        <Field label={et.features.registration ? 'Attendee name' : 'Household name'}><input {...bind('name')} /></Field>
        <Field label="Category"><select {...bind('category')}>{(et.features.registration ? ['Attendee', 'VIP', 'Speaker', 'Sponsor', 'Press'] : ['Bride family', 'Groom family', 'Family', 'Friends', 'VIP', 'Colleagues']).map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Email"><input {...bind('email')} /></Field>
        <Field label="Plus-ones allowed"><input type="number" {...bind('plusOnesAllowed')} /></Field>
      </div>
      {!et.features.registration && <Field label="Guests (one per line; defaults to household name)" style={{ marginTop: 10 }}><textarea {...bind('guests')} /></Field>}
      <h4 className="mt">Invited to</h4>
      <PillSelect multi options={ev.subEvents.map((s) => ({ id: s.id, label: s.name }))} value={subs} onChange={setSubs} />
    </Modal>
  );
}

export default function GuestsTab({ ev, et }) {
  const dialog = useDialog();
  const { state, act, today } = useStore();
  const [add, setAdd] = useState(false);
  const hc = headcount(ev);
  const warn = guaranteeWarnings(ev);
  const deadline = finalHeadcountDeadline(state, ev);
  const guests = ev.households.flatMap((h) => h.guests);
  const exportCsv = () => {
    const rows = [['Household', 'Guest', 'Category', 'Code', ...ev.subEvents.map((s) => s.name), 'Meal', 'Dietary', 'Table']];
    ev.households.forEach((h) => h.guests.forEach((g) => rows.push([h.name, g.name, h.category, h.code, ...ev.subEvents.map((s) => g.rsvp[s.id] ?? '-'), g.meal, g.dietary, ev.tables.find((t) => t.id === g.tableId)?.name ?? ''])));
    download(`${ev.name}-guests.csv`, rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    act('INTERACTION_ADD', { eventId: ev.id, type: 'note', summary: 'Guest list exported to CSV' });
  };
  const printBadges = async () => {
    const qrMap = {};
    await Promise.all(ev.households.map(async (h) => { qrMap[h.code] = await QRCode.toDataURL(h.code, { margin: 1, width: 120 }); }));
    printDocument(`${ev.name} badges`, badgesHtml(state, ev, qrMap));
    act('DOCUMENT_GENERATED', { eventId: ev.id, kind: 'QR badges', ref: `${guests.length} guests` });
  };
  const mainSe = ev.subEvents.reduce((a, s) => ((hc.bySubEvent[s.id] || 0) > (hc.bySubEvent[a?.id] || 0) ? s : a), ev.subEvents[0]);
  const meals = {};
  guests.filter((g) => mainSe && g.rsvp[mainSe.id] === 'yes').forEach((g) => (meals[g.meal || 'Not chosen'] = (meals[g.meal || 'Not chosen'] || 0) + 1));
  const diets = guests.filter((g) => g.dietary && Object.values(g.rsvp).includes('yes'));
  return (
    <div>
      <div className="grid g5">
        <StatTile label="Invited" value={hc.invited} />
        <StatTile label="Confirmed (max function)" value={hc.confirmed} tone="ok" />
        <StatTile label="Pending" value={hc.pending} tone="warn" />
        <StatTile label="Declined" value={hc.declined} />
        <StatTile label={et.features.checkInQR ? 'Checked in (QR)' : 'Checked in'} value={hc.checkedIn} />
      </div>
      {warn.map((w, i) => <Alert key={i} tone={w.level}>{w.text}</Alert>)}
      <div className="grid g3 mt">
        <Card title="Headcount per function">
          {ev.subEvents.map((s) => <div key={s.id} className="row between"><span>{s.name}</span><b>{hc.bySubEvent[s.id] || 0}</b></div>)}
          <div className="mt">
            <div className="faint" style={{ fontSize: 12 }}>Final headcount deadline: <b>{fmtDate(deadline)}</b>{today > deadline && ' (passed — changes need a Change Order)'}</div>
            <div className="row mt"><b>Final headcount: {ev.finalHeadcount ?? '—'}</b><Button size="sm" onClick={async () => { const n = await dialog.prompt({ title: 'Confirm final headcount', label: 'Guests', type: 'number', defaultValue: hc.confirmed, hint: 'Sent to catering/venue as the guaranteed number' }); n !== null && act('FINAL_HEADCOUNT_SET', { eventId: ev.id, count: Number(n) }); }}>Set</Button></div>
          </div>
        </Card>
        <Card title={`Catering report${mainSe ? ` — ${mainSe.name}` : ''}`}>
          {Object.entries(meals).map(([m, n]) => <div key={m} className="row between"><span>{m}</span><b>{n}</b></div>)}
          <h4 className="mt">Dietary / allergies ({diets.length})</h4>
          <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12 }}>{diets.map((g) => <div key={g.id}>{g.name}: <b>{g.dietary}</b></div>)}</div>
        </Card>
        <Card title="RSVP website">
          <p className="muted" style={{ fontSize: 12.5 }}>Each household has a unique code. Guests RSVP per function, choose meals and add allowed plus-ones on the public page.</p>
          <a className="btn" href={`#/rsvp?event=${ev.id}`} target="_blank" rel="noreferrer">Open public RSVP page ↗</a>
          {ev.households[0] && <div className="row mt"><QrCode value={ev.households[0].code} size={56} /><div className="faint" style={{ fontSize: 12 }}>Try code <code>{ev.households[0].code}</code><br />RSVP closes {fmtDate(addDays(ev.date, -state.settings.rsvpDeadlineDays))}</div></div>}
          <div className="row mt"><Button onClick={exportCsv}>Export CSV</Button><Button onClick={printBadges}>{et.features.registration ? 'Print badges (QR)' : 'Print QR place cards'}</Button></div>
        </Card>
      </div>
      <Card title={et.features.registration ? 'Attendee registrations' : 'Guest list (households / parties)'} className="mt" actions={<Button variant="primary" onClick={() => setAdd(true)}>{et.features.registration ? '+ Register attendee' : '+ Household'}</Button>}>
        <div className="faint mb" style={{ fontSize: 12 }}>Click an RSVP badge to cycle pending → yes → no. Confirmed headcount feeds per-guest budget lines and guarantee warnings automatically.</div>
        <GuestTable ev={ev} />
      </Card>
      {add && <AddHouseholdModal ev={ev} et={et} onClose={() => setAdd(false)} />}
    </div>
  );
}
