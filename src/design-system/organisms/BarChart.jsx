import React from 'react';

/**
 * Organism: horizontal bar chart (single series, brand hue, magnitude job). Each row has a native tooltip;
 * values are always printed as text so identity never relies on color.
 */
export function BarChart({ rows, max, format = (x) => x, color = 'var(--color-brand)', label }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {rows.map((r) => (
        <div className="bar-row" key={r.label} title={`${r.label}: ${r.display ?? format(r.value)}`}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
          <div className="bar"><div style={{ width: `${(Math.max(0, r.value) / m) * 100}%`, background: color }} /></div>
          <div className="num-tabular" style={{ textAlign: 'right' }}>{r.display ?? format(r.value)}</div>
        </div>
      ))}
      {rows.length === 0 && <div className="empty">No data</div>}
    </div>
  );
}
