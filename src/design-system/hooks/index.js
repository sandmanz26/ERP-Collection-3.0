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

/** Opens a print-ready document (invoice, proposal, badges) in a new window using document typography tokens. */
export function printDocument(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Inter,system-ui,sans-serif;color:#1f2328;margin:40px;font-size:13px}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:10px} th,td{padding:6px 8px;border-bottom:1px solid #e6e2dc;text-align:left}
    td.num,th.num{text-align:right} tfoot td{font-weight:700;border-top:2px solid #1f2328}
    .muted{color:#57606a} .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6d4aff;padding-bottom:12px}
    .badges{display:grid;grid-template-columns:repeat(3,1fr);gap:12px} .badge{border:1px dashed #999;border-radius:10px;padding:14px;text-align:center}
    @media print{button{display:none}}
  </style></head><body>${bodyHtml}<p><button onclick="window.print()">Print / Save as PDF</button></p></body></html>`);
  w.document.close();
  return true;
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
