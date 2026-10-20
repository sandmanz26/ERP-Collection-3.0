import React from 'react';

/** Atoms: native form controls styled by tokens. Thin wrappers so pages never hand-roll control styling. */
export const Input = React.forwardRef(function Input({ invalid, className = '', ...rest }, ref) {
  return <input ref={ref} className={`${className} ${invalid ? 'invalid' : ''}`.trim()} {...rest} />;
});
export function Select({ options, invalid, className = '', children, ...rest }) {
  return (
    <select className={`${className} ${invalid ? 'invalid' : ''}`.trim()} {...rest}>
      {children ?? options?.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Textarea({ invalid, className = '', ...rest }) {
  return <textarea className={`${className} ${invalid ? 'invalid' : ''}`.trim()} {...rest} />;
}
export function Checkbox({ label, ...rest }) {
  return <label className="row"><input type="checkbox" {...rest} />{label}</label>;
}
