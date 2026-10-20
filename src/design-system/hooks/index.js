import { useState } from 'react';

/** Small controlled-form helper. bind(key) spreads value/onChange (and checked for checkboxes). */
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k, type) => ({
    value: v[k] ?? '',
    checked: type === 'checkbox' ? !!v[k] : undefined,
    onChange: (e) => setV((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value })),
  });
  return [v, setV, bind];
}

export function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
