// Sell-rate calculation from each forwarder's margin rules.

const roundUp = (n, step) => (step ? Math.ceil(n / step) * step : Math.round(n * 100) / 100);
const inList = (list, v) => !list || list.length === 0 || list.includes(v);

/** First active rule (lowest priority number) whose conditions match the shipment context. */
export function findMarginRule(rules, ctx) {
  return [...(rules || [])]
    .filter((r) => r.active !== false)
    .sort((a, b) => a.priority - b.priority)
    .find((r) =>
      inList(r.match?.modes, ctx.mode) &&
      inList(r.match?.customerTiers, ctx.customerTier) &&
      inList(r.match?.originCountries, ctx.originCountry) &&
      inList(r.match?.destCountries, ctx.destCountry) &&
      (r.match?.minBuy == null || ctx.buyTotal >= r.match.minBuy));
}

/**
 * Apply a margin rule to buy lines.
 * - markupPct on every line (or a per-charge-code override)
 * - fixed fees added as sell-only lines
 * - minimum profit enforced by topping up the main freight line
 * - every sell value rounded up to `roundTo`
 */
export function applyMargin(buyLines, rule, ctx = {}) {
  const r = rule || { id: null, name: 'No rule (cost + 0%)', markupPct: 0, minProfit: 0, roundTo: 0, fixedFees: [], overrides: {} };
  const lines = buyLines.map((l) => {
    const pct = r.overrides?.[l.code] ?? r.markupPct;
    return { ...l, markupPct: pct, sell: roundUp(l.buy * (1 + pct / 100), r.roundTo) };
  });
  for (const fee of r.fixedFees || []) lines.push({ code: fee.code, desc: fee.desc, buy: 0, sell: fee.amount, markupPct: null, fixedFee: true });

  const buyTotal = sum(lines, 'buy');
  let sellTotal = sum(lines, 'sell');
  let toppedUp = 0;
  if (r.minProfit && sellTotal - buyTotal < r.minProfit) {
    toppedUp = roundUp(r.minProfit - (sellTotal - buyTotal), r.roundTo);
    const main = lines.find((l) => ['FRT', 'AFR', 'RFR'].includes(l.code)) || lines[0];
    if (main) main.sell = Math.round((main.sell + toppedUp) * 100) / 100;
    sellTotal = sum(lines, 'sell');
  }
  return { lines, ...totals(lines), ruleId: r.id, ruleName: r.name, toppedUp, context: ctx };
}

export function totals(lines) {
  const buyTotal = sum(lines, 'buy');
  const sellTotal = sum(lines, 'sell');
  const profit = Math.round((sellTotal - buyTotal) * 100) / 100;
  const marginPct = sellTotal ? Math.round((profit / sellTotal) * 1000) / 10 : 0;
  return { buyTotal, sellTotal, profit, marginPct };
}

export const sum = (arr, key) => Math.round(arr.reduce((a, x) => a + (Number(key ? x[key] : x) || 0), 0) * 100) / 100;

/** Rank carrier replies: cheapest, fastest and a weighted "best value" score. */
export function compareRates(replies) {
  const valid = replies.filter((r) => r.reply && r.status === 'replied');
  if (!valid.length) return { rows: [], cheapestId: null, fastestId: null, bestId: null };
  const minTotal = Math.min(...valid.map((r) => r.reply.total));
  const minTransit = Math.min(...valid.map((r) => r.reply.transitDays));
  const rows = valid.map((r) => {
    const priceScore = minTotal / r.reply.total;
    const speedScore = minTransit / r.reply.transitDays;
    const reliability = (r.partnerRating || 3) / 5;
    const score = Math.round((priceScore * 0.6 + speedScore * 0.25 + reliability * 0.15) * 100);
    return { ...r, score, deltaPct: Math.round(((r.reply.total - minTotal) / minTotal) * 1000) / 10 };
  });
  const by = (fn) => rows.reduce((a, b) => (fn(b) < fn(a) ? b : a)).id;
  return {
    rows,
    cheapestId: by((r) => r.reply.total),
    fastestId: by((r) => r.reply.transitDays),
    bestId: rows.reduce((a, b) => (b.score > a.score ? b : a)).id,
  };
}
