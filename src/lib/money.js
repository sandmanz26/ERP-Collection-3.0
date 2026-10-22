export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'IDR', 'SGD', 'AUD'];

/** opts.whole drops cents (KPI tiles, summaries); line items and invoices keep cents. */
export function fmtMoney(amount, currency = 'USD', opts = {}) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: opts.whole ? 0 : 2, minimumFractionDigits: opts.whole ? 0 : undefined }).format(n);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sum(arr, fn = (x) => x) {
  return round2(arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0));
}

export function pct(n, d) {
  if (!d) return 0;
  return round2((n / d) * 100);
}

/** Convert amount in `from` currency to `to` using rates relative to USD. */
export function convert(amount, from, to, ratesToUSD) {
  if (from === to) return round2(amount);
  const usd = amount * (ratesToUSD[from] ?? 1);
  return round2(usd / (ratesToUSD[to] ?? 1));
}
