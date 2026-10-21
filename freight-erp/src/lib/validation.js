// Validate extracted document data (commercial invoice, packing list, bill of lading) against the shipment record.
import { portName } from './reference.js';

export const DOC_TYPES = {
  CI: { label: 'Commercial invoice', short: 'CI', color: 'gold' },
  PL: { label: 'Packing list', short: 'PL', color: 'cyan' },
  BL: { label: 'Bill of lading', short: 'B/L', color: 'blue' },
};

// field → [record key, comparison, severity, label]
export const DOC_CHECKS = {
  CI: ['shipper', 'consignee', 'commodity', 'incoterm', 'packages'],
  PL: ['packages', 'weightKg', 'volumeCbm', 'commodity'],
  BL: ['shipper', 'consignee', 'origin', 'destination', 'containerNo', 'packages', 'weightKg', 'vessel'],
};

export const CHECK_DEFS = {
  shipper: { label: 'Shipper', cmp: 'text', severity: 'high' },
  consignee: { label: 'Consignee', cmp: 'text', severity: 'high' },
  origin: { label: 'Port of loading', cmp: 'exact', severity: 'high', fmt: portName },
  destination: { label: 'Port of discharge', cmp: 'exact', severity: 'high', fmt: portName },
  containerNo: { label: 'Container no.', cmp: 'exact', severity: 'high' },
  vessel: { label: 'Vessel', cmp: 'text', severity: 'medium' },
  packages: { label: 'Packages', cmp: 'number', tolerance: 0, severity: 'medium' },
  weightKg: { label: 'Gross weight (kg)', cmp: 'number', tolerance: 0.01, severity: 'medium' },
  volumeCbm: { label: 'Volume (cbm)', cmp: 'number', tolerance: 0.03, severity: 'low' },
  commodity: { label: 'Commodity', cmp: 'text', severity: 'low' },
  incoterm: { label: 'Incoterms', cmp: 'exact', severity: 'medium' },
};

export const normaliseText = (s) => String(s ?? '').toLowerCase().replace(/\b(pt|ltd|co|inc|gmbh|llc|limited|corp|corporation|tbk)\b/g, '').replace(/[^a-z0-9]/g, '');

export function valuesMatch(def, docValue, recordValue) {
  if (docValue == null || docValue === '') return true; // nothing extracted → not a mismatch (handled by confidence)
  if (recordValue == null || recordValue === '') return true;
  if (def.cmp === 'number') {
    const a = Number(docValue);
    const b = Number(recordValue);
    if (!b) return a === b;
    return Math.abs(a - b) / Math.abs(b) <= (def.tolerance || 0);
  }
  if (def.cmp === 'exact') return String(docValue).trim().toUpperCase() === String(recordValue).trim().toUpperCase();
  const a = normaliseText(docValue);
  const b = normaliseText(recordValue);
  return a === b || a.includes(b) || b.includes(a);
}

/** Return one issue per mismatched field. */
export function validateDocument(doc, shipment) {
  const issues = [];
  for (const key of DOC_CHECKS[doc.type] || []) {
    const def = CHECK_DEFS[key];
    const docValue = doc.fields?.[key];
    const recordValue = shipment?.[key];
    if (!valuesMatch(def, docValue, recordValue)) {
      let detail = '';
      if (def.cmp === 'number' && Number(recordValue)) {
        const pct = ((Number(docValue) - Number(recordValue)) / Number(recordValue)) * 100;
        detail = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs record`;
      }
      issues.push({ field: key, label: def.label, docValue, recordValue, severity: def.severity, detail, status: 'open' });
    }
  }
  return issues;
}

export const docStatusFromIssues = (issues) => {
  if (!issues.length) return 'validated';
  return issues.some((i) => i.status === 'open') ? 'mismatch' : 'resolved';
};
