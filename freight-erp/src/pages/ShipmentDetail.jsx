import { useNavigate, useParams, Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Descriptions, Empty, Result, Row, Space, Statistic, Table, Tabs, Tag, Typography, Collapse } from 'antd';
import { CloudSyncOutlined, DollarOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { DOC_TYPES } from '../lib/validation.js';
import { MODES } from '../lib/reference.js';
import { PageHeader, StatusTag, Lane, ModeTag, Port, fmtDate, fmtDateTime, ApprovalChain, Money, CodeViewer, TimeAgo } from '../components/common.jsx';
import { DocumentReview, UploadDocumentButton, MilestoneTimeline, PollCarrierButton, NotificationList, ApReconciliation, ReceiveApButton } from '../components/ExecutionPanels.jsx';

export function MessageLog({ messages }) {
  if (!messages.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No integration messages" />;
  return (
    <Collapse
      size="small"
      items={messages.map((m) => ({
        key: m.id,
        label: (
          <Space wrap>
            <Tag color={m.direction === 'outbound' ? 'blue' : 'green'}>{m.direction === 'outbound' ? '→ OUT' : '← IN'}</Tag>
            <b>{m.messageType}</b>
            <span className="fp-muted">{m.connectorName}</span>
            <span className="fp-muted">{m.entityRef}</span>
            <Tag color={m.status === 'failed' ? 'red' : 'default'}>{m.status}</Tag>
            <span className="fp-muted" style={{ fontSize: 12 }}>{fmtDateTime(m.at)}</span>
          </Space>
        ),
        children: <CodeViewer body={m.body} format={m.format} />,
      }))}
    />
  );
}

export default function ShipmentDetail() {
  const { id } = useParams();
  const { scoped, lookup, run, user, tenant } = useStore();
  const navigate = useNavigate();
  const s = scoped.shipments.find((x) => x.id === id);
  if (!s) return <Result status="404" title="Shipment not found in this tenant" extra={<Button onClick={() => navigate('/shipments')}>Back</Button>} />;
  const customer = lookup.customer(s.customerId);
  const partner = lookup.partner(s.partnerId);
  const quote = lookup.quote(s.quoteId);
  const docs = scoped.documents.filter((d) => d.shipmentId === s.id);
  const ar = scoped.arInvoices.filter((a) => a.shipmentId === s.id);
  const ap = scoped.apInvoices.filter((a) => a.shipmentId === s.id);
  const msgs = scoped.messages.filter((m) => m.entityRef === s.ref || ar.some((a) => a.ref === m.entityRef) || ap.some((a) => a.ref === m.entityRef));
  const revenue = ar.length ? ar.reduce((a, x) => a + x.total, 0) : s.sellLines.reduce((a, l) => a + l.sell, 0);
  const cost = ap.length ? ap.reduce((a, x) => a + x.total, 0) : s.expectedCosts.reduce((a, l) => a + l.amount, 0);
  const cur = tenant.currency;

  return (
    <>
      <PageHeader
        title={<Space>{s.ref}<StatusTag kind="shipment" status={s.status} />{s.cwKey && <Tag icon={<CloudSyncOutlined />} color="geekblue">CW {s.cwKey}</Tag>}</Space>}
        subtitle={<span>{customer?.name} · <Lane origin={s.origin} destination={s.destination} /> · <ModeTag mode={s.mode} /> · quote <Link to={`/quotes/${s.quoteId}`}>{quote?.ref}</Link></span>}
        extra={[
          <UploadDocumentButton key="u" shipment={s} />,
          <PollCarrierButton key="p" shipment={s} />,
          s.status === 'booking_hold' && <Button key="rb" onClick={() => run(ops.retryBooking, { shipmentId: s.id })}>Resubmit booking</Button>,
          <Button key="b" onClick={() => navigate('/shipments')}>Back</Button>,
        ]}
      />
      {s.status === 'booking_pending' && (
        <Card size="small" style={{ marginBottom: 16, borderColor: '#fa8c16' }} title="Booking awaiting confirmation (human-in-the-loop)">
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="The AI prepared a Universal Shipment for CargoWise. Confirm to push it via eAdaptor." />
          <ApprovalChain chain={s.approvals} user={user} onDecide={(approve, comment) => run(ops.decide, { kind: 'booking', id: s.id, approve, comment }, { success: approve ? 'Pushed to CargoWise' : 'Booking put on hold' })} />
        </Card>
      )}
      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={16}>
                  <Card size="small" title="Shipment record">
                    <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
                      <Descriptions.Item label="Shipper">{s.shipper}</Descriptions.Item>
                      <Descriptions.Item label="Consignee">{s.consignee}</Descriptions.Item>
                      <Descriptions.Item label="Port of loading"><Port code={s.origin} /> ({s.origin})</Descriptions.Item>
                      <Descriptions.Item label="Port of discharge"><Port code={s.destination} /> ({s.destination})</Descriptions.Item>
                      <Descriptions.Item label="Mode">{MODES[s.mode]?.label}{s.containerType && ` · ${s.containerCount} × ${s.containerType}`}</Descriptions.Item>
                      <Descriptions.Item label="Container no.">{s.containerNo || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Vessel / flight">{s.vessel}{s.voyage && ` / ${s.voyage}`}</Descriptions.Item>
                      <Descriptions.Item label="Carrier">{partner?.name} ({partner?.scac})</Descriptions.Item>
                      <Descriptions.Item label="Commodity">{s.commodity}{s.hazardous && <Tag color="red" style={{ marginLeft: 6 }}>DG</Tag>}</Descriptions.Item>
                      <Descriptions.Item label="Incoterms">{s.incoterm}</Descriptions.Item>
                      <Descriptions.Item label="Packages">{s.packages}</Descriptions.Item>
                      <Descriptions.Item label="Weight / volume">{Number(s.weightKg).toLocaleString()} kg · {s.volumeCbm ?? '—'} cbm</Descriptions.Item>
                      <Descriptions.Item label="ETD">{fmtDate(s.etd)}</Descriptions.Item>
                      <Descriptions.Item label="ETA">{fmtDate(s.eta)}</Descriptions.Item>
                      <Descriptions.Item label="Booked in">{s.bookedIn ? `${s.bookedIn} · ${fmtDateTime(s.bookedAt)}` : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Cargo ready">{fmtDate(s.cargoReadyDate)}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                </Col>
                <Col xs={24} xl={8}>
                  <Card size="small" title="Milestones"><MilestoneTimeline shipment={s} /></Card>
                  <Card size="small" title="Job profit" style={{ marginTop: 16 }}>
                    <Row>
                      <Col span={8}><Statistic title={ar.length ? 'Invoiced' : 'Quoted'} value={revenue} precision={0} prefix={cur} valueStyle={{ fontSize: 16 }} /></Col>
                      <Col span={8}><Statistic title={ap.length ? 'Actual cost' : 'Expected cost'} value={cost} precision={0} prefix={cur} valueStyle={{ fontSize: 16 }} /></Col>
                      <Col span={8}><Statistic title="Profit" value={revenue - cost} precision={0} prefix={cur} valueStyle={{ fontSize: 16, color: revenue - cost < 0 ? '#cf1322' : '#389e0d' }} /></Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'docs',
            label: <span>Documents {docs.some((d) => d.status === 'mismatch') && <Tag color="red">mismatch</Tag>}</span>,
            children: docs.length ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {docs.map((d) => (
                  <Card key={d.id} size="small" title={<Space><Tag color={DOC_TYPES[d.type].color}>{DOC_TYPES[d.type].short}</Tag>{DOC_TYPES[d.type].label}<StatusTag kind="document" status={d.status} /></Space>}>
                    <DocumentReview doc={d} shipment={s} />
                  </Card>
                ))}
              </Space>
            ) : <Empty description="No documents received yet" />,
          },
          {
            key: 'tracking',
            label: 'Tracking & customer updates',
            children: (
              <Row gutter={16}>
                <Col xs={24} lg={10}><Card size="small" title="Milestones" extra={<PollCarrierButton shipment={s} size="small" />}><MilestoneTimeline shipment={s} /></Card></Col>
                <Col xs={24} lg={14}><Card size="small" title="Customer status updates"><NotificationList shipment={s} /></Card></Col>
              </Row>
            ),
          },
          {
            key: 'finance',
            label: 'Invoicing',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={12}>
                  <Card size="small" title="AR — customer invoice" extra={!ar.length && s.cwKey && <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => run(ops.createArInvoice, { shipmentId: s.id }, { actor: ops.AI_ACTOR, success: 'AR invoice drafted from quoted rates and approved actual costs' })}>Create AR invoice</Button>}>
                    {ar.length ? ar.map((inv) => (
                      <div key={inv.id}>
                        <Space style={{ marginBottom: 8 }}><b>{inv.ref}</b><StatusTag kind="ar" status={inv.status} />{inv.cwTxnNo && <span className="fp-mono">{inv.cwTxnNo}</span>}</Space>
                        <Table size="small" rowKey={(_, i) => i} pagination={false} dataSource={inv.lines} columns={[{ title: 'Code', dataIndex: 'code', width: 60 }, { title: 'Description', dataIndex: 'desc' }, { title: 'Source', dataIndex: 'source', render: (v) => <Tag color={v === 'quote' ? 'blue' : 'orange'}>{v === 'quote' ? 'Quoted rate' : 'Actual cost'}</Tag> }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => <Money value={v} currency={inv.currency} digits={2} /> }]} summary={() => <Table.Summary.Row><Table.Summary.Cell colSpan={3}><b>Total</b></Table.Summary.Cell><Table.Summary.Cell align="right"><Money value={inv.total} currency={inv.currency} digits={2} strong /></Table.Summary.Cell></Table.Summary.Row>} />
                        {inv.status === 'pending_approval' && <div style={{ marginTop: 12 }}><ApprovalChain chain={inv.approvals} user={user} onDecide={(approve, comment) => run(ops.decide, { kind: 'arInvoice', id: inv.id, approve, comment }, { success: approve ? 'Posted to CargoWise' : 'Returned to draft' })} /></div>}
                      </div>
                    )) : <Typography.Text type="secondary">No AR invoice yet.</Typography.Text>}
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card size="small" title="AP — carrier invoices" extra={<ReceiveApButton shipment={s} size="small" />}>
                    {ap.length ? ap.map((inv) => <div key={inv.id} style={{ marginBottom: 16 }}><Space style={{ marginBottom: 6 }}><b>{inv.ref}</b><StatusTag kind="ap" status={inv.status} /><TimeAgo value={inv.receivedAt} /></Space><ApReconciliation invoice={inv} /></div>) : <Typography.Text type="secondary">No carrier invoice received yet.</Typography.Text>}
                  </Card>
                </Col>
              </Row>
            ),
          },
          { key: 'msgs', label: `eAdaptor messages (${msgs.length})`, children: <MessageLog messages={msgs} /> },
          {
            key: 'audit',
            label: 'Audit trail',
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={{ pageSize: 20 }}
                dataSource={scoped.audit.filter((a) => a.entityId === s.id || a.entityRef === s.ref || a.entityRef?.endsWith(s.ref) || a.entityRef === quote?.ref || ar.some((x) => x.id === a.entityId) || ap.some((x) => x.id === a.entityId))}
                columns={[
                  { title: 'When', dataIndex: 'at', width: 170, render: fmtDateTime },
                  { title: 'Actor', render: (a) => <Tag color={a.actorType === 'ai' ? 'purple' : a.actorType === 'system' ? 'default' : 'blue'}>{a.actor}</Tag> },
                  { title: 'Action', dataIndex: 'summary' },
                  { title: 'HITL', dataIndex: 'hitl', render: (v) => v && <StatusTag kind="hitl" status={v} /> },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
