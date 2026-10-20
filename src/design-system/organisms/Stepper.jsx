import React from 'react';
import { Icon } from '../atoms/Icon.jsx';

/**
 * Organism: Stepper — a lifecycle that reads as progress, not as tabs.
 * steps: [{ id, label, status: 'done'|'current'|'todo'|'exit', date? }]. Clicking a step selects it
 * (the page shows that stage's details); the selected step is outlined.
 */
export function Stepper({ steps, selectedId, onSelect, formatDate = (d) => d }) {
  return (
    <ol className="stepper" aria-label="Lifecycle">
      {steps.map((s, i) => (
        <li key={s.id} className={`step ${s.status} ${selectedId === s.id ? 'selected' : ''}`}>
          {i > 0 && <span className="step-line" aria-hidden />}
          <button type="button" className="step-btn" onClick={() => onSelect?.(s.id)} aria-current={s.status === 'current' ? 'step' : undefined} aria-pressed={selectedId === s.id}>
            <span className="step-dot">{s.status === 'done' ? <Icon name="check" size={12} strokeWidth={2.5} /> : s.status === 'exit' ? <Icon name="x" size={12} strokeWidth={2.5} /> : i + 1}</span>
            <span className="step-label">{s.label}</span>
            <span className="step-date">{s.date ? formatDate(s.date) : s.status === 'current' ? 'now' : ''}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
