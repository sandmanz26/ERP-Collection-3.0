import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Alert, Badge, Button, useDialog } from '../design-system/index.js';
import { fmtDate } from '../lib/dates.js';

/** Public RSVP website (no login). Guests look up their household by unique code. */
export default function RsvpPublic() {
  const dialog = useDialog();
  const [sp] = useSearchParams();
  const { state, act } = useStore();
  const ev = state.events.find((e) => e.id === sp.get('event')) ?? state.events.find((e) => e.households.length);
  const [code, setCode] = useState('');
  const [hhId, setHhId] = useState(null);
  const [done, setDone] = useState(false);
  const hh = ev?.households.find((h) => h.id === hhId);
  if (!ev) return <div className="empty">Event not found</div>;
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f4ecd8,#fff)', padding: 24 }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', fontFamily: 'Georgia, serif' }}>
          <div className="faint">You're invited</div>
          <h1 style={{ fontSize: 32 }}>{ev.name}</h1>
          <div>{fmtDate(ev.date, { weekday: 'long' })} · {ev.venue?.name}</div>
        </div>
        {!hh && (
          <Card className="mt">
            <h3>Find your invitation</h3>
            <div className="row"><input placeholder="RSVP code (e.g. on your invitation)" value={code} onChange={(e) => setCode(e.target.value)} /><Button variant="primary" onClick={() => { const h = ev.households.find((x) => x.code.toLowerCase() === code.trim().toLowerCase()); if (h) setHhId(h.id); else dialog.alert({ title: 'Code not found', message: 'Please check the code printed on your invitation.' }); }}>Continue</Button></div>
          </Card>
        )}
        {hh && (
          <Card className="mt" title={`Welcome, ${hh.name}`}>
            {done && <Alert tone="success">Thank you — your response is saved! You can change it until the RSVP deadline.</Alert>}
            {hh.guests.map((g) => (
              <div key={g.id} className="card" style={{ padding: 12 }}>
                <b>{g.name}</b> {g.isPlusOne && <Badge>guest</Badge>}
                {ev.subEvents.filter((s) => hh.invitedSubEventIds.includes(s.id)).map((s) => (
                  <div key={s.id} className="row between mt">
                    <span>{s.name} <span className="faint">{fmtDate(s.date)} {s.start}</span></span>
                    <span className="row">
                      {['yes', 'no'].map((val) => <Button key={val} size="sm" variant={g.rsvp[s.id] === val ? (val === 'yes' ? 'success' : 'danger-solid') : 'secondary'} onClick={() => { act('RSVP_SET', { eventId: ev.id, guestId: g.id, subEventId: s.id, value: val }); setDone(true); }}>{val === 'yes' ? 'Joyfully accepts' : 'Regretfully declines'}</Button>)}
                    </span>
                  </div>
                ))}
                <div className="row mt">
                  <span>Meal</span>
                  <select value={g.meal} onChange={(e) => act('GUEST_UPDATE', { eventId: ev.id, guestId: g.id, patch: { meal: e.target.value } })}><option value="">Choose…</option>{['Beef tenderloin', 'Sea bass', 'Wild mushroom risotto (V)', 'Kids menu'].map((m) => <option key={m}>{m}</option>)}</select>
                  <input placeholder="Allergies / dietary" defaultValue={g.dietary} onBlur={(e) => e.target.value !== g.dietary && act('GUEST_UPDATE', { eventId: ev.id, guestId: g.id, patch: { dietary: e.target.value } })} />
                </div>
              </div>
            ))}
            {hh.plusOnesAllowed > hh.guests.filter((g) => g.isPlusOne).length && <Button className="mt" onClick={async () => { const n = await dialog.prompt({ title: 'Add your plus-one', label: 'Guest name' }); n && act('GUEST_ADD', { eventId: ev.id, householdId: hh.id, name: n, isPlusOne: true }); }}>+ Add your plus-one</Button>}
          </Card>
        )}
        <div className="faint mt" style={{ textAlign: 'center', fontSize: 12 }}>Powered by {state.settings.company.name} · <a href="#/">back to app</a></div>
      </div>
    </div>
  );
}
