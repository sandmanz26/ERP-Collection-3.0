import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Alert, download, Button, useDialog } from '../../design-system/index.js';

export function seatingViolations(ev) {
  const all = ev.households.flatMap((h) => h.guests);
  return ev.seatingRules
    .map((r) => {
      const a = all.find((g) => g.id === r.guestA);
      const b = all.find((g) => g.id === r.guestB);
      if (!a || !b) return null;
      const bad = r.type === 'apart' ? a.tableId && a.tableId === b.tableId : a.tableId !== b.tableId;
      return bad ? { rule: r, a, b } : null;
    })
    .filter(Boolean);
}

export function SeatingBoard({ ev, readOnly }) {
  const { act } = useStore();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const all = ev.households.flatMap((h) => h.guests.map((g) => ({ ...g, household: h.name })));
  const attending = all.filter((g) => !Object.values(g.rsvp).every((v) => v === 'no'));
  const unseated = attending.filter((g) => !g.tableId);
  const violations = seatingViolations(ev);
  const badIds = new Set(violations.flatMap((v) => [v.a.id, v.b.id]));
  const chip = (g) => (
    <span key={g.id} className={`gchip ${g.isChild ? 'child' : ''} ${g.dietary ? 'diet' : ''} ${badIds.has(g.id) ? 'bad' : ''}`} draggable={!readOnly} onDragStart={() => setDrag(g.id)} title={`${g.household}${g.dietary ? ` · ${g.dietary}` : ''}${g.meal ? ` · ${g.meal}` : ''}`}>
      {g.name}{g.dietary ? ' ⚠' : ''}
    </span>
  );
  const drop = (tableId) => { setOver(null); if (drag) act('SEAT_GUEST', { eventId: ev.id, guestId: drag, tableId }); setDrag(null); };
  return (
    <div className="seating">
      <div className={`card ${over === 'none' ? 'dragover' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver('none'); }} onDrop={() => drop(null)}>
        <h3>Unseated ({unseated.length})</h3>
        <div className="faint" style={{ fontSize: 12 }}>Drag guests onto tables. ⚠ = dietary need.</div>
        <div className="mt">{unseated.map(chip)}</div>
      </div>
      <div>
        {violations.map((v) => <Alert key={v.rule.id} tone="danger">Rule broken: {v.a.name} & {v.b.name} must sit {v.rule.type} — {v.rule.note}</Alert>)}
        <div className="tables mt">
          {ev.tables.map((t) => {
            const seated = all.filter((g) => g.tableId === t.id);
            const viol = seated.some((g) => badIds.has(g.id));
            return (
              <div key={t.id} className={`tablebox ${t.shape} ${over === t.id ? 'dragover' : ''} ${viol ? 'violation' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(t.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(t.id)}>
                <div className="row between"><b>{t.name}</b><Badge tone={seated.length > t.capacity ? 'danger' : seated.length === t.capacity ? 'ok' : ''}>{seated.length}/{t.capacity}</Badge></div>
                <div className="mt">{seated.map(chip)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SeatingTab({ ev }) {
  const dialog = useDialog();
  const { act } = useStore();
  const [rule, setRule] = useState({ a: '', b: '', type: 'apart', note: '' });
  const all = ev.households.flatMap((h) => h.guests);
  const escort = () => {
    const lines = all.filter((g) => g.tableId).sort((a, b) => a.name.localeCompare(b.name)).map((g) => `${g.name}\t${ev.tables.find((t) => t.id === g.tableId)?.name}\t${g.meal || ''}\t${g.dietary || ''}`);
    download(`${ev.name}-escort-cards.tsv`, `Name\tTable\tMeal\tDietary\n${lines.join('\n')}`, 'text/tab-separated-values');
    act('INTERACTION_ADD', { eventId: ev.id, type: 'note', summary: 'Escort cards exported' });
  };
  const cateringByTable = () => {
    const out = ev.tables.map((t) => {
      const seated = all.filter((g) => g.tableId === t.id);
      const meals = {};
      seated.forEach((g) => (meals[g.meal || 'TBD'] = (meals[g.meal || 'TBD'] || 0) + 1));
      return `${t.name} (${seated.length}): ${Object.entries(meals).map(([m, n]) => `${n}× ${m}`).join(', ')}${seated.filter((g) => g.dietary).length ? ` | dietary: ${seated.filter((g) => g.dietary).map((g) => `${g.name}=${g.dietary}`).join('; ')}` : ''}`;
    });
    download(`${ev.name}-catering-by-table.txt`, out.join('\n'));
    act('INTERACTION_ADD', { eventId: ev.id, type: 'note', summary: 'Catering report per table exported' });
  };
  return (
    <div>
      <Card title="Seating chart" actions={<div className="row">
        <Button onClick={async () => { const r = await dialog.form({ title: 'Add table', fields: [{ name: 'name', label: 'Name', defaultValue: `Table ${ev.tables.length}`, required: true }, { name: 'capacity', label: 'Seats', type: 'number', defaultValue: 10, required: true }, { name: 'shape', label: 'Shape', type: 'select', options: ['round', 'rect'], defaultValue: 'round' }] }); r && act('TABLE_ADD', { eventId: ev.id, ...r }); }}>+ Table</Button>
        <Button onClick={escort}>Export escort cards</Button>
        <Button onClick={cateringByTable}>Catering report per table</Button>
      </div>}>
        <SeatingBoard ev={ev} />
      </Card>
      <Card title="Seating rules">
        <div className="row mb">
          <select value={rule.a} onChange={(e) => setRule({ ...rule, a: e.target.value })}><option value="">Guest A…</option>{all.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select value={rule.type} onChange={(e) => setRule({ ...rule, type: e.target.value })}><option value="apart">must NOT sit with</option><option value="together">must sit with</option></select>
          <select value={rule.b} onChange={(e) => setRule({ ...rule, b: e.target.value })}><option value="">Guest B…</option>{all.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <input placeholder="Note" value={rule.note} onChange={(e) => setRule({ ...rule, note: e.target.value })} />
          <Button variant="primary" disabled={!rule.a || !rule.b} onClick={() => act('SEATING_RULE_ADD', { eventId: ev.id, guestA: rule.a, guestB: rule.b, type: rule.type, note: rule.note })}>Add rule</Button>
        </div>
        {ev.seatingRules.map((r) => (
          <div key={r.id} className="row">• {all.find((g) => g.id === r.guestA)?.name} {r.type === 'apart' ? '≠' : '='} {all.find((g) => g.id === r.guestB)?.name} <span className="faint">{r.note}</span><Button variant="ghost" size="sm" onClick={() => act('SEATING_RULE_REMOVE', { eventId: ev.id, ruleId: r.id })}>✕</Button></div>
        ))}
      </Card>
    </div>
  );
}
