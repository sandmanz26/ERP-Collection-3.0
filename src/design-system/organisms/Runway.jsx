import React, { useLayoutEffect, useRef, useState } from 'react';
import { addDays, diffDays, fmtDate } from '../../lib/dates.js';

/**
 * Organism: Runway — the next N days as one line, with every event placed at its date.
 * The product's signature element: an agency's calendar read as distance ("T-33"), not as a grid.
 * items: [{ id, date, label, kind: 'booked' | 'hold', alert?: boolean, onClick }]
 * Labels are stacked into lanes so they never overlap; month starts are the only ticks.
 */
export function Runway({ items, today, days = 120, ariaLabel = 'Upcoming events' }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const end = addDays(today, days);
  const x = (d) => Math.min(1, Math.max(0, diffDays(today, d) / days));
  const shown = items.filter((i) => i.date >= today && i.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  // greedy lanes: a label goes in the first lane where it clears the previous label by 12px
  const lanesEnd = [];
  const placed = shown.map((it) => {
    const px = x(it.date) * width;
    const w = Math.max(it.label.length, 8) * 7.2 + 44;
    const left = Math.min(px, width - w);
    let lane = lanesEnd.findIndex((e) => left > e + 12);
    if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(0); }
    lanesEnd[lane] = left + w;
    return { ...it, px, left, lane, t: diffDays(today, it.date) };
  });
  const lanes = Math.max(1, lanesEnd.length);
  const months = [];
  for (let d = today.slice(0, 8) + '01'; d <= end; d = addDays(d, 32).slice(0, 8) + '01') if (diffDays(today, d) > 9) months.push(d); // no tick crowding the Today label
  const LANE = 40;
  return (
    <div className="runway" ref={ref} role="list" aria-label={ariaLabel} style={{ height: 36 + lanes * LANE }}>
      <div className="runway-axis" />
      <div className="runway-today" style={{ left: 0 }}><span>Today</span></div>
      {months.map((m) => <div key={m} className="runway-month" style={{ left: x(m) * width }}><span>{fmtDate(m, { month: 'short', day: undefined, year: undefined })}</span></div>)}
      {placed.map((p) => (
        <button key={p.id} type="button" role="listitem" className={`runway-item ${p.kind} ${p.alert ? 'is-alert' : ''}`} onClick={p.onClick} style={{ '--x': `${p.px}px`, '--left': `${p.left}px`, '--lane': p.lane }}
          aria-label={`${p.label}, ${fmtDate(p.date)}, in ${p.t} days${p.kind === 'hold' ? ', date on hold' : ''}${p.alert ? ', needs attention' : ''}`}>
          <span className="runway-dot" />
          <span className="runway-stem" />
          <span className="runway-label"><b>{p.label}</b><span>T‑{p.t} · {fmtDate(p.date, { year: undefined })}</span></span>
        </button>
      ))}
      {!placed.length && <div className="runway-empty">No events in the next {days} days.</div>}
    </div>
  );
}
