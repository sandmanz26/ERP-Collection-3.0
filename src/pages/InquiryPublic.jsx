import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Field, Button, Alert, PublicTemplate, useForm } from '../design-system/index.js';

/**
 * Public website inquiry form (no login). In production this would be an embeddable form / webhook;
 * here it dispatches LEAD_CREATE with source "Website form" (or ?source=… for marketplaces).
 */
export default function InquiryPublic() {
  const { state, act } = useStore();
  const [sp] = useSearchParams();
  const source = sp.get('source') || 'Website form';
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [v, , bind] = useForm({ clientName: '', email: '', phone: '', eventTypeId: state.settings.eventTypes[0]?.id, date: '', guestCount: '', budget: '', venue: '', message: '' });
  const missing = !v.clientName || !v.email || !v.date;
  const submit = () => {
    setTouched(true);
    if (missing) return;
    const et = state.settings.eventTypes.find((t) => t.id === v.eventTypeId);
    act('LEAD_CREATE', { ...v, name: `${v.clientName.split(' ').slice(-1)[0]} ${et.name}`, source, clientType: et.segment === 'corporate' ? 'company' : 'individual' }, { system: true });
    setSent(true);
  };
  return (
    <PublicTemplate>
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-serif)' }}>
        <div className="faint">{state.settings.company.name}</div>
        <h1 style={{ fontSize: 30 }}>Tell us about your event</h1>
        <div className="muted">We reply within one business day.</div>
      </div>
      <Card className="mt">
        {sent ? <Alert tone="success">Thank you! Your inquiry was received — a planner will contact you shortly.</Alert> : (
          <>
            <div className="grid g2">
              <Field label="Your name *" error={touched && !v.clientName ? 'Required' : null}><input {...bind('clientName')} /></Field>
              <Field label="Email *" error={touched && !v.email ? 'Required' : null}><input type="email" {...bind('email')} /></Field>
              <Field label="Phone"><input {...bind('phone')} /></Field>
              <Field label="Event type"><select {...bind('eventTypeId')}>{state.settings.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Preferred date *" error={touched && !v.date ? 'Required' : null}><input type="date" {...bind('date')} /></Field>
              <Field label="Estimated guests"><input type="number" {...bind('guestCount')} /></Field>
              <Field label={`Budget (${state.settings.company.baseCurrency ?? 'USD'})`}><input type="number" {...bind('budget')} /></Field>
              <Field label="Location / venue"><input {...bind('venue')} /></Field>
            </div>
            <Field label="Anything else?" style={{ marginTop: 10 }}><textarea {...bind('message')} /></Field>
            <Button variant="primary" className="mt" onClick={submit}>Send inquiry</Button>
          </>
        )}
      </Card>
      <div className="faint mt" style={{ textAlign: 'center', fontSize: 12 }}>Source tracked as “{source}” · <a href="#/">back to app</a></div>
    </PublicTemplate>
  );
}
