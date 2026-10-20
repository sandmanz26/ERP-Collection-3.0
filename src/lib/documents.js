// HTML builders for printable documents. Pure functions: (state, event, …) → HTML string.
import { fmtMoney } from './money.js';
import { fmtDate } from './dates.js';
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { clientOf, invoiceBalance, proposalTotals } from './derived.js';

function header(state, title, right) {
  const c = state.settings.company;
  return `<div class="head"><div><h1>${e(c.name)}</h1><div class="muted">${e(c.address)}</div></div><div style="text-align:right"><h1>${e(title)}</h1>${right}</div></div>`;
}

export function invoiceHtml(state, ev, inv) {
  const client = clientOf(state, ev);
  const payer = ev.payers.find((p) => p.id === inv.payerId);
  const paid = ev.payments.filter((p) => p.invoiceId === inv.id);
  const bal = invoiceBalance(ev, inv);
  const m = (n) => fmtMoney(n, inv.currency);
  return `${header(state, 'INVOICE', `<div><b>${e(inv.number)}</b></div><div class="muted">Issued ${fmtDate(inv.issuedAt)} · Due ${fmtDate(inv.dueDate)}</div>`)}
    <h2>Bill to</h2><div>${e(payer?.name ?? client?.name)}<br>${e(client?.billingAddress ?? client?.email ?? '')}${client?.vatId ? `<br>VAT ID ${e(client.vatId)}` : ''}${ev.poNumber ? `<br>PO ${e(ev.poNumber)}` : ''}</div>
    <h2>Event</h2><div>${e(ev.name)} — ${fmtDate(ev.date)}</div>
    <table><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>
      <tr><td>${e(inv.label)}</td><td class="num">${m(inv.amount)}</td></tr>
      ${inv.lateFeeApplied ? `<tr><td>Late fee per contract</td><td class="num">${m(inv.lateFeeApplied)}</td></tr>` : ''}
      ${paid.map((p) => `<tr><td>Payment received ${fmtDate(p.at.slice(0, 10))} (${e(p.method.toUpperCase())}, ${e(p.ref)})</td><td class="num">−${m(p.amount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Balance due</td><td class="num">${m(bal)}</td></tr></tfoot></table>
    ${inv.currency !== 'USD' ? `<p class="muted">Exchange rate locked at issue: 1 ${inv.currency} = ${inv.fxRateToUSD} USD.</p>` : ''}
    <p class="muted">Pay online in your client portal (card, ${inv.currency === 'USD' ? 'ACH' : 'SEPA'}). Installment amounts include applicable taxes as itemized in the signed agreement.</p>`;
}

export function proposalHtml(state, ev, v) {
  const t = proposalTotals(state, ev, v);
  const m = (n) => fmtMoney(n, v.currency);
  const client = clientOf(state, ev);
  return `${header(state, 'PROPOSAL', `<div><b>v${v.version}</b></div><div class="muted">Valid until ${fmtDate(v.validUntil)}</div>`)}
    <h2>Prepared for</h2><div>${e(client?.name)} — ${e(ev.name)}, ${fmtDate(ev.date)}, ${v.guestCount} guests</div>
    <table><thead><tr><th>Item</th><th>Qty</th><th class="num">Amount</th></tr></thead><tbody>
      ${t.lines.filter((l) => l.active).map((l) => `<tr><td>${e(l.name)}</td><td>${l.pricing === 'per_guest' ? `${l.qtyEff} guests` : l.pricing === 'percentage' ? `${l.pct}%` : l.qty}</td><td class="num">${m(l.amount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Subtotal</td><td class="num">${m(t.subtotal)}</td></tr><tr><td colspan="2">${e(t.tax.label)}</td><td class="num">${m(t.tax.taxAmount)}</td></tr><tr><td colspan="2">Total</td><td class="num">${m(t.total)}</td></tr></tfoot></table>
    ${t.tax.note ? `<p class="muted">${e(t.tax.note)}</p>` : ''}
    ${t.lines.some((l) => l.optional && !l.selected) ? `<h2>Optional extras</h2><ul>${t.lines.filter((l) => l.optional && !l.selected).map((l) => `<li>${e(l.name)} — ${m(l.amount)}</li>`).join('')}</ul>` : ''}`;
}

export function badgesHtml(state, ev, qrMap) {
  const guests = ev.households.flatMap((h) => h.guests.map((g) => ({ g, h })));
  return `<h1>${e(ev.name)} — badges</h1><div class="badges">${guests.map(({ g, h }) => `<div class="badge"><div style="font-size:16px;font-weight:700">${e(g.name)}</div><div class="muted">${e(h.company ?? h.category)}</div>${qrMap[h.code] ? `<img src="${qrMap[h.code]}" width="90" height="90" alt="QR">` : ''}<div class="muted">${e(h.code)}</div></div>`).join('')}</div>`;
}
