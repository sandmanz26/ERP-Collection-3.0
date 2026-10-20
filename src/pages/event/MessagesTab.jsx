import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Button, useDialog, Field } from '../../design-system/index.js';
import { fmtDateTime, fmtDate, addDays } from '../../lib/dates.js';
import { renderTemplate } from '../../lib/contracts.js';

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
      <Card title="Email from template">
        <EmailComposer ev={ev} />
      </Card>
      <Card title="Email sync (Gmail / Outlook — mock)">
        <p className="muted" style={{ fontSize: 12.5 }}>Two-way sync would attach every email thread with the client's address to this event. Simulate an inbound email:</p>
        <Button onClick={async () => { const s = await dialog.prompt({ title: 'Simulate inbound email', label: 'Subject', defaultValue: 'Question about the timeline' }); s && act('EMAIL_LOG', { eventId: ev.id, direction: 'in', subject: s, from: 'Gmail' }); }}>Simulate inbound email</Button>
        <p className="faint mt" style={{ fontSize: 12 }}>Synced emails appear in Overview → Interactions.</p>
      </Card>
    </div>
  );
}

/** Pick a template, variables are filled from the event; editable before sending. Logged to outbox + interactions. */
function EmailComposer({ ev }) {
  const { state, act } = useStore();
  const client = state.clients.find((c) => c.id === ev.clientId);
  const [tplId, setTplId] = useState('');
  const [draft, setDraft] = useState(null);
  const pick = (id) => {
    setTplId(id);
    const t = state.settings.emailTemplates.find((x) => x.id === id);
    if (!t) return setDraft(null);
    const vars = { client_name: client?.name, event_name: ev.name, event_date: fmtDate(ev.date), planner_name: state.users.find((u) => u.id === ev.plannerId)?.name ?? 'Your planner', rsvp_deadline: fmtDate(addDays(ev.date, -state.settings.rsvpDeadlineDays)) };
    setDraft({ to: client?.email ?? '', subject: renderTemplate(t.subject, vars), body: renderTemplate(t.body, vars) });
  };
  return (
    <div className="stack">
      <select value={tplId} onChange={(e) => pick(e.target.value)}><option value="">Choose template…</option>{state.settings.emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {draft && (
        <>
          <Field label="To"><input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
          <Field label="Subject"><input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
          <Field label="Body" hint="Unfilled {{variables}} stay visible so nothing is sent half-merged unnoticed."><textarea style={{ minHeight: 140 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
          <Button variant="primary" onClick={() => { act('EMAIL_SEND', { eventId: ev.id, templateId: tplId, ...draft }); setDraft(null); setTplId(''); }}>Send email</Button>
        </>
      )}
    </div>
  );
}
