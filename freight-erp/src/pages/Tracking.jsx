import { useMemo, useState } from 'react';
import { Button, Card, Col, Drawer, Row, Segmented, Space, Steps, Table, Tag, Tooltip, Typography, Statistic, Alert } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { PageHeader, StatusTag, Lane, ModeTag, fmtDate } from '../components/common.jsx';
import { MilestoneTimeline, NotificationList, PollCarrierButton } from '../components/ExecutionPanels.jsx';

export default function Tracking() {
  const { scoped, lookup, runAsync, tenant } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('active');
  const [polling, setPolling] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => scoped.shipments.filter((s) => s.cwKey && (filter === 'all' || (filter === 'active' ? ['booked', 'in_transit', 'arrived'].includes(s.status) : filter === 'late' ? s.milestones.some((m) => !m.actual && m.planned < today) : s.notifications.some((n) => n.status === 'draft')))), [scoped.shipments, filter, today]);
  const open = scoped.shipments.find((s) => s.id === params.get('shipment'));
  const late = scoped.shipments.filter((s) => s.cwKey && s.status !== 'delivered' && s.milestones.some((m) => !m.actual && m.planned < today));
  const drafts = scoped.shipments.flatMap((s) => s.notifications.filter((n) => n.status === 'draft'));
  const sentToday = scoped.shipments.flatMap((s) => s.notifications.filter((n) => n.sentAt?.slice(0, 10) === today));

  const pollAll = async () => {
    setPolling(true);
    const candidates = scoped.shipments.filter((s) => ['booked', 'in_transit', 'arrived'].includes(s.status)).slice(0, 4);
    for (const s of candidates) {
      const next = s.milestones.find((m) => !m.actual);
      if (next) await runAsync(ops.recordMilestone, { shipmentId: s.id, code: next.code }, { actor: ops.SYSTEM_ACTOR, latency: 350 });
    }
    setPolling(false);
  };

  return (
    <>
      <PageHeader
        title="Tracking"
        subtitle="Milestones from carriers (Universal Event / DCSA) and customer status updates"
        extra={<Button type="primary" icon={<ThunderboltOutlined />} loading={polling} onClick={pollAll}>Poll carrier updates</Button>}
      />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Active shipments" value={scoped.shipments.filter((s) => ['booked', 'in_transit', 'arrived'].includes(s.status)).length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="With overdue milestone" value={late.length} valueStyle={{ color: late.length ? '#cf1322' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Updates awaiting review" value={drafts.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Updates sent today" value={sentToday.length} /></Card></Col>
      </Row>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={tenant.settings.tracking.autoNotify ? `Customer updates are sent automatically on: ${tenant.settings.tracking.notifyOn.join(', ')}` : `Customer updates on ${tenant.settings.tracking.notifyOn.join(', ')} are drafted by AI and reviewed before sending (change in Settings → Workflows).`}
      />
      <Card size="small">
        <Segmented style={{ marginBottom: 12 }} value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Active' }, { value: 'late', label: 'Overdue' }, { value: 'drafts', label: 'Updates to review' }, { value: 'all', label: 'All booked' }]} />
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 1100 }}
          onRow={(r) => ({ onClick: () => setParams({ shipment: r.id }), className: 'fp-click' })}
          columns={[
            { title: 'Shipment', render: (s) => <div><b>{s.ref}</b><div className="fp-mono fp-muted">{s.cwKey}</div></div> },
            { title: 'Customer', render: (s) => lookup.customer(s.customerId)?.name },
            { title: 'Lane', render: (s) => <div><Lane origin={s.origin} destination={s.destination} short /><div><ModeTag mode={s.mode} /></div></div> },
            {
              title: 'Milestones',
              width: 380,
              render: (s) => (
                <Steps
                  size="small"
                  progressDot
                  current={s.milestones.filter((m) => m.actual).length - 1}
                  items={s.milestones.map((m) => ({ title: <Tooltip title={`${m.name} · planned ${fmtDate(m.planned)}${m.actual ? ` · actual ${fmtDate(m.actual)}` : ''}`}><span style={{ fontSize: 11 }}>{m.code}</span></Tooltip>, status: m.actual ? 'finish' : m.planned < today ? 'error' : 'wait' }))}
                />
              ),
            },
            { title: 'ETA', dataIndex: 'eta', render: fmtDate },
            { title: 'Updates', render: (s) => { const d = s.notifications.filter((n) => n.status === 'draft').length; return d ? <Tag color="orange">{d} to review</Tag> : <Tag>{s.notifications.filter((n) => n.status === 'sent').length} sent</Tag>; } },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="shipment" status={v} /> },
          ]}
        />
      </Card>
      <Drawer width={Math.min(900, window.innerWidth)} open={!!open} onClose={() => setParams({})} title={open && <Space>{open.ref}<StatusTag kind="shipment" status={open.status} /></Space>} extra={open && <Space><PollCarrierButton shipment={open} /><Button onClick={() => navigate(`/shipments/${open.id}`)}>Open shipment</Button></Space>}>
        {open && (
          <Row gutter={16}>
            <Col xs={24} md={10}><Typography.Title level={5}>Milestones</Typography.Title><MilestoneTimeline shipment={open} /></Col>
            <Col xs={24} md={14}><Typography.Title level={5}>Customer updates</Typography.Title><NotificationList shipment={open} /></Col>
          </Row>
        )}
      </Drawer>
    </>
  );
}
