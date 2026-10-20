import React, { useState } from 'react';
import { Badge } from '../atoms/Badge.jsx';
import { Icon } from '../atoms/Icon.jsx';
import { stageLabel } from '../../lib/lifecycle.js';
import { useDialog } from '../organisms/Dialogs.jsx';

/** Molecule: label + control + optional hint/error. */
export function Field({ label, hint, error, children, style }) {
  return (
    <label className="field" style={style}>
      <span>{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </label>
  );
}

/** Molecule: input that only commits on blur/Enter so the audit log is not flooded per keystroke. */
export function CommitInput({ value, onCommit, type = 'text', className = '', disabled, style, placeholder }) {
  const [v, setV] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const commit = () => {
    setFocused(false);
    const out = type === 'number' ? Number(v) : v;
    if (String(out) !== String(value ?? '')) onCommit(out);
  };
  return (
    <input className={className} type={type} value={focused ? v : value ?? ''} disabled={disabled} style={style} placeholder={placeholder}
      onFocus={() => { setV(value ?? ''); setFocused(true); }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

const STAGE_TONES = {
  lead: '', qualified: 'info', proposal_sent: 'info', negotiation: 'warn', booked: 'brand', planning: 'brand', details_locked: 'brand',
  pre_event: 'warn', event_day: 'danger', post_event: 'ok', financial_close: 'ok', archived: '', lost: 'danger', cancelled_client: 'danger', cancelled_eo: 'danger',
};
export function StageBadge({ stage }) {
  return <Badge tone={STAGE_TONES[stage]}>{stageLabel(stage)}</Badge>;
}

const STATUS_TONES = {
  paid: 'ok', confirmed: 'ok', done: 'ok', approved: 'ok', signed: 'ok', accepted: 'ok', active: 'info', locked: 'ok', final: 'ok', converted: 'ok', yes: 'ok', returned: 'ok', reserved: 'info',
  sent: 'info', invoiced: 'info', in_progress: 'info', shared: 'info', partially_signed: 'warn', partial: 'warn', scheduled: '', draft: '', todo: '', pending: 'warn',
  overdue: 'danger', rejected: 'danger', cancelled: 'danger', void: '', expired: 'danger', delayed: 'danger', blocked: 'danger', hold: 'warn', requested: 'warn', superseded: '', released: '', no: 'danger', quoted: 'info', declined: 'danger',
};
export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] ?? ''}>{String(status ?? '—').replace(/_/g, ' ')}</Badge>;
}

/** Molecule: KPI tile. */
export function StatTile({ label, value, sub, tone }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--color-${{ ok: 'success', warn: 'warning' }[tone] ?? tone})` } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children }) {
  return <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)} role="tab" aria-selected={value === t.id}>
          {t.label}
          {t.count ? <span className="badge" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function PillSelect({ options, value, onChange, multi }) {
  return (
    <div className="pill-select" role="group">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id;
        const label = typeof o === 'string' ? o : o.label;
        const on = multi ? value.includes(id) : value === id;
        return (
          <button type="button" key={id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onChange(multi ? (on ? value.filter((x) => x !== id) : [...value, id]) : id)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue({ rows }) {
  return (
    <div className="kv">
      {rows.filter(Boolean).map(([k, v], i) => (
        <React.Fragment key={i}><div>{k}</div><div>{v ?? '—'}</div></React.Fragment>
      ))}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return <span className="search"><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></span>;
}

/** Molecule: button that asks for confirmation through the design-system dialog (never window.confirm). */
export function ConfirmButton({ onConfirm, children, variant = 'secondary', size, message = 'Are you sure?', title = 'Please confirm', disabled, className = '' }) {
  const dialog = useDialog();
  const VAR = { secondary: '', primary: 'primary', danger: 'danger', 'danger-solid': 'danger solid', success: 'ok', ghost: 'ghost' };
  return (
    <button type="button" className={`btn ${VAR[variant] ?? ''} ${size === 'sm' ? 'sm' : ''} ${className}`} disabled={disabled}
      onClick={async () => (await dialog.confirm({ title, message, danger: variant.startsWith('danger') })) && onConfirm()}>
      {children}
    </button>
  );
}

export function Toast({ kind = 'ok', children }) {
  return <div className={`toast ${kind}`} role="status"><Icon name={kind === 'err' ? 'alert' : 'check'} size={15} /> <span>{children}</span></div>;
}

/**
 * Molecule: attention list — scannable rows with a severity stripe + icon instead of a wall of filled alerts.
 * items: [{ tone: 'danger'|'warning'|'info'|'success', icon, node }]
 */
export function AttentionList({ items, empty = 'Nothing needs your attention right now.', max = 12 }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  const shown = all ? items : items.slice(0, max);
  return (
    <div>
      <ul className="attention">
        {shown.map((a, i) => (
          <li key={i} className={`attention-row sev-${a.tone}`}>
            <span className="attention-icon"><Icon name={a.icon ?? 'info'} size={15} /></span>
            <span className="attention-text">{a.node}</span>
          </li>
        ))}
      </ul>
      {items.length > max && <button className="btn ghost sm mt" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  );
}
