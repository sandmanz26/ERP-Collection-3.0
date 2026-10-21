import { useMemo, useState } from 'react';
import { Card, Input, Select, Space, Table, Typography, Row, Col, Statistic } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { PageHeader, StatusTag, Money, Lane, ModeTag, TimeAgo, statusOptions, fmtMoney } from '../components/common.jsx';

export default function Quotes() {
  const { scoped, lookup, tenant } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    let r = scoped.quotes;
    if (status !== 'all') r = r.filter((x) => x.status === status);
    if (q) r = r.filter((x) => `${x.ref} ${lookup.customer(x.customerId)?.name} ${lookup.partner(x.partnerId)?.name}`.toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [scoped.quotes, status, q, lookup]);

  const open = scoped.quotes.filter((x) => ['draft', 'pending_approval', 'approved', 'sent'].includes(x.status));
  const decided = scoped.quotes.filter((x) => ['accepted', 'rejected'].includes(x.status));
  return (
    <>
      <PageHeader title="Quotations" subtitle="Sell rates calculated from each tenant's margin rules, rendered in their template, approved by staff" />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Open quotes" value={open.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Open pipeline value" value={fmtMoney(open.reduce((a, x) => a + x.sellTotal, 0), tenant.currency)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Hit rate" value={decided.length ? Math.round((decided.filter((x) => x.status === 'accepted').length / decided.length) * 100) : 0} suffix="%" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Avg. margin (all quotes)" value={scoped.quotes.length ? (scoped.quotes.reduce((a, x) => a + x.marginPct, 0) / scoped.quotes.length).toFixed(1) : 0} suffix="%" /></Card></Col>
      </Row>
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select value={status} onChange={setStatus} style={{ width: 200 }} options={[{ value: 'all', label: 'All statuses' }, ...statusOptions('quote')]} />
          <Input.Search allowClear placeholder="Search ref, customer, partner" onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
          <Typography.Text type="secondary">{rows.length} quote(s)</Typography.Text>
        </Space>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          onRow={(r) => ({ onClick: () => navigate(`/quotes/${r.id}`), className: 'fp-click' })}
          columns={[
            { title: 'Quote', dataIndex: 'ref', render: (v, r) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={r.createdAt} /></div></div> },
            { title: 'Customer', render: (r) => lookup.customer(r.customerId)?.name },
            { title: 'Lane', render: (r) => { const d = lookup.rfq(r.rfqId)?.data; return d ? <Lane origin={d.origin} destination={d.destination} short /> : '—'; } },
            { title: 'Mode', render: (r) => <ModeTag mode={lookup.rfq(r.rfqId)?.data?.mode} /> },
            { title: 'Carrier / agent', render: (r) => lookup.partner(r.partnerId)?.name },
            { title: 'Buy', align: 'right', render: (r) => <Money value={r.buyTotal} currency={r.currency} /> },
            { title: 'Sell', align: 'right', sorter: (a, b) => a.sellTotal - b.sellTotal, render: (r) => <Money value={r.sellTotal} currency={r.currency} strong /> },
            { title: 'Margin', dataIndex: 'marginPct', align: 'right', sorter: (a, b) => a.marginPct - b.marginPct, render: (v) => <span style={{ color: v < 8 ? '#cf1322' : undefined }}>{v}%</span> },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="quote" status={v} /> },
          ]}
        />
      </Card>
    </>
  );
}
