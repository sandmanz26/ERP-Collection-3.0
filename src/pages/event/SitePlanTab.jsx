import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, Button, PillSelect, SitePlan, Field, CommitInput, EmptyState, useDialog } from '../../design-system/index.js';

const ELEMENT_TYPES = [
  { type: 'stage', label: 'Stage', w: 8, h: 4, shape: 'rect' },
  { type: 'dance', label: 'Dance floor', w: 8, h: 8, shape: 'rect' },
  { type: 'table', label: 'Round table', w: 3, h: 3, shape: 'circle' },
  { type: 'table', label: 'Long table', w: 6, h: 1.5, shape: 'rect' },
  { type: 'bar', label: 'Bar', w: 5, h: 2, shape: 'rect' },
  { type: 'seating', label: 'Seating block', w: 8, h: 6, shape: 'rect' },
  { type: 'service', label: 'Service / catering station', w: 3, h: 2, shape: 'rect' },
  { type: 'feature', label: 'Feature (photo booth, arch…)', w: 3, h: 2, shape: 'rect' },
  { type: 'entry', label: 'Entrance / exit', w: 3, h: 1, shape: 'rect' },
  { type: 'power', label: 'Power point', w: 1, h: 1, shape: 'rect' },
];

/** Visual site / floor plan per room — drag elements, assign the responsible vendor, tables mirror the seating chart. */
export default function SitePlanTab({ ev }) {
  const { state, act } = useStore();
  const dialog = useDialog();
  const rooms = ev.sitePlan?.rooms ?? [];
  const [roomId, setRoomId] = useState(rooms[0]?.id);
  const [selId, setSelId] = useState(null);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const guests = ev.households.flatMap((h) => h.guests);
  const vendorName = (id) => state.vendors.find((v) => v.id === id)?.name;
  const elements = (room?.elements ?? []).map((el) => {
    if (el.tableId) {
      const t = ev.tables.find((x) => x.id === el.tableId);
      const seated = guests.filter((g) => g.tableId === el.tableId).length;
      return { ...el, sub: t ? `${seated}/${t.capacity} seated` : 'no table' };
    }
    return { ...el, sub: el.vendorId ? vendorName(el.vendorId) : el.sub };
  });
  const sel = room?.elements.find((e) => e.id === selId);
  const overfull = elements.filter((el) => el.tableId && (() => { const t = ev.tables.find((x) => x.id === el.tableId); return t && guests.filter((g) => g.tableId === t.id).length > t.capacity; })()).map((e) => e.id);
  const upd = (patch) => act('SITE_ELEMENT_UPDATE', { eventId: ev.id, roomId: room.id, elementId: sel.id, patch });

  const addRoom = async () => {
    const r = await dialog.form({ title: 'Add room / area', fields: [{ name: 'name', label: 'Name', required: true, defaultValue: 'Terrace' }, { name: 'width', label: 'Width (m)', type: 'number', defaultValue: 30 }, { name: 'height', label: 'Depth (m)', type: 'number', defaultValue: 20 }] });
    r && act('SITE_ROOM_ADD', { eventId: ev.id, ...r });
  };
  if (!room) return <Card><EmptyState>No floor plan yet.<div className="mt"><Button variant="primary" onClick={addRoom}>+ Add room</Button></div></EmptyState></Card>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(260px,1fr)' }}>
      <Card title="Site plan" actions={<div className="row"><PillSelect options={rooms.map((r) => ({ id: r.id, label: r.name }))} value={room.id} onChange={(id) => { setRoomId(id); setSelId(null); }} /><Button size="sm" onClick={addRoom}>+ Room</Button><Button size="sm" onClick={() => window.print()}>Print</Button></div>}>
        <SitePlan width={room.width} height={room.height} elements={elements} selectedId={selId} highlightIds={overfull}
          onSelect={(el) => setSelId(el?.id ?? null)}
          onMove={(el, x, y) => act('SITE_ELEMENT_UPDATE', { eventId: ev.id, roomId: room.id, elementId: el.id, patch: { x, y } })} />
        <div className="legend mt">
          {[['#cfc4ff', 'Stage'], ['#fff', 'Tables'], ['#ffe7b3', 'Bars'], ['#dbeafe', 'Service'], ['#c9f0d3', 'Entrances'], ['#ffd6d6', 'Power'], ['#fde2ef', 'Features']].map(([c, l]) => <span key={l}><i style={{ background: c, border: '1px solid var(--color-ink-3)' }} />{l}</span>)}
          <span className="muted">Drag to move (0.5 m snap). Red outline = over-seated table.</span>
        </div>
      </Card>
      <div>
        <Card title={sel ? `Selected: ${sel.label}` : 'Add to plan'}>
          {sel ? (
            <div className="stack">
              <Field label="Label"><CommitInput value={sel.label} onCommit={(v) => upd({ label: v })} /></Field>
              <div className="grid g2">
                <Field label="Width (m)"><CommitInput type="number" value={sel.w} onCommit={(v) => upd({ w: v })} /></Field>
                <Field label="Depth (m)"><CommitInput type="number" value={sel.h} onCommit={(v) => upd({ h: v })} /></Field>
              </div>
              <Field label="Responsible vendor"><select value={sel.vendorId || ''} onChange={(e) => upd({ vendorId: e.target.value || null })}><option value="">— in-house —</option>{ev.vendorBookings.map((b) => <option key={b.vendorId} value={b.vendorId}>{vendorName(b.vendorId)}</option>)}</select></Field>
              {sel.type === 'table' && <Field label="Linked seating-chart table"><select value={sel.tableId || ''} onChange={(e) => upd({ tableId: e.target.value || null })}><option value="">—</option>{ev.tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.capacity})</option>)}</select></Field>}
              <div className="row"><Button size="sm" onClick={() => upd({ w: sel.h, h: sel.w })}>Rotate 90°</Button><Button size="sm" variant="danger" onClick={() => { act('SITE_ELEMENT_REMOVE', { eventId: ev.id, roomId: room.id, elementId: sel.id }); setSelId(null); }}>Remove</Button></div>
            </div>
          ) : (
            <div className="stack">
              {ELEMENT_TYPES.map((t) => <Button key={t.label} size="sm" onClick={() => act('SITE_ELEMENT_ADD', { eventId: ev.id, roomId: room.id, element: { type: t.type, label: t.label, w: t.w, h: t.h, shape: t.shape } })}>+ {t.label}</Button>)}
            </div>
          )}
        </Card>
        <Card title="Vendor footprint">
          {[...new Set(room.elements.filter((e) => e.vendorId).map((e) => e.vendorId))].map((vid) => <div key={vid} className="row between text-sm"><span>{vendorName(vid)}</span><Badge>{room.elements.filter((e) => e.vendorId === vid).map((e) => e.label).join(', ')}</Badge></div>)}
          <div className="faint text-sm mt">Vendors see the plan for rooms where they have elements in the vendor portal.</div>
        </Card>
      </div>
    </div>
  );
}
