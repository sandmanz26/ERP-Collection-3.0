import React from 'react';
import { useStore } from '../store/AppStore.jsx';
import { availability } from '../lib/availability.js';
import { fmtDate } from '../lib/dates.js';
import { Alert } from './ui.jsx';

/** Live availability check for a date based on team capacity, booked events and existing holds. */
export function AvailabilityCheck({ date, excludeEventId }) {
  const { state } = useStore();
  if (!date) return null;
  const av = availability(date, { events: state.events.filter((e) => e.id !== excludeEventId), holds: state.holds.filter((h) => h.eventId !== excludeEventId), capacity: state.settings.capacity });
  const tone = av.status === 'available' ? 'success' : av.status === 'held' ? 'warning' : 'danger';
  return (
    <Alert tone={tone}>
      <div>
        <b>{fmtDate(date, { weekday: 'short' })}</b>: capacity {av.capacity} · booked {av.booked.length} · active holds {av.holds.length}
        {av.status === 'available' && ' — AVAILABLE'}
        {av.status === 'held' && ` — slots are held by others; a new hold would be #${av.holds.length + 1} (waitlist)`}
        {av.status === 'full' && ' — FULL, no capacity'}
        {av.holds.length > 0 && (
          <div className="faint" style={{ marginTop: 4 }}>
            {av.holds.map((h) => `#${h.priority} ${state.events.find((e) => e.id === h.eventId)?.name} (exp. ${fmtDate(h.expiresAt)})`).join(' · ')}
          </div>
        )}
      </div>
    </Alert>
  );
}
