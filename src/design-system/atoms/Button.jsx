import React from 'react';

const VARIANT_CLASS = { secondary: '', primary: 'primary', danger: 'danger', 'danger-solid': 'danger solid', success: 'ok', ghost: 'ghost' };

/** Atom: Button. variant = secondary | primary | danger | danger-solid | success | ghost; size = md | sm. */
export function Button({ variant = 'secondary', size = 'md', loading = false, className = '', children, type = 'button', disabled, ...rest }) {
  const cls = ['btn', VARIANT_CLASS[variant] ?? '', size === 'sm' ? 'sm' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}
