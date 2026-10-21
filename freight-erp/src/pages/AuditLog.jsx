import { useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Descriptions, Drawer, Input, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useStore } from '../store/StoreProvider.jsx';
import { PageHeader, ActorTag, StatusTag, ConfTag, fmtDateTime, CodeViewer } from '../components/common.jsx';

export default function AuditLog() {
  const { scoped, tenant } = useStore();
  const [actorType, setActorType] = useState('ai');
  const [hitl, setHitl] = useState();
  const [entity, setEntity] = useState();
  const [range, setRange] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => scoped.audit.filter((a) =>
    (!actorType || a.actorType === actorType) &&
    (!hitl || a.hitl === hitl) &&
    (!entity || a.entityType === entity) &&
    (!range || (dayjs(a.at).isAfter(range[0].startOf('day')) && dayjs(a.at).isBefore(range[1].endOf('day')))) &&
    (!q || `${a.summary} ${a.entityRef} ${a.actor} ${a.action}`.toLowerCase().includes(q.toLowerCase()))), [scoped.audit, actorType, hitl, entity, range, q]);

  const ai = scoped.audit.filter((a) => a.actorType === 'ai');
  const exportCsv = () => {
    const head = ['timestamp', 'actor_type', 'actor', 'action', 'entity_type', 'entity_ref', 'model', 'confidence', 'hitl', 'summary'];
    const lines = rows.map((a) => [a.at, a.actorType, a.actor, a.action, a.entityType, a.entityRef, a.model || '', a.confidence ?? '', a.hitl || '', `"${String(a.summary).replace(/"/g, '""')}"`].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-${tenant.code}-${dayjs().format('YYYYMMDD')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="AI audit log" subtitle="Every AI action with model, confidence, input/output and the human decision — immutable, tenant-scoped" extra={<Button icon={<DownloadOutlined />} onClick={exportCsv}>Export CSV ({rows.length})</Button>} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="AI actions logged" value={ai.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Auto-accepted" value={ai.filter((a) => a.hitl === 'auto').length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sent to a human" value={ai.filter((a) => a.hitl === 'pending').length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Human decisions" value={scoped.audit.filter((a) => ['approved', 'rejected'].includes(a.hitl)).length} /></Card></Col>
      </Row>
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select allowClear placeholder="Actor" value={actorType} onChange={setActorType} style={{ width: 140 }} options={[{ value: 'ai', label: 'AI' }, { value: 'user', label: 'Users' }, { value: 'system', label: 'System' }]} />
          <Select allowClear placeholder="Human-in-the-loop" value={hitl} onChange={setHitl} style={{ width: 180 }} options={[{ value: 'auto', label: 'Auto' }, { value: 'pending', label: 'Needs human' }, { value: 'approved', label: 'Human approved' }, { value: 'rejected', label: 'Human rejected' }]} />
          <Select allowClear placeholder="Entity" value={entity} onChange={setEntity} style={{ width: 150 }} options={['rfq', 'quote', 'shipment', 'document', 'arInvoice', 'apInvoice', 'connector', 'tenant', 'user'].map((v) => ({ value: v, label: v }))} />
          <DatePicker.RangePicker value={range} onChange={setRange} />
          <Input.Search allowClear placeholder="Search" onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </Space>
        <Table
          rowKey="id"
          size="small"
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1100 }}
          onRow={(r) => ({ onClick: () => setOpen(r), className: 'fp-click' })}
          columns={[
            { title: 'Timestamp', dataIndex: 'at', width: 170, render: fmtDateTime },
            { title: 'Actor', width: 190, render: (a) => <ActorTag type={a.actorType} name={a.actor} /> },
            { title: 'Action', dataIndex: 'action', width: 190, render: (v) => <span className="fp-mono">{v}</span> },
            { title: 'Entity', dataIndex: 'entityRef', width: 170 },
            { title: 'Summary', dataIndex: 'summary', render: (v) => <Typography.Text ellipsis={{ tooltip: v }} style={{ maxWidth: 460 }}>{v}</Typography.Text> },
            { title: 'Conf.', dataIndex: 'confidence', width: 80, render: (v) => (v != null ? <ConfTag value={v} /> : '') },
            { title: 'HITL', dataIndex: 'hitl', width: 140, render: (v) => v && <StatusTag kind="hitl" status={v} /> },
          ]}
        />
      </Card>
      <Drawer width={Math.min(760, window.innerWidth)} open={!!open} onClose={() => setOpen(null)} title="Audit entry">
        {open && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Entry ID"><span className="fp-mono">{open.id}</span></Descriptions.Item>
              <Descriptions.Item label="Timestamp">{fmtDateTime(open.at)} ({open.at})</Descriptions.Item>
              <Descriptions.Item label="Tenant">{tenant.name} · region {tenant.region}</Descriptions.Item>
              <Descriptions.Item label="Actor"><ActorTag type={open.actorType} name={open.actor} /> {open.actorRole && open.actorType === 'user' && `(${open.actorRole})`}</Descriptions.Item>
              <Descriptions.Item label="Action"><span className="fp-mono">{open.action}</span></Descriptions.Item>
              <Descriptions.Item label="Entity">{open.entityType} · {open.entityRef}</Descriptions.Item>
              {open.model && <Descriptions.Item label="Model">{open.model}</Descriptions.Item>}
              {open.confidence != null && <Descriptions.Item label="Confidence"><ConfTag value={open.confidence} /></Descriptions.Item>}
              {open.hitl && <Descriptions.Item label="Human-in-the-loop"><StatusTag kind="hitl" status={open.hitl} /></Descriptions.Item>}
              <Descriptions.Item label="Summary">{open.summary}</Descriptions.Item>
            </Descriptions>
            {open.input && <><Typography.Title level={5} style={{ marginTop: 16 }}>Input</Typography.Title><CodeViewer format="json" body={JSON.stringify(open.input, null, 2)} /></>}
            {open.output && <><Typography.Title level={5} style={{ marginTop: 16 }}>Output</Typography.Title><CodeViewer format="json" body={JSON.stringify(open.output, null, 2)} /></>}
          </>
        )}
      </Drawer>
    </>
  );
}
