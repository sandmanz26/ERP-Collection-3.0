// Small UI pieces for the growth bets (lib/growth.js): health score, WhatsApp, vendor badges.
import React from 'react';
import { useStore } from '../store/AppStore.jsx';
import { Icon } from '../design-system/index.js';
import { eventHealth, whatsappLink, vendorBadges } from '../lib/growth.js';

/** "Health 72" with the reasons on hover; nothing for events that are not booked yet. */
export function HealthBadge({ ev, compact }) {
  const { state, today } = useStore();
  const h = eventHealth(state, ev, today);
  if (!h) return compact ? <span className="faint">—</span> : null;
  const why = h.drivers.length ? `Points lost for:\n• ${h.drivers.slice(0, 5).join('\n• ')}` : 'Nothing open on this event.';
  return (
    <span className={`health health-${h.tone}`} title={why} aria-label={`Event health ${h.score} of 100, ${h.label}`}>
      <b className="num-tabular">{h.score}</b>{!compact && <span>{h.label}</span>}
    </span>
  );
}

/** Opens WhatsApp with the message filled in. Disabled (with the reason) when there is no number. */
export function WhatsAppButton({ phone, text, label = 'WhatsApp', onSent }) {
  const href = whatsappLink(phone, text);
  if (!href) return <span className="btn sm ghost" aria-disabled="true" title="No phone number on file">{label}</span>;
  return <a className="btn sm" href={href} target="_blank" rel="noreferrer" onClick={onSent}><Icon name="phone" size={13} /> {label}</a>;
}

export function VendorBadges({ v }) {
  const { state, today } = useStore();
  const badges = vendorBadges(state, v, today);
  if (!badges.length) return null;
  return <span className="vbadges">{badges.map((b) => <span key={b.id} className={`vbadge ${b.negative ? 'neg' : ''}`} title={b.why}>{b.label}</span>)}</span>;
}
