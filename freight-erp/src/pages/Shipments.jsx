import { useMemo, useState } from 'react';
import { Card, Input, Select, Space, Table, Typography, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { PageHeader, StatusTag, Lane, ModeTag, fmtDate, statusOptions, Money } from '../components/common.jsx';

export default function Shipments() {
  const { scoped, lookup } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    let r = scoped.shipments;
    if (status !== 'all') r = r.filter((x) => x.status === status);
    if (q) r = r.filter((x) => `${x.ref} ${x.cwKey} ${x.containerNo} ${lookup.customer(x.customerId)?.name} ${x.shipper} ${x.consignee}`.toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [scoped.shipments, status, q, lookup]);

  return (
    <>
      <PageHeader title="Shipments" subtitle="Bookings created in CargoWise from accepted quotes" />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select value={status} onChange={setStatus} style={{ width: 200 }} options={[{ value: 'all', label: 'All statuses' }, ...statusOptions('shipment')]} />
          <Input.Search allowClear placeholder="Ref, CW key, container, customer" onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
          <Typography.Text type="secondary">{rows.length} shipment(s)</Typography.Text>
        </Space>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 1100 }}
          onRow={(r) => ({ onClick: () => navigate(`/shipments/${r.id}`), className: 'fp-click' })}
          columns={[
            { title: 'Shipment', render: (s) => <div><b>{s.ref}</b><div className="fp-mono fp-muted">{s.cwKey || 'not in CW yet'}</div></div> },
            { title: 'Customer', render: (s) => lookup.customer(s.customerId)?.name },
            { title: 'Lane', render: (s) => <Lane origin={s.origin} destination={s.destination} short /> },
            { title: 'Mode', render: (s) => <div><ModeTag mode={s.mode} />{s.containerType && <div className="fp-muted" style={{ fontSize: 12 }}>{s.containerCount}×{s.containerType}</div>}</div> },
            { title: 'Carrier', render: (s) => lookup.partner(s.partnerId)?.name },
            { title: 'ETD / ETA', render: (s) => <span style={{ fontSize: 12.5 }}>{fmtDate(s.etd)}<br />{fmtDate(s.eta)}</span> },
            { title: 'Progress', width: 140, render: (s) => <Progress size="small" percent={Math.round((s.milestones.filter((m) => m.actual).length / s.milestones.length) * 100)} /> },
            { title: 'Docs', render: (s) => { const docs = scoped.documents.filter((d) => d.shipmentId === s.id); const bad = docs.filter((d) => d.status === 'mismatch').length; return docs.length ? <Tag color={bad ? 'red' : 'green'}>{docs.length} {bad ? `· ${bad} mismatch` : 'ok'}</Tag> : '—'; } },
            { title: 'Revenue', align: 'right', render: (s) => <Money value={s.sellLines.reduce((a, l) => a + l.sell, 0)} currency={lookup.quote(s.quoteId)?.currency} /> },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="shipment" status={v} /> },
          ]}
        />
      </Card>
    </>
  );
}
