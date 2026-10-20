import React from 'react';

/** Atom: Badge. tone = neutral | brand | ok | warn | danger | info (aliases success/warning). */
export function Badge({ tone = '', children, title, className = '' }) {
  return <span className={`badge ${tone} ${className}`.trim()} title={title}>{children}</span>;
}
