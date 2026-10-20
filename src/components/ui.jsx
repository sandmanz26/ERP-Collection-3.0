import React, { useState } from 'react';
import { fmtMoney } from '../lib/money.js';
import { stageLabel } from '../lib/lifecycle.js';

export function Card({ title, actions, children, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ tone = '', children, title }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>;
}

const STAGE_TONES = {
  lead: '', qualified: 'info', proposal_sent: 'info', negotiation: 'warn', booked: 'brand', planning: 'brand', details_locked: 'brand',
  pre_event: 'warn', event_day: 'danger', post_event: 'ok', financial_close: 'ok', archived: '', lost: 'danger', cancelled_client: 'danger', cancelled_eo: 'danger',
};
export function StageBadge({ stage }) {
  return <Badge tone={STAGE_TONES[stage]}>{stageLabel(stage)}</Badge>;
}

const STATUS_TONES = {
  paid: 'ok', confirmed: 'ok', done: 'ok', approved: 'ok', signed: 'ok', accepted: 'ok', active: 'info', locked: 'ok', final: 'ok', converted: 'ok', yes: 'ok',
  sent: 'info', invoiced: 'info', in_progress: 'info', shared: 'info', partially_signed: 'warn', partial: 'warn', scheduled: '', draft: '', todo: '', pending: 'warn',
  overdue: 'danger', rejected: 'danger', cancelled: 'danger', void: '', expired: 'danger', delayed: 'danger', blocked: 'danger', hold: 'warn', requested: 'warn', superseded: '', released: '', no: 'danger',
};
export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] ?? ''}>{String(status ?? '—').replace(/_/g, ' ')}</Badge>;
}

export function Money({ value, currency = 'USD', className = '' }) {
  const neg = Number(value) < 0;
  return <span className={className} style={neg ? { color: 'var(--danger)' } : undefined}>{fmtMoney(value, currency)}</span>;
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)} role="tab">
          {t.label}
          {t.count ? <span className="badge" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, style }) {
  return (
    <label className="field" style={style}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Progress({ value, tone }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return <div className={`progress ${tone || ''}`}><div style={{ width: `${v}%` }} /></div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Alert({ tone = 'info', children }) {
  return <div className={`alert ${tone}`}>{children}</div>;
}

/** Small controlled form helper. */
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k, type) => ({
    value: v[k] ?? '',
    checked: type === 'checkbox' ? !!v[k] : undefined,
    onChange: (e) => setV((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value })),
  });
  return [v, setV, bind];
}

export function ConfirmButton({ onConfirm, children, className = 'btn', message = 'Are you sure?', disabled }) {
  return (
    <button className={className} disabled={disabled} onClick={() => window.confirm(message) && onConfirm()}>
      {children}
    </button>
  );
}

export function Kv({ rows }) {
  return (
    <div className="kv">
      {rows.filter(Boolean).map(([k, v], i) => (
        <React.Fragment key={i}>
          <div>{k}</div>
          <div>{v ?? '—'}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function PillSelect({ options, value, onChange, multi }) {
  return (
    <div className="pill-select">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id;
        const label = typeof o === 'string' ? o : o.label;
        const on = multi ? value.includes(id) : value === id;
        return (
          <button type="button" key={id} className={on ? 'on' : ''} onClick={() => onChange(multi ? (on ? value.filter((x) => x !== id) : [...value, id]) : id)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function BarChart({ rows, max, format = (x) => x, colors = ['var(--brand)'] }) {
  const m = max ?? Math.max(1, ...rows.map((r) => (Array.isArray(r.value) ? r.value.reduce((a, b) => a + b, 0) : r.value)));
  return (
    <div className="bar-chart">
      {rows.map((r) => {
        const vals = Array.isArray(r.value) ? r.value : [r.value];
        const total = vals.reduce((a, b) => a + b, 0);
        return (
          <div className="bar-row" key={r.label}>
            <div title={r.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
            <div className="bar">
              {vals.map((v, i) => <div key={i} style={{ width: `${(Math.max(0, v) / m) * 100}%`, background: colors[i % colors.length] }} title={format(v)} />)}
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.display ?? format(total)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Input that only commits (dispatches an action) on blur/Enter, so the audit log isn't flooded per keystroke. */
export function CommitInput({ value, onCommit, type = 'text', className = '', disabled, style, placeholder }) {
  const [v, setV] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const shown = focused ? v : value ?? '';
  const commit = () => {
    setFocused(false);
    const out = type === 'number' ? Number(v) : v;
    if (String(out) !== String(value ?? '')) onCommit(out);
  };
  return (
    <input
      className={className}
      type={type}
      value={shown}
      disabled={disabled}
      style={style}
      placeholder={placeholder}
      onFocus={() => { setV(value ?? ''); setFocused(true); }}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
