import { useMemo, useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, Table, Tabs, Tag, Typography, Alert } from 'antd';
import { DollarOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { PageHeader, StatusTag, Money, TimeAgo, fmtDate, ApprovalChain, fmtMoney } from '../components/common.jsx';
import { ApReconciliation } from '../components/ExecutionPanels.jsx';

function ArTab() {
  const { scoped, lookup, run, user, tenant } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ready = scoped.shipments.filter((s) => ['arrived', 'delivered'].includes(s.status) && !scoped.arInvoices.some((a) => a.shipmentId === s.id));
  const createAll = () => ready.forEach((s) => run(ops.createArInvoice, { shipmentId: s.id }, { actor: ops.AI_ACTOR }));
  return (
    <>
      {ready.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${ready.length} arrived/delivered shipment(s) not invoiced yet`}
          description={ready.map((s) => s.ref).join(', ')}
          action={<Button type="primary" icon={<RobotOutlined />} onClick={createAll}>Draft {ready.length} AR invoice(s)</Button>}
        />
      )}
      <Table
        rowKey="id"
        dataSource={scoped.arInvoices}
        pagination={{ pageSize: 12, showSizeChanger: false }}
        scroll={{ x: 900 }}
        expandable={{
          defaultExpandedRowKeys: params.get('id') ? [params.get('id')] : [],
          expandedRowRender: (inv) => (
            <Row gutter={16}>
              <Col xs={24} lg={14}>
                <Table size="small" pagination={false} rowKey={(_, i) => i} dataSource={inv.lines} columns={[{ title: 'Code', dataIndex: 'code', width: 60 }, { title: 'Description', dataIndex: 'desc' }, { title: 'Source', dataIndex: 'source', render: (v) => <Tag color={v === 'quote' ? 'blue' : 'orange'}>{v === 'quote' ? 'Quoted rate' : 'Actual cost (rebill)'}</Tag> }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => <Money value={v} currency={inv.currency} digits={2} /> }]} />
              </Col>
              <Col xs={24} lg={10}>
                {inv.status === 'pending_approval' ? <ApprovalChain chain={inv.approvals} user={user} onDecide={(approve, comment) => run(ops.decide, { kind: 'arInvoice', id: inv.id, approve, comment }, { success: approve ? 'Posted to CargoWise as Universal Transaction' : 'Returned to draft' })} /> : inv.cwTxnNo ? <Typography.Text>Posted to {inv.postedTo} as <span className="fp-mono">{inv.cwTxnNo}</span> on {fmtDate(inv.postedAt)}</Typography.Text> : <Typography.Text type="secondary">Draft</Typography.Text>}
              </Col>
            </Row>
          ),
        }}
        columns={[
          { title: 'Invoice', dataIndex: 'ref', render: (v, r) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={r.createdAt} /></div></div> },
          { title: 'Customer', render: (r) => lookup.customer(r.customerId)?.name },
          { title: 'Shipment', render: (r) => <a onClick={() => navigate(`/shipments/${r.shipmentId}`)}>{lookup.shipment(r.shipmentId)?.ref}</a> },
          { title: 'Due', dataIndex: 'dueDate', render: fmtDate },
          { title: 'Total', align: 'right', render: (r) => <Money value={r.total} currency={r.currency} strong /> },
          { title: 'Rebilled extras', render: (r) => { const n = r.lines.filter((l) => l.source === 'actual').length; return n ? <Tag color="orange">{n}</Tag> : '—'; } },
          { title: 'CW txn', dataIndex: 'cwTxnNo', render: (v) => <span className="fp-mono">{v || '—'}</span> },
          { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="ar" status={v} /> },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        AR lines = quoted sell rates + approved unexpected carrier costs rebilled with {tenant.settings.ap.rebillMarkupPct}% markup. Total posted: {fmtMoney(scoped.arInvoices.filter((a) => a.status === 'posted').reduce((s, a) => s + a.total, 0), tenant.currency)}.
      </Typography.Paragraph>
    </>
  );
}

function ApTab() {
  const { scoped, lookup, tenant } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [onlyVariance, setOnlyVariance] = useState(true);
  const rows = useMemo(() => (onlyVariance ? scoped.apInvoices.filter((a) => a.status === 'variance') : scoped.apInvoices), [scoped.apInvoices, onlyVariance]);
  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type={onlyVariance ? 'primary' : 'default'} onClick={() => setOnlyVariance(true)}>Needs review</Button>
        <Button type={!onlyVariance ? 'primary' : 'default'} onClick={() => setOnlyVariance(false)}>All carrier invoices</Button>
        <Typography.Text type="secondary">Tolerance: ±{tenant.settings.ap.tolerancePct}% or {tenant.currency} {tenant.settings.ap.toleranceAbs} — within tolerance is auto-matched and posted.</Typography.Text>
      </Space>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 12, showSizeChanger: false }}
        scroll={{ x: 900 }}
        expandable={{ defaultExpandedRowKeys: params.get('id') ? [params.get('id')] : rows.slice(0, 1).map((r) => r.id), expandedRowRender: (inv) => <ApReconciliation invoice={inv} /> }}
        columns={[
          { title: 'Carrier invoice', dataIndex: 'ref', render: (v, r) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={r.receivedAt} /></div></div> },
          { title: 'Carrier', render: (r) => lookup.partner(r.partnerId)?.name },
          { title: 'Shipment', render: (r) => <a onClick={() => navigate(`/shipments/${r.shipmentId}`)}>{lookup.shipment(r.shipmentId)?.ref}</a> },
          { title: 'Expected', align: 'right', render: (r) => <Money value={r.recon.expectedTotal} currency={r.currency} /> },
          { title: 'Invoiced', align: 'right', render: (r) => <Money value={r.total} currency={r.currency} strong /> },
          { title: 'Variance', align: 'right', sorter: (a, b) => a.recon.variance - b.recon.variance, render: (r) => <span style={{ color: r.recon.withinTolerance ? undefined : '#cf1322' }}>{r.recon.variance > 0 ? '+' : ''}{r.recon.variance.toLocaleString()} ({r.recon.variancePct}%)</span> },
          { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="ap" status={v} /> },
        ]}
      />
    </>
  );
}

export default function Invoicing() {
  const { scoped, tenant } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ar';
  const cur = tenant.currency;
  const variance = scoped.apInvoices.filter((a) => a.status === 'variance');
  return (
    <>
      <PageHeader title="Invoicing" subtitle="AR invoices built from quoted rates + actual costs; AP carrier invoices reconciled against expected costs" />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="AR awaiting approval" value={scoped.arInvoices.filter((a) => a.status === 'pending_approval').length} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="AR posted" value={fmtMoney(scoped.arInvoices.filter((a) => a.status === 'posted').reduce((s, a) => s + a.total, 0), cur)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="AP auto-matched" value={scoped.apInvoices.length ? Math.round((scoped.apInvoices.filter((a) => a.recon.withinTolerance).length / scoped.apInvoices.length) * 100) : 0} suffix="%" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Open AP variance" value={fmtMoney(variance.reduce((s, a) => s + a.recon.variance, 0), cur)} valueStyle={{ color: variance.length ? '#cf1322' : undefined }} /></Card></Col>
      </Row>
      <Card size="small">
        <Tabs activeKey={tab} onChange={(k) => setParams({ tab: k })} items={[{ key: 'ar', label: 'AR — customer invoices', children: <ArTab /> }, { key: 'ap', label: <span>AP — carrier invoices {variance.length > 0 && <Tag color="red">{variance.length}</Tag>}</span>, children: <ApTab /> }]} />
      </Card>
    </>
  );
}
