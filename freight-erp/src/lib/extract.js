// Heuristic RFQ extractor. It stands in for the LLM extraction service: it turns free text
// (email, WhatsApp, PDF text layer, Excel rows) into the standard shipment format and returns
// a confidence + evidence snippet per field, so the UI can drive human-in-the-loop review.
import { PORTS, COMMODITIES, INCOTERMS } from './reference.js';

export const REQUIRED_FIELDS = ['origin', 'destination', 'commodity', 'weightKg', 'incoterm', 'cargoReadyDate'];
export const FIELD_LABELS = {
  mode: 'Transport mode',
  origin: 'Origin',
  destination: 'Destination',
  commodity: 'Commodity',
  weightKg: 'Gross weight (kg)',
  volumeCbm: 'Volume (cbm)',
  packages: 'Packages',
  containerType: 'Container type',
  containerCount: 'Container count',
  incoterm: 'Incoterms',
  cargoReadyDate: 'Cargo-ready date',
  hazardous: 'Dangerous goods',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ORIGIN_HINT = /(origin|pol|from|port of loading|pickup|pick up|loading)\s*[:\-]?\s*$/i;
const DEST_HINT = /(destination|pod|to|port of discharge|deliver(?:y)? to|dest)\s*[:\-]?\s*$|(→|->|–|-)\s*$/i;

const field = (value, confidence, evidence = '') => ({ value, confidence: value == null ? 0 : round2(confidence), evidence });
const round2 = (n) => Math.round(n * 100) / 100;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const snippet = (text, index, len) => text.slice(Math.max(0, index - 12), Math.min(text.length, index + len + 12)).replace(/\s+/g, ' ').trim();

function findPorts(text) {
  const hits = [];
  for (const port of PORTS) {
    const names = [port.code.toLowerCase(), ...port.aliases];
    for (const name of names) {
      const re = new RegExp(`\\b${escapeRe(name)}\\b`, 'gi');
      let m;
      while ((m = re.exec(text))) hits.push({ code: port.code, index: m.index, len: m[0].length, exact: name === port.code.toLowerCase() || name === port.aliases[0] });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set();
  return hits.filter((h) => (seen.has(h.code) ? false : (seen.add(h.code), true)));
}

function extractPorts(text) {
  const hits = findPorts(text);
  let origin = null;
  let destination = null;
  for (const h of hits) {
    const before = text.slice(Math.max(0, h.index - 30), h.index);
    if (!origin && ORIGIN_HINT.test(before)) origin = { ...h, labelled: true };
    else if (!destination && DEST_HINT.test(before)) destination = { ...h, labelled: true };
  }
  const rest = hits.filter((h) => h.code !== origin?.code && h.code !== destination?.code);
  if (!origin && rest.length) origin = { ...rest.shift(), labelled: false };
  if (!destination && rest.length) destination = { ...rest.shift(), labelled: false };
  // "Jakarta to Los Angeles": an unlabelled origin directly before a labelled destination is a strong pattern.
  if (origin && destination && !origin.labelled && destination.labelled && origin.index < destination.index && destination.index - (origin.index + origin.len) <= 6) origin.labelled = true;
  const conf = (h) => (h.labelled ? 0.97 : 0.8) - (h.exact ? 0 : 0.04);
  return {
    origin: origin ? field(origin.code, conf(origin), snippet(text, origin.index, origin.len)) : field(null, 0),
    destination: destination ? field(destination.code, conf(destination), snippet(text, destination.index, destination.len)) : field(null, 0),
    ambiguous: hits.length > 2,
  };
}

function extractContainer(text) {
  const m = /(\d+)\s*[x×*]\s*(20|40|45)\s*'?\s*(gp|hc|hq|dv|rf|ft)?\b/i.exec(text);
  if (!m) {
    const single = /\b(20|40)\s*'?\s*(gp|hc|hq|dv|rf)\b/i.exec(text);
    if (!single) return { containerType: field(null, 0), containerCount: field(null, 0) };
    const type = `${single[1]}${normaliseCt(single[2])}`;
    return { containerType: field(type, 0.86, snippet(text, single.index, single[0].length)), containerCount: field(1, 0.6, snippet(text, single.index, single[0].length)) };
  }
  const type = `${m[2]}${normaliseCt(m[3])}`;
  const ev = snippet(text, m.index, m[0].length);
  return { containerType: field(type, m[3] ? 0.95 : 0.75, ev), containerCount: field(Number(m[1]), 0.96, ev) };
}
const normaliseCt = (s) => {
  const v = (s || 'GP').toUpperCase();
  return v === 'HQ' ? 'HC' : v === 'DV' || v === 'FT' ? 'GP' : v;
};

function extractWeight(text) {
  const re = /(\d[\d.,]*)\s*(kgs?|kilos?|kilograms?|tons?|tonnes?|mt)\b/gi;
  let m;
  let best = null;
  while ((m = re.exec(text))) {
    const n = parseNumber(m[1]);
    if (n == null) continue;
    const unit = m[2].toLowerCase();
    const kg = unit.startsWith('k') ? n : n * 1000;
    const before = text.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    const labelled = /(gross|weight|g\.w|gw|wt)/.test(before);
    if (!best || labelled) best = { kg, labelled, ev: snippet(text, m.index, m[0].length), tons: !unit.startsWith('k') };
    if (labelled) break;
  }
  if (!best) return field(null, 0);
  return field(Math.round(best.kg), best.labelled ? 0.95 : best.tons ? 0.82 : 0.88, best.ev);
}

function extractVolume(text) {
  const m = /(\d[\d.,]*)\s*(cbm|m3|m³|cubic met(?:er|re)s?)/i.exec(text);
  if (!m) return field(null, 0);
  return field(parseNumber(m[1]), 0.93, snippet(text, m.index, m[0].length));
}

function extractPackages(text) {
  const m = /(\d[\d,]*)\s*(pallets?|plts?|cartons?|ctns?|crates?|pkgs?|packages?|boxes)\b/i.exec(text);
  if (!m) return field(null, 0);
  return field(parseNumber(m[1]), 0.9, snippet(text, m.index, m[0].length));
}

function extractIncoterm(text) {
  const re = new RegExp(`\\b(${INCOTERMS.join('|')})\\b`, 'g');
  const matches = [...text.matchAll(re)];
  if (!matches.length) return field(null, 0);
  const distinct = [...new Set(matches.map((m) => m[1]))];
  const m = matches[0];
  return field(m[1], distinct.length > 1 ? 0.62 : 0.96, snippet(text, m.index, m[0].length));
}

function toIso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractDate(text, now) {
  const year = now.getFullYear();
  const candidates = [];
  for (const m of text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) candidates.push({ iso: toIso(+m[1], +m[2], +m[3]), m, explicitYear: true });
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    candidates.push({ iso: toIso(y, +m[2], +m[1]), m, explicitYear: true });
  }
  const monRe = MONTHS.join('|');
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monRe})[a-z]*\\.?(?:\\s+(\\d{4}))?`, 'gi')))
    candidates.push({ iso: toIso(m[3] ? +m[3] : year, MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, +m[1]), m, explicitYear: !!m[3] });
  for (const m of text.matchAll(new RegExp(`\\b(${monRe})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi')))
    candidates.push({ iso: toIso(m[3] ? +m[3] : year, MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, +m[2]), m, explicitYear: !!m[3] });

  const valid = candidates.filter((c) => c.iso);
  if (!valid.length) return field(null, 0);
  const scored = valid.map((c) => {
    const before = text.slice(Math.max(0, c.m.index - 45), c.m.index).toLowerCase();
    return { ...c, ready: /(ready|crd|available|pick ?up|etd|from)/.test(before) };
  });
  const pick = scored.find((c) => c.ready) || scored[0];
  let iso = pick.iso;
  if (!pick.explicitYear) {
    const d = new Date(`${iso}T00:00:00`);
    if (d.getTime() < now.getTime() - 30 * 86400000) iso = toIso(year + 1, +iso.slice(5, 7), +iso.slice(8, 10));
  }
  const conf = (pick.ready ? 0.93 : 0.7) - (pick.explicitYear ? 0 : 0.05);
  return field(iso, conf, snippet(text, pick.m.index, pick.m[0].length));
}

function extractCommodity(text) {
  const label = /(commodity|goods|cargo description|description of goods|cargo)\s*[:\-]\s*([^\n;]+)/i.exec(text);
  if (label) {
    const raw = label[2].trim().replace(/[.,]$/, '');
    const known = COMMODITIES.find((c) => raw.toLowerCase().includes(c.toLowerCase().split(' ')[0]));
    return field(known || capitalise(raw.slice(0, 40)), known ? 0.96 : 0.84, snippet(text, label.index, label[0].length));
  }
  const lower = text.toLowerCase();
  const keys = COMMODITIES.map((c) => ({ c, key: c.toLowerCase().replace(/\s*\(.*\)/, '') }));
  for (const { c, key } of keys) {
    const idx = lower.indexOf(key);
    if (idx >= 0) return field(c, 0.8, snippet(text, idx, key.length));
  }
  for (const { c, key } of keys) {
    const word = key.split(' ').pop();
    if (word === 'products') continue;
    const idx = lower.indexOf(word);
    if (idx >= 0) return field(c, 0.68, snippet(text, idx, word.length));
  }
  return field(null, 0);
}
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function extractMode(text, container, volume) {
  const t = text.toLowerCase();
  const labelled = /\b(?:mode|service)\s*:\s*(air|sea fcl|sea lcl|lcl|fcl|road ftl|road)/i.exec(text);
  if (labelled) {
    const v = labelled[1].toLowerCase();
    const mode = v === 'air' ? 'AIR' : v.includes('lcl') ? 'SEA_LCL' : v.includes('road') ? 'ROAD' : 'SEA_FCL';
    return field(mode, 0.97, labelled[0]);
  }
  if (/\b(air ?freight|by air|awb|airport|air shipment|chargeable weight|flight)\b/.test(t)) return field('AIR', 0.94, 'air keyword');
  if (/\b(ftl|truck|trucking only|road freight|by road)\b/.test(t) && !container.containerType.value) return field('ROAD', 0.88, 'road keyword');
  if (/\blcl\b/.test(t)) return field('SEA_LCL', 0.95, 'LCL keyword');
  if (container.containerType.value) return field('SEA_FCL', 0.93, container.containerType.evidence);
  if (volume.value != null) return field('SEA_LCL', 0.7, volume.evidence);
  return field('SEA_FCL', 0.45, 'default');
}

function extractHazardous(text) {
  const m = /\b(dg cargo|dangerous goods|hazardous|imo class|un\s?\d{4}|class [1-9]\b)/i.exec(text);
  if (m) return field(true, 0.9, snippet(text, m.index, m[0].length));
  if (/\b(non[- ]?dg|non[- ]?hazardous|general cargo)\b/i.test(text)) return field(false, 0.95, 'non-DG stated');
  return field(false, 0.7, 'no DG indicators');
}

export function rowsToText(rows) {
  return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n---\n');
}

/**
 * Extract the standard shipment format from raw RFQ content.
 * @param {string|object[]} input free text, or Excel rows (array of objects)
 * @param {{now?: Date}} opts
 */
export function extractRfq(input, opts = {}) {
  const now = opts.now || new Date();
  const text = Array.isArray(input) ? rowsToText(input) : String(input || '');
  const ports = extractPorts(text);
  const container = extractContainer(text);
  const volumeCbm = extractVolume(text);
  const fields = {
    mode: extractMode(text, container, volumeCbm),
    origin: ports.origin,
    destination: ports.destination,
    commodity: extractCommodity(text),
    weightKg: extractWeight(text),
    volumeCbm,
    packages: extractPackages(text),
    containerType: container.containerType,
    containerCount: container.containerCount,
    incoterm: extractIncoterm(text),
    cargoReadyDate: extractDate(text, now),
    hazardous: extractHazardous(text),
  };
  if (ports.ambiguous) {
    fields.origin.confidence = round2(fields.origin.confidence - 0.12);
    fields.destination.confidence = round2(fields.destination.confidence - 0.12);
  }
  if (fields.mode.value === 'SEA_LCL' && fields.volumeCbm.value == null) fields.volumeCbm.confidence = 0;
  const required = REQUIRED_FIELDS.map((k) => fields[k].confidence);
  const overall = round2(required.reduce((a, b) => a + b, 0) / required.length);
  return { fields, overall, missing: REQUIRED_FIELDS.filter((k) => fields[k].value == null) };
}

/** Fields below the tenant's auto-accept threshold need a human to confirm them. */
export function fieldsNeedingReview(extraction, threshold) {
  return Object.entries(extraction.fields)
    .filter(([k, f]) => (REQUIRED_FIELDS.includes(k) || f.value != null) && f.confidence < threshold)
    .map(([k]) => k);
}

/** Flatten an extraction into the shipment data record. */
export function extractionToData(extraction) {
  const f = extraction.fields;
  return Object.fromEntries(Object.keys(FIELD_LABELS).map((k) => [k, f[k]?.value ?? null]));
}
