import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, Tabs, Modal, Field, Button } from '../design-system/index.js';
import { fmtDateTime } from '../lib/dates.js';

const TRIGGERS = { hold_expiring: 'Hold expiring', hold_promoted: 'Hold promoted', payment_due: 'Payment due', payment_overdue: 'Payment overdue', relative_date: 'Date relative to event', doc_expiry: 'Vendor document expiring', stage_change: 'Status changed' };

export default function Automation() {
  const { state, act } = useStore();
  const [tab, setTab] = useState('outbox');
  const [mail, setMail] = useState(null);
  const [tpl, setTpl] = useState(null);
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Communication & automation</h1><div className="muted">Templates with variables, trigger-based workflows and the (mock) outbox. The engine runs on load and every 60 seconds.</div></div>
        <Button variant="primary" onClick={() => act('SYSTEM_TICK', {})}>Run automations now</Button>
      </div>
      <Tabs tabs={[{ id: 'outbox', label: 'Outbox', count: state.outbox.length }, { id: 'rules', label: 'Workflows' }, { id: 'templates', label: 'Templates' }, { id: 'sync', label: 'Email & calendar sync' }]} value={tab} onChange={setTab} />
      {tab === 'outbox' && (
        <Card>
          <table className="t">
            <thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Event</th><th>Workflow</th></tr></thead>
            <tbody>{state.outbox.map((m) => <tr key={m.id} onClick={() => setMail(m)} style={{ cursor: 'pointer' }}><td className="nowrap">{fmtDateTime(m.ts)}</td><td>{m.to}</td><td>{m.subject}</td><td>{m.eventId && <Link to={`/events/${m.eventId}`} onClick={(e) => e.stopPropagation()}>{state.events.find((e) => e.id === m.eventId)?.name}</Link>}</td><td className="faint">{state.settings.automations.find((a) => a.id === m.automationId)?.name ?? 'manual'}</td></tr>)}</tbody>
          </table>
          {state.outbox.length === 0 && <div className="empty">Nothing sent yet.</div>}
        </Card>
      )}
      {tab === 'rules' && (
        <Card>
          <table className="t">
            <thead><tr><th>Workflow</th><th>Trigger</th><th>Config</th><th>Template</th><th>Enabled</th></tr></thead>
            <tbody>{state.settings.automations.map((a) => <tr key={a.id}><td>{a.name}</td><td><Badge tone="info">{TRIGGERS[a.trigger]}</Badge></td><td><code>{JSON.stringify(a.config)}</code></td><td>{state.settings.emailTemplates.find((t) => t.id === a.templateId)?.name}</td><td><input type="checkbox" checked={a.enabled} onChange={() => act('AUTOMATION_TOGGLE', { automationId: a.id })} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}
      {tab === 'templates' && (
        <Card>
          <div className="faint mb" style={{ fontSize: 12 }}>Variables: {'{{client_name}} {{event_name}} {{event_date}} {{planner_name}} {{invoice_number}} {{amount}} {{due_date}} {{days_left}} {{hold_expires}} {{vendor_name}} {{expiry}} {{rsvp_deadline}}'}</div>
          <table className="t"><tbody>{state.settings.emailTemplates.map((t) => <tr key={t.id}><td><b>{t.name}</b></td><td>{t.subject}</td><td><Button size="sm" onClick={() => setTpl(t)}>Edit</Button></td></tr>)}</tbody></table>
        </Card>
      )}
      {tab === 'sync' && (
        <div className="grid g2">
          <Card title="Email (Gmail / Outlook)"><p className="muted">In production: OAuth to Gmail/Outlook, two-way sync of threads matching client/vendor addresses, filed per event. Mock: use “Simulate inbound email” in an event's Messages tab.</p></Card>
          <Card title="Calendar"><p className="muted">Staff shifts export as .ics (Staff page). In production: Google/Microsoft calendar push per staff member.</p></Card>
        </div>
      )}
      {mail && <Modal title={mail.subject} onClose={() => setMail(null)}><div className="faint">To: {mail.to} · {fmtDateTime(mail.ts)} · {mail.status}</div><pre className="mt">{mail.body}</pre></Modal>}
      {tpl && <TemplateModal t={tpl} onClose={() => setTpl(null)} />}
    </div>
  );
}

function TemplateModal({ t, onClose }) {
  const { act } = useStore();
  const [v, setV] = useState({ subject: t.subject, body: t.body });
  return (
    <Modal title={`Template: ${t.name}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { act('TEMPLATE_UPDATE', { templateId: t.id, patch: v }); onClose(); }}>Save</Button></>}>
      <Field label="Subject"><input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
      <Field label="Body" style={{ marginTop: 10 }}><textarea style={{ minHeight: 160 }} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
    </Modal>
  );
}
