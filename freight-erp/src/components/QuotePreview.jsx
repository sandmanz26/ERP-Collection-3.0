import { MODES, portName } from '../lib/reference.js';
import { fmtMoney, fmtDate } from './common.jsx';

/** Renders a quotation in the forwarder's own template (what the customer receives). */
export default function QuotePreview({ quote, template, tenant, customer, rfq }) {
  const cur = quote.currency;
  const d = rfq?.data || {};
  return (
    <div className="fp-quote-doc">
      <header style={{ background: template.accent }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{tenant.name}</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>{tenant.city} · Freight quotation</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{quote.ref}</div>
          <div>Valid until {fmtDate(quote.validUntil)}</div>
        </div>
      </header>
      <section>
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          To: <b>{customer?.name}</b> — Attn. {customer?.contact}
          <br />
          {template.intro}
        </div>
        <table style={{ marginBottom: 12 }}>
          <tbody>
            <tr><td style={{ width: 130, color: '#8c8c8c' }}>Route</td><td>{portName(d.origin)} → {portName(d.destination)}</td></tr>
            <tr><td style={{ color: '#8c8c8c' }}>Service</td><td>{MODES[d.mode]?.label}{d.containerType ? ` · ${d.containerCount} × ${d.containerType}` : ''}</td></tr>
            <tr><td style={{ color: '#8c8c8c' }}>Cargo</td><td>{d.commodity} · {Number(d.weightKg || 0).toLocaleString()} kg{d.volumeCbm ? ` · ${d.volumeCbm} cbm` : ''} · {d.incoterm}</td></tr>
            {template.showTransit && <tr><td style={{ color: '#8c8c8c' }}>Transit time</td><td>approx. {quote.transitDays} days ({quote.routing})</td></tr>}
          </tbody>
        </table>
        {template.showBreakdown ? (
          <table>
            <thead><tr><th>Charge</th><th className="num">Amount ({cur})</th></tr></thead>
            <tbody>
              {quote.lines.map((l, i) => <tr key={i}><td>{l.desc}</td><td className="num">{fmtMoney(l.sell, cur, 2)}</td></tr>)}
              <tr><td><b>Total</b></td><td className="num"><b>{fmtMoney(quote.sellTotal, cur, 2)}</b></td></tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700, padding: '8px 0' }}>All-in: {fmtMoney(quote.sellTotal, cur, 2)}</div>
        )}
        <ul style={{ fontSize: 11.5, color: '#595959', paddingLeft: 18, marginTop: 12 }}>
          {template.terms.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>
      <footer>{template.footer}</footer>
    </div>
  );
}
