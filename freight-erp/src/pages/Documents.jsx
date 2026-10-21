import { useMemo, useState } from 'react';
import { Card, Col, Drawer, Row, Select, Space, Statistic, Table, Tag, Typography, Button } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { DOC_TYPES } from '../lib/validation.js';
import { PageHeader, StatusTag, ConfTag, TimeAgo, statusOptions } from '../components/common.jsx';
import { DocumentReview } from '../components/ExecutionPanels.jsx';

export default function Documents() {
  const { scoped, lookup } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState();
  const [status, setStatus] = useState(params.get('doc') ? undefined : 'mismatch');
  const openId = params.get('doc');
  const rows = useMemo(() => scoped.documents.filter((d) => (!type || d.type === type) && (!status || d.status === status)), [scoped.documents, type, status]);
  const openDoc = scoped.documents.find((d) => d.id === openId);
  const total = scoped.documents.length;
  const clean = scoped.documents.filter((d) => d.status === 'validated').length;
  const openIssues = scoped.documents.flatMap((d) => d.issues.filter((i) => i.status === 'open'));

  return (
    <>
      <PageHeader title="Documents" subtitle="Commercial invoices, packing lists and bills of lading — read by AI and validated against the shipment record" />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Documents processed" value={total} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Validated without issues" value={total ? Math.round((clean / total) * 100) : 0} suffix="%" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Open mismatches" value={openIssues.length} valueStyle={{ color: openIssues.length ? '#cf1322' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="High severity open" value={openIssues.filter((i) => i.severity === 'high').length} /></Card></Col>
      </Row>
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select allowClear placeholder="Document type" value={type} onChange={setType} style={{ width: 200 }} options={Object.entries(DOC_TYPES).map(([value, d]) => ({ value, label: d.label }))} />
          <Select allowClear placeholder="Status" value={status} onChange={setStatus} style={{ width: 200 }} options={statusOptions('document')} />
          <Typography.Text type="secondary">{rows.length} document(s)</Typography.Text>
        </Space>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 900 }}
          onRow={(r) => ({ onClick: () => setParams({ doc: r.id }), className: 'fp-click' })}
          columns={[
            { title: 'Type', dataIndex: 'type', width: 160, render: (v) => <Tag color={DOC_TYPES[v].color}>{DOC_TYPES[v].label}</Tag> },
            { title: 'File', dataIndex: 'fileName', render: (v) => <span className="fp-mono">{v}</span> },
            { title: 'Shipment', render: (d) => { const s = lookup.shipment(d.shipmentId); return <div><b>{s?.ref}</b><div className="fp-muted" style={{ fontSize: 12 }}>{lookup.customer(s?.customerId)?.name}</div></div>; } },
            { title: 'Received', dataIndex: 'receivedAt', render: (v) => <TimeAgo value={v} /> },
            { title: 'Read confidence', dataIndex: 'confidence', render: (v) => <ConfTag value={v} /> },
            { title: 'Issues', render: (d) => (d.issues.length ? d.issues.map((i) => <Tag key={i.field} color={i.status === 'open' ? { high: 'red', medium: 'orange', low: 'gold' }[i.severity] : 'default'}>{i.label}</Tag>) : <Tag color="green">none</Tag>) },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="document" status={v} /> },
          ]}
        />
      </Card>
      <Drawer
        width={Math.min(1000, window.innerWidth)}
        open={!!openDoc}
        onClose={() => setParams({})}
        title={openDoc && <Space><Tag color={DOC_TYPES[openDoc.type].color}>{DOC_TYPES[openDoc.type].short}</Tag>{lookup.shipment(openDoc.shipmentId)?.ref}<StatusTag kind="document" status={openDoc.status} /></Space>}
        extra={openDoc && <Button onClick={() => navigate(`/shipments/${openDoc.shipmentId}`)}>Open shipment</Button>}
      >
        {openDoc && <DocumentReview doc={openDoc} shipment={lookup.shipment(openDoc.shipmentId)} />}
      </Drawer>
    </>
  );
}
