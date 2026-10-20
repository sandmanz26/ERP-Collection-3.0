import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Button, useDialog } from '../../design-system/index.js';
import { fmtDateTime } from '../../lib/dates.js';

export function Chat({ ev }) {
  const { state, act, user } = useStore();
  const [text, setText] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, 1e9); }, [ev.messages.length]);
  return (
    <div>
      <div className="chat" ref={ref}>
        {ev.messages.map((m) => {
          const from = state.users.find((u) => u.id === m.from);
          return (
            <div key={m.id} className={`bubble ${m.from === user.id ? 'me' : ''}`}>
              {m.text}
              <div className="meta">{from?.name} · {fmtDateTime(m.at)}</div>
            </div>
          );
        })}
        {ev.messages.length === 0 && <div className="empty">No messages yet.</div>}
      </div>
      <div className="row mt">
        <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { act('MESSAGE_SEND', { eventId: ev.id, text }); setText(''); } }} placeholder="Write a message… (stored in the event history, not personal WhatsApp/email)" />
        <Button variant="primary" disabled={!text.trim()} onClick={() => { act('MESSAGE_SEND', { eventId: ev.id, text }); setText(''); }}>Send</Button>
      </div>
    </div>
  );
}

export default function MessagesTab({ ev }) {
  const dialog = useDialog();
  const { act } = useStore();
  return (
    <div className="grid g2">
      <Card title="Client ↔ planner messages"><Chat ev={ev} /></Card>
      <Card title="Email sync (Gmail / Outlook — mock)">
        <p className="muted" style={{ fontSize: 12.5 }}>Two-way sync would attach every email thread with the client's address to this event. Simulate an inbound email:</p>
        <Button onClick={async () => { const s = await dialog.prompt({ title: 'Simulate inbound email', label: 'Subject', defaultValue: 'Question about the timeline' }); s && act('EMAIL_LOG', { eventId: ev.id, direction: 'in', subject: s, from: 'Gmail' }); }}>Simulate inbound email</Button>
        <p className="faint mt" style={{ fontSize: 12 }}>Synced emails appear in Overview → Interactions.</p>
      </Card>
    </div>
  );
}
