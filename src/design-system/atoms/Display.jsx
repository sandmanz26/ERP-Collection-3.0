import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { fmtMoney } from '../../lib/money.js';

/** Atom: formatted currency amount (negative = danger color). */
export function Money({ value, currency = 'USD', className = '' }) {
  const neg = Number(value) < 0;
  return <span className={`num-tabular ${neg ? 'text-danger' : ''} ${className}`.trim()}>{fmtMoney(value, currency)}</span>;
}

/** Atom: color swatch. */
export function Swatch({ color, size = 26, title, onClick }) {
  return <span className="swatch" title={title ?? color} onClick={onClick} style={{ background: color, width: size, height: size, cursor: onClick ? 'pointer' : undefined }} />;
}

/** Atom: horizontal progress bar (0-100). */
export function ProgressBar({ value, tone }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return <div className={`progress ${tone || ''}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${v}%` }} /></div>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="loading" />;
}

export function Avatar({ name = '?' }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className="avatar" title={name}>{initials}</span>;
}

/** Atom: QR code image rendered client-side (used for RSVP codes, badges, check-in). */
export function QrCode({ value, size = 96 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(String(value), { margin: 1, width: size }).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [value, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={`QR ${value}`} /> : <span className="spinner" />;
}
