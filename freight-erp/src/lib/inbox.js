// Human-in-the-loop inbox: everything across modules that is waiting for a person.
import { currentStepIndex } from './approvals.js';
import { DOC_TYPES } from './validation.js';
import { FIELD_LABELS } from './extract.js';

export function pendingItems(scoped, lookup) {
  const items = [];
  for (const r of scoped.rfqs.filter((x) => x.status === 'review')) {
    items.push({
      key: `rfq-${r.id}`,
      kind: 'rfq',
      ref: r.ref,
      link: `/rfqs/${r.id}`,
      title: `Confirm extracted shipment data (${lookup.customer(r.customerId)?.name})`,
      detail: `${r.extraction?.reviewFields?.length || 0} low-confidence field(s): ${(r.extraction?.reviewFields || []).map((k) => FIELD_LABELS[k]).join(', ')}`,
      role: 'pricing',
      since: r.extraction?.extractedAt || r.receivedAt,
      confidence: r.extraction?.overall,
      inline: false,
    });
  }
  for (const q of scoped.quotes.filter((x) => x.status === 'pending_approval')) {
    const step = q.approvals[currentStepIndex(q.approvals)];
    items.push({ key: `q-${q.id}`, kind: 'quote', id: q.id, ref: q.ref, link: `/quotes/${q.id}`, title: `Approve quotation for ${lookup.customer(q.customerId)?.name}`, detail: `${q.currency} ${q.sellTotal.toLocaleString()} · margin ${q.marginPct}% · step "${step?.name}"`, role: step?.role, since: q.history?.at(-1)?.at || q.createdAt, inline: true, amount: q.sellTotal, currency: q.currency });
  }
  for (const s of scoped.shipments.filter((x) => x.status === 'booking_pending' && currentStepIndex(x.approvals) >= 0)) {
    const step = s.approvals[currentStepIndex(s.approvals)];
    items.push({ key: `b-${s.id}`, kind: 'booking', id: s.id, ref: s.ref, link: `/shipments/${s.id}`, title: `Confirm booking push to CargoWise`, detail: `${lookup.customer(s.customerId)?.name} · ${s.origin} → ${s.destination} · ${lookup.partner(s.partnerId)?.name}`, role: step?.role, since: s.createdAt, inline: true });
  }
  for (const d of scoped.documents.filter((x) => x.status === 'mismatch')) {
    const s = lookup.shipment(d.shipmentId);
    const open = d.issues.filter((i) => i.status === 'open');
    items.push({ key: `d-${d.id}`, kind: 'document', id: d.id, ref: `${DOC_TYPES[d.type].short} · ${s?.ref}`, link: `/documents?doc=${d.id}`, title: `Resolve ${open.length} document mismatch(es)`, detail: open.map((i) => `${i.label}: "${i.docValue}" vs "${i.recordValue}"`).join(' · '), role: 'ops', since: d.receivedAt, confidence: d.confidence, inline: false, severity: open.some((i) => i.severity === 'high') ? 'high' : 'medium' });
  }
  for (const a of scoped.arInvoices.filter((x) => x.status === 'pending_approval')) {
    const step = a.approvals[currentStepIndex(a.approvals)];
    items.push({ key: `ar-${a.id}`, kind: 'arInvoice', id: a.id, ref: a.ref, link: `/invoicing?tab=ar&id=${a.id}`, title: `Post AR invoice to ${lookup.customer(a.customerId)?.name}`, detail: `${a.currency} ${a.total.toLocaleString()} · ${a.lines.length} lines`, role: step?.role, since: a.createdAt, inline: true });
  }
  for (const a of scoped.apInvoices.filter((x) => x.status === 'variance')) {
    const step = a.approvals[currentStepIndex(a.approvals)];
    items.push({ key: `ap-${a.id}`, kind: 'apInvoice', id: a.id, ref: a.ref, link: `/invoicing?tab=ap&id=${a.id}`, title: `Carrier invoice variance — ${lookup.partner(a.partnerId)?.name}`, detail: `Variance ${a.currency} ${a.recon.variance.toLocaleString()} (${a.recon.variancePct}%) on ${a.recon.rows.filter((r) => r.status !== 'ok').map((r) => r.code).join(', ')}`, role: step?.role, since: a.receivedAt, inline: false, severity: Math.abs(a.recon.variancePct) > 10 ? 'high' : 'medium' });
  }
  for (const s of scoped.shipments) {
    for (const n of s.notifications.filter((x) => x.status === 'draft' && currentStepIndex(x.approvals) >= 0)) {
      const step = n.approvals[currentStepIndex(n.approvals)];
      items.push({ key: `n-${n.id}`, kind: 'notification', id: s.id, subId: n.id, ref: s.ref, link: `/tracking?shipment=${s.id}`, title: `Send status update to ${lookup.customer(s.customerId)?.name}`, detail: n.message, role: step?.role, since: n.createdAt, inline: true });
    }
  }
  return items.sort((a, b) => (a.since < b.since ? -1 : 1));
}

export const KIND_LABELS = {
  rfq: { label: 'RFQ review', color: 'orange' },
  quote: { label: 'Quotation', color: 'purple' },
  booking: { label: 'Booking', color: 'blue' },
  document: { label: 'Document', color: 'red' },
  arInvoice: { label: 'AR invoice', color: 'gold' },
  apInvoice: { label: 'AP variance', color: 'volcano' },
  notification: { label: 'Customer update', color: 'cyan' },
};
