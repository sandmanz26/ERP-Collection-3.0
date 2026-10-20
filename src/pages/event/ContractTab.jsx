import React, { useState } from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, StatusBadge, Money, Alert, Empty, Field } from '../../components/ui.jsx';
import { clientOf, activeProposal } from '../../lib/derived.js';
import { fmtDate, fmtDateTime } from '../../lib/dates.js';

export function SignaturePanel({ ev, allowSignerIds }) {
  const { act } = useStore();
  const [names, setNames] = useState({});
  const c = ev.contract;
  return (
    <table className="t">
      <thead><tr><th>Signer</th><th>Role</th><th>Status</th><th>Audit trail</th><th /></tr></thead>
      <tbody>
        {c.signers.map((s) => (
          <tr key={s.id}>
            <td>{s.name}<div className="faint">{s.email}</div></td>
            <td>{s.role}</td>
            <td>{s.signedAt ? <Badge tone="ok">signed</Badge> : <Badge tone="warn">pending</Badge>}</td>
            <td className="faint" style={{ fontSize: 11.5 }}>{s.signedAt ? <>“{s.typedName || s.name}” · {fmtDateTime(s.signedAt)} · IP {s.ip}</> : '—'}</td>
            <td>
              {!s.signedAt && c.status !== 'draft' && (!allowSignerIds || allowSignerIds.includes(s.id)) && (
                <div className="row">
                  <input placeholder="Type full name" value={names[s.id] || ''} onChange={(e) => setNames({ ...names, [s.id]: e.target.value })} style={{ width: 150 }} />
                  <button className="btn sm primary" onClick={() => act('CONTRACT_SIGN', { eventId: ev.id, signerId: s.id, typedName: names[s.id] })}>e-Sign</button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ContractTab({ ev, et }) {
  const { state, act } = useStore();
  const client = clientOf(state, ev);
  const prop = activeProposal(ev);
  const [signers, setSigners] = useState(() => [{ name: client?.name.split(' & ')[0] ?? '', email: client?.email ?? '', role: 'Client' }]);
  const [ps, setPs] = useState(et.paymentScheduleId);
  const [cp, setCp] = useState(et.cancellationPolicyId);
  const c = ev.contract;

  if (!c) {
    if (!prop) return <Card><Empty>Create and send a proposal first.</Empty></Card>;
    return (
      <Card title="Generate contract from template">
        <Alert tone="info">Variables (client, date, venue, total, schedule, cancellation table) are filled automatically from proposal v{prop.version} ({prop.status}).</Alert>
        <div className="grid g2 mt">
          <Field label="Payment schedule"><select value={ps} onChange={(e) => setPs(e.target.value)}>{state.settings.paymentSchedules.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Cancellation policy"><select value={cp} onChange={(e) => setCp(e.target.value)}>{state.settings.cancellationPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <h4 className="mt2">Signers (multiple supported — e.g. couple + paying parents)</h4>
        {signers.map((s, i) => (
          <div className="row mb" key={i}>
            <input placeholder="Name" value={s.name} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input placeholder="Email" value={s.email} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            <input placeholder="Role" value={s.role} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
            <button className="btn sm ghost" onClick={() => setSigners(signers.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="row">
          <button className="btn" onClick={() => setSigners([...signers, { name: '', email: '', role: 'Co-signer' }])}>+ Signer</button>
          <button className="btn primary" disabled={!signers.length || signers.some((s) => !s.name)} onClick={() => act('CONTRACT_GENERATE', { eventId: ev.id, signers, paymentScheduleId: ps, cancellationPolicyId: cp })}>Generate contract</button>
        </div>
      </Card>
    );
  }

  const policy = state.settings.cancellationPolicies.find((p) => p.id === c.cancellationPolicyId);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(280px,2fr)' }}>
      <Card title="Contract document" actions={<StatusBadge status={c.status} />}>
        {c.immutable && <Alert tone="success">🔒 Signed {fmtDateTime(c.signedAt)} — this contract is immutable. Post-signature changes only via Change Orders. Original value <Money value={c.originalTotal} currency={c.currency} />, current value incl. approved COs <Money value={c.total} currency={c.currency} />.</Alert>}
        <div className="contract-body mt">{c.body}</div>
      </Card>
      <div>
        <Card title="E-signature" actions={c.status === 'draft' && <button className="btn primary" onClick={() => act('CONTRACT_SEND', { eventId: ev.id })}>Send for signature</button>}>
          <SignaturePanel ev={ev} />
          {c.status !== 'draft' && !c.immutable && <div className="faint mt" style={{ fontSize: 12 }}>Clients sign in the Client Portal. For demo you can sign here on their behalf.</div>}
        </Card>
        <Card title="Payment schedule">
          {ev.paymentSchedule.length === 0 ? <div className="faint">Generated automatically when all parties have signed.</div> : (
            <table className="t">
              <thead><tr><th>Installment</th><th>Due</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>{ev.paymentSchedule.map((p) => <tr key={p.id}><td>{p.label}{p.isDeposit && <Badge tone="brand">deposit → locks date</Badge>}</td><td>{fmtDate(p.dueDate)}</td><td className="num"><Money value={p.amount} currency={ev.currency} /></td><td><StatusBadge status={p.status} /></td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title={`Cancellation policy — ${policy.name}`}>
          <table className="t"><tbody>{policy.rows.map((r) => <tr key={r.minDaysBefore}><td>≥ {r.minDaysBefore} days before event</td><td className="num">{r.forfeitPct}% forfeited</td></tr>)}</tbody></table>
          <p className="faint" style={{ fontSize: 12 }}><b>Postponement:</b> {policy.postponement}</p>
          <p className="faint" style={{ fontSize: 12 }}><b>Force majeure:</b> {policy.forceMajeure}</p>
        </Card>
      </div>
    </div>
  );
}
