// Panels shared by the shipment detail page and the Documents / Tracking / Invoicing workspaces.
import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Input, Modal, Space, Table, Tag, Tooltip, Typography, Timeline, Select, Checkbox, Radio } from 'antd';
import { CheckCircleTwoTone, CloseCircleTwoTone, ClockCircleOutlined, CloudUploadOutlined, ThunderboltOutlined, FileTextOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { DOC_TYPES, DOC_CHECKS, CHECK_DEFS, valuesMatch } from '../lib/validation.js';
import { makeDocFields, makeApLines } from '../lib/simulate.js';
import { mathRng } from '../lib/util.js';
import { StatusTag, ConfTag, Money, fmtDate, fmtDateTime, ApprovalChain, TimeAgo } from './common.jsx';

const DOC_ROLES = ['admin', 'ops', 'manager'];
const fmtVal = (key, v) => (v == null || v === '' ? <span className="fp-muted">—</span> : CHECK_DEFS[key]?.fmt ? CHECK_DEFS[key].fmt(v) : typeof v === 'number' ? v.toLocaleString() : String(v));

export function DocumentReview({ doc, shipment }) {
  const { run, user } = useStore();
  const [pending, setPending] = useState(null); // { field, resolution }
  const [note, setNote] = useState('');
  const allowed = DOC_ROLES.includes(user.role);
  const rows = DOC_CHECKS[doc.type].map((key) => {
    const issue = doc.issues.find((i) => i.field === key);
    return { key, label: CHECK_DEFS[key].label, docValue: issue ? issue.docValue : doc.fields[key], recordValue: issue ? issue.recordValue : shipment[key], issue, ok: !issue && valuesMatch(CHECK_DEFS[key], doc.fields[key], shipment[key]) };
  });
  const submit = () => {
    run(ops.resolveIssue, { docId: doc.id, field: pending.field, resolution: pending.resolution, note }, { success: 'Resolution recorded in the audit log' });
    setPending(null);
    setNote('');
  };
  return (
    <div>
      <Descriptions size="small" column={{ xs: 1, md: 3 }} style={{ marginBottom: 8 }}>
        <Descriptions.Item label="File"><Tag icon={<FileTextOutlined />}>{doc.fileName}</Tag></Descriptions.Item>
        <Descriptions.Item label="Received">{fmtDateTime(doc.receivedAt)}</Descriptions.Item>
        <Descriptions.Item label="Read confidence"><ConfTag value={doc.confidence} /></Descriptions.Item>
      </Descriptions>
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={rows}
        rowClassName={(r) => (r.issue?.status === 'open' ? 'fp-row-warn' : '')}
        scroll={{ x: 720 }}
        columns={[
          { title: 'Field', dataIndex: 'label', width: 150, render: (v, r) => <span>{r.issue ? <CloseCircleTwoTone twoToneColor="#f5222d" /> : <CheckCircleTwoTone twoToneColor="#52c41a" />} {v}</span> },
          { title: `${DOC_TYPES[doc.type].short} says`, render: (r) => fmtVal(r.key, r.docValue) },
          { title: 'Shipment record', render: (r) => fmtVal(r.key, r.recordValue) },
          { title: 'Result', width: 190, render: (r) => (r.issue ? <Space direction="vertical" size={0}><Space size={4}><Tag color={{ high: 'red', medium: 'orange', low: 'gold' }[r.issue.severity]}>{r.issue.severity}</Tag><StatusTag kind="issue" status={r.issue.status} /></Space>{r.issue.detail && <span className="fp-muted" style={{ fontSize: 12 }}>{r.issue.detail}</span>}{r.issue.by && <span className="fp-muted" style={{ fontSize: 12 }}>{r.issue.by}{r.issue.note ? `: “${r.issue.note}”` : ''}</span>}</Space> : <Tag color="green">Match</Tag>) },
          {
            title: 'Resolve',
            width: 260,
            render: (r) => r.issue?.status === 'open' && (
              <Tooltip title={allowed ? '' : 'Requires Operations or Admin role'}>
                <Space wrap size={4}>
                  <Button size="small" disabled={!allowed} onClick={() => setPending({ field: r.key, resolution: 'accept_doc' })}>Use document value</Button>
                  <Button size="small" disabled={!allowed} onClick={() => setPending({ field: r.key, resolution: 'keep_record' })}>Keep record</Button>
                  <Button size="small" type="link" disabled={!allowed} onClick={() => setPending({ field: r.key, resolution: 'request_correction' })}>Request correction</Button>
                </Space>
              </Tooltip>
            ),
          },
        ]}
      />
      <Modal
        open={!!pending}
        title={pending && { accept_doc: 'Update shipment record from document', keep_record: 'Keep shipment record', request_correction: 'Request corrected document' }[pending.resolution]}
        onCancel={() => setPending(null)}
        onOk={submit}
        okButtonProps={{ disabled: pending?.resolution !== 'accept_doc' && !note.trim() }}
      >
        {pending?.resolution === 'accept_doc' && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="The shipment record will be updated. Other documents for this shipment are re-validated automatically." />}
        {pending?.resolution === 'request_correction' && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="An email asking the sender for a corrected document is drafted for you." />}
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending?.resolution === 'accept_doc' ? 'Note (optional)' : 'Reason (required, kept in the audit log)'} />
      </Modal>
    </div>
  );
}

export function UploadDocumentButton({ shipment, size }) {
  const { run, user } = useStore();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('CI');
  const [mismatch, setMismatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    setTimeout(() => {
      const rng = mathRng();
      run(ops.ingestDocument, { shipmentId: shipment.id, type, fields: makeDocFields(rng, type, shipment, mismatch), fileName: `${type}_${shipment.ref}_${rng.int(100, 999)}.pdf`, confidence: Math.round(rng.range(0.86, 0.99) * 100) / 100 }, { actor: ops.AI_ACTOR, success: (d) => (d.issues.length ? `${d.issues.length} mismatch(es) flagged for review` : 'Document matches the shipment record') });
      setBusy(false);
      setOpen(false);
    }, 900);
  };
  return (
    <>
      <Button size={size} icon={<CloudUploadOutlined />} disabled={!shipment.cwKey} onClick={() => setOpen(true)}>Receive document</Button>
      <Modal title={`Receive document for ${shipment.ref}`} open={open} onCancel={() => setOpen(false)} onOk={go} confirmLoading={busy} okText={busy ? 'AI is reading…' : 'Read & validate'}>
        <Typography.Paragraph type="secondary">Simulates a document arriving by email (or uploaded by {user.name}). The AI reads it and validates every field against the shipment record.</Typography.Paragraph>
        <Radio.Group value={type} onChange={(e) => setType(e.target.value)} optionType="button" options={Object.entries(DOC_TYPES).map(([value, d]) => ({ value, label: d.label }))} />
        <div style={{ marginTop: 12 }}><Checkbox checked={mismatch} onChange={(e) => setMismatch(e.target.checked)}>Inject a realistic discrepancy</Checkbox></div>
      </Modal>
    </>
  );
}

export function MilestoneTimeline({ shipment }) {
  return (
    <Timeline
      items={shipment.milestones.map((m) => {
        const late = !m.actual && m.planned < new Date().toISOString().slice(0, 10);
        const delay = m.actual ? Math.round((new Date(m.actual) - new Date(m.planned)) / 86400000) : null;
        return {
          color: m.actual ? 'green' : late ? 'red' : 'gray',
          dot: m.actual ? undefined : <ClockCircleOutlined />,
          children: (
            <div>
              <b>{m.name}</b> <span className="fp-mono fp-muted">{m.code}</span>
              <div style={{ fontSize: 12 }}>
                Planned {fmtDate(m.planned)}
                {m.actual && <> · Actual <b>{fmtDateTime(m.actual)}</b>{delay > 0 && <Tag color="orange" style={{ marginLeft: 6 }}>+{delay}d</Tag>}</>}
                {late && <Tag color="red" style={{ marginLeft: 6 }}>overdue</Tag>}
              </div>
              {m.location && <div className="fp-muted" style={{ fontSize: 12 }}>{m.location} · source: {m.source}</div>}
            </div>
          ),
        };
      })}
    />
  );
}

export function PollCarrierButton({ shipment, size }) {
  const { runAsync } = useStore();
  const [busy, setBusy] = useState(false);
  const next = shipment.milestones.find((m) => !m.actual);
  if (!shipment.cwKey || !next) return null;
  return (
    <Button
      size={size}
      icon={<ThunderboltOutlined />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await runAsync(ops.recordMilestone, { shipmentId: shipment.id, code: next.code }, { actor: ops.SYSTEM_ACTOR, latency: 600, success: `Carrier event received: ${next.name}` });
        setBusy(false);
      }}
    >
      Receive next event ({next.code})
    </Button>
  );
}

export function NotificationList({ shipment }) {
  const { run, user } = useStore();
  const [edit, setEdit] = useState({});
  if (!shipment.notifications.length) return <Typography.Text type="secondary">No customer updates yet. Updates are drafted automatically on the tenant's notify milestones.</Typography.Text>;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {shipment.notifications.map((n) => (
        <Card key={n.id} size="small" type="inner" title={<Space><StatusTag kind="notification" status={n.status} /><span>{n.channel} → {n.to}</span></Space>} extra={<span className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={n.sentAt || n.createdAt} /></span>}>
          {n.status === 'draft' ? (
            <>
              <Input.TextArea rows={3} value={edit[n.id] ?? n.message} onChange={(e) => setEdit({ ...edit, [n.id]: e.target.value })} />
              <div style={{ marginTop: 8 }}>
                <ApprovalChain
                  compact
                  chain={n.approvals}
                  user={user}
                  onDecide={(approve, comment) => {
                    if (approve && edit[n.id] && edit[n.id] !== n.message) run(ops.editNotification, { shipmentId: shipment.id, notificationId: n.id, message: edit[n.id] });
                    run(ops.decide, { kind: 'notification', id: shipment.id, subId: n.id, approve, comment }, { success: approve ? 'Update sent to customer' : 'Draft discarded' });
                  }}
                />
              </div>
            </>
          ) : (
            <Typography.Paragraph style={{ margin: 0, fontSize: 13 }}>{n.message}</Typography.Paragraph>
          )}
        </Card>
      ))}
    </Space>
  );
}

export function ApReconciliation({ invoice }) {
  const { run, user, lookup } = useStore();
  const r = invoice.recon;
  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <span>Expected <Money value={r.expectedTotal} currency={invoice.currency} digits={2} /></span>
        <span>Invoiced <Money value={r.invoicedTotal} currency={invoice.currency} digits={2} strong /></span>
        <Tag color={r.withinTolerance ? 'green' : 'red'}>Variance {r.variance > 0 ? '+' : ''}{r.variance.toLocaleString()} ({r.variancePct}%)</Tag>
        <span className="fp-muted" style={{ fontSize: 12 }}>{lookup.partner(invoice.partnerId)?.name} · {invoice.ref}</span>
      </Space>
      <Table
        size="small"
        rowKey="code"
        pagination={false}
        dataSource={r.rows}
        rowClassName={(x) => (x.status === 'ok' ? '' : 'fp-row-warn')}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 70 },
          { title: 'Charge', dataIndex: 'desc' },
          { title: 'Expected', dataIndex: 'expected', align: 'right', render: (v) => <Money value={v} currency={invoice.currency} digits={2} /> },
          { title: 'Invoiced', dataIndex: 'invoiced', align: 'right', render: (v) => <Money value={v} currency={invoice.currency} digits={2} /> },
          { title: 'Diff', dataIndex: 'diff', align: 'right', render: (v, x) => <span style={{ color: x.status === 'ok' ? undefined : '#cf1322', whiteSpace: 'nowrap' }}>{v > 0 ? '+' : ''}{v.toLocaleString()}{x.pct != null && ` (${x.pct}%)`}</span> },
          { title: 'Check', dataIndex: 'status', render: (v) => <Tag color={{ ok: 'green', over: 'red', under: 'blue', unexpected: 'volcano', missing: 'default' }[v]}>{{ ok: 'Within tolerance', over: 'Overcharged', under: 'Undercharged', unexpected: 'Not expected', missing: 'Not invoiced' }[v]}</Tag> },
        ]}
      />
      {invoice.status === 'variance' && (
        <div style={{ marginTop: 12 }}>
          <ApprovalChain chain={invoice.approvals} user={user} onDecide={(approve, comment) => run(ops.decide, { kind: 'apInvoice', id: invoice.id, approve, comment }, { success: approve ? 'Variance approved' : 'Invoice disputed with carrier' })} />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>Approving posts the AP invoice to CargoWise; unexpected charges become rebillable on the AR invoice. Rejecting marks it disputed.</Typography.Paragraph>
        </div>
      )}
      {invoice.cwTxnNo && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Posted to {invoice.postedTo} as {invoice.cwTxnNo} · {fmtDateTime(invoice.postedAt)}</Typography.Text>}
    </div>
  );
}

export function ReceiveApButton({ shipment, size }) {
  const { run, lookup } = useStore();
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState('over');
  if (!shipment.cwKey) return null;
  const go = () => {
    const rng = mathRng();
    const partner = lookup.partner(shipment.partnerId);
    run(ops.receiveApInvoice, { shipmentId: shipment.id, vendorRef: `${partner.scac}-${rng.int(100000, 999999)}`, lines: makeApLines(rng, shipment.expectedCosts, variant) }, { actor: ops.AI_ACTOR, success: (i) => (i.status === 'variance' ? 'Variance flagged for finance approval' : 'Auto-matched and posted') });
    setOpen(false);
  };
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>Receive carrier invoice</Button>
      <Modal title="Simulate carrier (AP) invoice" open={open} onCancel={() => setOpen(false)} onOk={go} okText="Receive & reconcile">
        <Typography.Paragraph type="secondary">The AI reads the carrier invoice and compares every charge with the expected costs from the accepted rate.</Typography.Paragraph>
        <Select value={variant} onChange={setVariant} style={{ width: '100%' }} options={[{ value: 'exact', label: 'Matches expected costs' }, { value: 'small', label: 'Small difference (within tolerance)' }, { value: 'over', label: 'Overcharged surcharge' }, { value: 'extra', label: 'Unexpected demurrage / storage' }]} />
      </Modal>
    </>
  );
}
