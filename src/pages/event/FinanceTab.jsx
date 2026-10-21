import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, StatTile, Modal, Field, Alert, Button, useDialog, printDocument } from '../../design-system/index.js';
import { invoiceHtml } from '../../lib/documents.js';
import { eventFinancials, invoiceBalance, invoiceStatus } from '../../lib/derived.js';
import { fmtDate, fmtDateTime } from '../../lib/dates.js';

export function PayModal({ ev, inv, onClose, portal }) {
  const { act } = useStore();
  const bal = invoiceBalance(ev, inv);
  const [amount, setAmount] = useState(bal);
  const methods = ev.currency === 'USD' ? ['card', 'ach'] : ['card', 'sepa', 'wire'];
  const [method, setMethod] = useState(methods[0]);
  const [busy, setBusy] = useState(false);
  const pay = () => {
    setBusy(true);
    setTimeout(() => { act('PAYMENT_RECORD', { eventId: ev.id, invoiceId: inv.id, amount: Number(amount), method }); onClose(); }, 700);
  };
  return (
    <Modal title={`${portal ? 'Pay' : 'Record payment for'} ${inv.number}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !amount} onClick={pay}>{busy ? 'Processing…' : `Pay ${amount} ${inv.currency}`}</Button></>}>
      <Alert tone="info">Mock Stripe Checkout — the EO system never stores card data (PCI DSS scope stays minimal). A processor reference (pi_…) is stored instead.</Alert>
      <div className="grid g2 mt">
        <Field label="Amount"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={bal} /></Field>
        <Field label="Method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m} value={m}>{{ card: 'Card', ach: 'ACH bank transfer (US)', sepa: 'SEPA Direct Debit (EU)', wire: 'Wire transfer' }[m]}</option>)}</select></Field>
      </div>
      {method === 'card' && <div className="grid g3 mt"><Field label="Card number"><input defaultValue="4242 4242 4242 4242" /></Field><Field label="Expiry"><input defaultValue="12/29" /></Field><Field label="CVC"><input defaultValue="123" /></Field></div>}
      {method === 'sepa' && <Field label="IBAN" style={{ marginTop: 10 }}><input defaultValue="FR76 3000 6000 0112 3456 7890 189" /></Field>}
      {method === 'ach' && <div className="grid g2 mt"><Field label="Routing"><input defaultValue="110000000" /></Field><Field label="Account"><input defaultValue="000123456789" /></Field></div>}
    </Modal>
  );
}

export function InvoiceTable({ ev, portal, payerFilter }) {
  const { state, act, today, user } = useStore();
  const [pay, setPay] = useState(null);
  const invs = ev.invoices.filter((i) => !payerFilter || payerFilter.includes(i.payerId));
  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Invoice</th><th>Description</th><th>Payer</th><th>Issued</th><th>Due</th><th className="num">Amount</th><th className="num">Late fee</th><th className="num">Balance</th><th>FX</th><th>Status</th><th /></tr></thead>
          <tbody>
            {invs.map((i) => {
              const st = invoiceStatus(ev, i, today);
              const bal = invoiceBalance(ev, i);
              return (
                <tr key={i.id}>
                  <td><b>{i.number}</b><div className="faint">{i.kind}</div></td>
                  <td>{i.label}</td>
                  <td>{portal ? ev.payers.find((p) => p.id === i.payerId)?.name : (
                    <select value={i.payerId || ''} onChange={(e) => act('INVOICE_SET_PAYER', { eventId: ev.id, invoiceId: i.id, payerId: e.target.value })}>{ev.payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{i.billTo === 'venue' && <option value="">Venue</option>}</select>
                  )}</td>
                  <td>{fmtDate(i.issuedAt)}</td>
                  <td style={{ color: st === 'overdue' ? 'var(--danger)' : undefined }}>{fmtDate(i.dueDate)}</td>
                  <td className="num"><Money value={i.amount} currency={i.currency} /></td>
                  <td className="num">{i.lateFeeApplied ? <Money value={i.lateFeeApplied} currency={i.currency} /> : '—'}</td>
                  <td className="num"><Money value={bal} currency={i.currency} /></td>
                  <td className="faint" style={{ fontSize: 11 }}>{i.currency !== 'USD' ? `1 ${i.currency} = ${i.fxRateToUSD} USD (locked)` : '—'}</td>
                  <td><StatusBadge status={st} /></td>
                  <td>
                    <div className="row">
                      {bal > 0 && st !== 'void' && <Button variant="primary" size="sm" onClick={() => setPay(i)}>{portal ? 'Pay now' : 'Record payment'}</Button>}
                      {!portal && st === 'overdue' && <Button variant="danger" size="sm" onClick={() => act('LATE_FEE_APPLY', { eventId: ev.id, invoiceId: i.id })}>Apply late fee</Button>}
                      <Button size="sm" onClick={() => { printDocument(i.number, invoiceHtml(state, ev, i)); act('DOCUMENT_GENERATED', { eventId: ev.id, kind: st === 'paid' ? 'Receipt' : 'Invoice', ref: i.number }); }}>{st === 'paid' ? 'Receipt' : 'View / PDF'}</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pay && <PayModal ev={ev} inv={pay} portal={portal} onClose={() => setPay(null)} />}
    </>
  );
}

export default function FinanceTab({ ev }) {
  const dialog = useDialog();
  const { state, act, user } = useStore();
  const f = eventFinancials(state, ev);
  const [provider, setProvider] = useState(state.settings.accountingProvider);
  const cur = ev.currency;
  return (
    <div>
      <div className="grid g5">
        <StatTile label="Contract value" value={<Money value={f.contractTotal} currency={cur} />} sub={`incl. tax ${f.tax}`} />
        <StatTile label="Received" value={<Money value={f.paid} currency={cur} />} />
        <StatTile label="Deferred revenue" value={<Money value={f.deferred} currency={cur} />} sub="received in advance (liability)" />
        <StatTile label="Recognized revenue" value={<Money value={f.recognizedRevenue} currency={cur} />} sub="after event took place" />
        <StatTile label="Gratuities (not revenue)" value={<Money value={f.gratuities} currency={cur} />} />
      </div>
      <Card title="Client invoices" className="mt" actions={<Button onClick={async () => { const r = await dialog.form({ title: 'Ad-hoc invoice', fields: [{ name: 'label', label: 'Description', required: true }, { name: 'amount', label: `Amount (${ev.currency})`, type: 'number', required: true }, { name: 'payerId', label: 'Payer', type: 'select', options: ev.payers.map((p) => ({ value: p.id, label: p.name })), defaultValue: ev.payers[0]?.id }] }); r && act('INVOICE_ADHOC', { eventId: ev.id, ...r }); }}>+ Ad-hoc invoice</Button>}>
        <InvoiceTable ev={ev} />
      </Card>
      <div className="grid g2 mt">
        <Card title="Payment schedule (from contract & change orders)">
          <table className="t">
            <thead><tr><th>Installment</th><th>Source</th><th>Due</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>{ev.paymentSchedule.map((p) => <tr key={p.id}><td>{p.label}</td><td><Badge>{p.source}</Badge></td><td>{fmtDate(p.dueDate)}</td><td className="num"><Money value={p.amount} currency={cur} /></td><td><StatusBadge status={p.status} /></td><td>{p.status === 'scheduled' && <Button size="sm" onClick={() => act('INVOICE_FROM_SCHEDULE', { eventId: ev.id, itemId: p.id })}>Invoice now</Button>}</td></tr>)}</tbody>
          </table>
          <div className="faint mt" style={{ fontSize: 12 }}>The automation engine invoices installments automatically 30 days before they fall due.</div>
        </Card>
        <Card title="Payments received">
          <table className="t">
            <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Processor ref</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{ev.payments.map((p) => (
              <tr key={p.id} className={p.reversed ? 'row-cancelled' : ''}>
                <td>{fmtDateTime(p.at)}</td><td>{ev.invoices.find((i) => i.id === p.invoiceId)?.number}</td><td><Badge>{p.method}</Badge></td>
                <td className="faint">{p.ref}{p.reversalOf && <div><Badge tone="danger">reversal · {p.reason}</Badge></div>}{p.reversed && <div><Badge tone="danger">reversed</Badge></div>}</td>
                <td className="num"><Money value={p.amount} currency={cur} /></td>
                <td>{p.amount > 0 && !p.reversed && ['admin', 'finance'].includes(user.role) && <Button size="sm" variant="ghost" onClick={async () => { const r = await dialog.form({ title: `Reverse payment ${p.ref}?`, fields: [{ name: 'reason', label: 'Reason', type: 'select', options: ['ACH return — insufficient funds', 'Card chargeback', 'Bounced cheque', 'Duplicate payment', 'Wire recalled by bank'], defaultValue: 'ACH return — insufficient funds' }, { name: 'chargeFee', label: `Re-bill the returned-payment fee (${state.settings.returnedPaymentFee ?? 35} ${cur})`, type: 'checkbox', defaultValue: true }] }); r && act('PAYMENT_REVERSE', { eventId: ev.id, paymentId: p.id, ...r }); }}>Reverse…</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
      <div className="grid g3 mt">
        <Card title="Credit notes & refunds" actions={<Button size="sm" onClick={async () => { const r = await dialog.form({ title: 'Credit note / refund', fields: [{ name: 'amount', label: `Amount (${ev.currency})`, type: 'number', required: true }, { name: 'reason', label: 'Reason', defaultValue: 'Service reduction', required: true }, { name: 'refund', label: 'Refund cash to the client (otherwise credit only)', type: 'checkbox' }] }); r && act('CREDIT_NOTE_CREATE', { eventId: ev.id, ...r }); }}>+ Credit note</Button>}>
          {ev.creditNotes.length === 0 && <div className="faint">None</div>}
          {ev.creditNotes.map((c) => <div key={c.id} className="row between"><span>{c.number} · {c.reason} {c.refund && <Badge tone="warn">refund</Badge>}</span><Money value={c.amount} currency={cur} /></div>)}
        </Card>
        <Card title="Gratuities (vendors & crew)" actions={<Button size="sm" onClick={async () => { const r = await dialog.form({ title: 'Record gratuity', fields: [{ name: 'to', label: 'Recipient (vendor / crew)', required: true }, { name: 'amount', label: `Amount (${ev.currency})`, type: 'number', required: true, defaultValue: 200 }, { name: 'paidBy', label: 'Paid by', type: 'select', options: ['Client', 'EO on behalf of client'], defaultValue: 'Client' }] }); r && act('GRATUITY_ADD', { eventId: ev.id, ...r }); }}>+ Gratuity</Button>}>
          <div className="faint mb" style={{ fontSize: 12 }}>Recorded as a pass-through liability — never EO revenue.</div>
          {ev.gratuities.map((g) => <div key={g.id} className="row between"><span>{g.to} <span className="faint">({g.paidBy})</span></span><Money value={g.amount} currency={cur} /></div>)}
        </Card>
        <Card title="Accounting sync">
          <div className="row"><select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="quickbooks">QuickBooks Online</option><option value="xero">Xero</option></select><Button variant="primary" onClick={() => act('ACCOUNTING_SYNC', { eventId: ev.id, provider })}>Sync (mock)</Button></div>
          {ev.accountingSync[0] && (
            <div className="mt">
              <div className="faint" style={{ fontSize: 12 }}>Last sync {fmtDateTime(ev.accountingSync[0].at)} → {ev.accountingSync[0].provider}</div>
              <table className="t"><tbody>{ev.accountingSync[0].journal.map((j, i) => <tr key={i}><td>{j.account}</td><td className="num">{j.debit ? `Dr ${j.debit}` : ''}</td><td className="num">{j.credit ? `Cr ${j.credit}` : ''}</td></tr>)}</tbody></table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
