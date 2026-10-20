import React from 'react';

/**
 * Organism: staffing coverage — required vs confirmed headcount per time slot.
 * Filled = brand (magnitude); gap = reserved danger status color, always labelled (never color alone).
 */
export function CoverageChart({ slots, formatT, height = 120 }) {
  if (!slots.length) return <div className="empty">No staffing plan yet</div>;
  const max = Math.max(1, ...slots.map((s) => s.required));
  const gaps = slots.filter((s) => s.gap > 0);
  const worst = gaps.sort((a, b) => b.gap - a.gap)[0];
  return (
    <div className="coverage">
      <div className="coverage-plot" style={{ height }} role="img" aria-label={`Staff coverage. ${worst ? `Largest gap ${worst.gap} people at ${formatT(worst.t)}` : 'Fully covered'}`}>
        {slots.map((s) => (
          <div key={s.t} className="coverage-col" title={`${formatT(s.t)} — required ${s.required}, confirmed ${s.filled}${s.gap > 0 ? `, GAP ${s.gap}` : ''}`}>
            <div className="coverage-req" style={{ height: `${(s.required / max) * 100}%` }}>
              {s.gap > 0 && <div className="coverage-gap" style={{ height: `${(s.gap / Math.max(1, s.required)) * 100}%` }} />}
              <div className="coverage-fill" style={{ height: `${(s.filled / Math.max(1, s.required)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="coverage-axis">
        {slots.filter((s, i) => i % Math.max(1, Math.round(slots.length / 10)) === 0).map((s) => <span key={s.t} style={{ left: `${(slots.indexOf(s) / slots.length) * 100}%` }}>{formatT(s.t)}</span>)}
      </div>
      <div className="legend mt">
        <span><i style={{ background: 'var(--color-brand)' }} />Confirmed</span>
        <span><i style={{ background: 'var(--color-danger)' }} />Gap (unfilled)</span>
        <span><i style={{ border: '1px solid var(--color-ink-3)', background: 'transparent' }} />Required</span>
        <span className="muted">Peak requirement: {max} people{worst ? ` · largest gap ${worst.gap} at ${formatT(worst.t)}` : ' · fully covered'}</span>
      </div>
    </div>
  );
}
