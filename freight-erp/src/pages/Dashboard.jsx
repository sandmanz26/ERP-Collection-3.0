import { useMemo } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, List, Button, Space, Progress, Empty } from 'antd';
import { RobotOutlined, ArrowRightOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import { useStore } from '../store/StoreProvider.jsx';
import { PageHeader, ActorTag, TimeAgo, StatusTag, RoleTag, fmtMoney, Lane, ModeTag } from '../components/common.jsx';
import { pendingItems, KIND_LABELS } from '../lib/inbox.js';
import { CHANNELS, MODES, PLANS, METERS } from '../lib/reference.js';
import { monthKey } from '../lib/util.js';
import { SERIES } from '../components/palette.js';

// Channels take categorical slots 1-4 in fixed order.
const CHANNEL_COLOR = { email: SERIES[0], pdf: SERIES[1], excel: SERIES[2], whatsapp: SERIES[3] };

const FUNNEL = [
  ['RFQs received', (s) => s.rfqs.length],
  ['Extracted', (s) => s.rfqs.filter((r) => r.extraction).length],
  ['Rates requested', (s) => s.rfqs.filter((r) => r.rateRequests.length).length],
  ['Quoted', (s) => s.quotes.length],
  ['Won / booked', (s) => s.shipments.length],
  ['Invoiced', (s) => new Set(s.arInvoices.map((a) => a.shipmentId)).size],
];

export default function Dashboard() {
  const { tenant, scoped, lookup, user } = useStore();
  const navigate = useNavigate();
  const cur = tenant.currency;

  const k = useMemo(() => {
    const won = scoped.rfqs.filter((r) => r.status === 'won').length;
    const lost = scoped.rfqs.filter((r) => r.status === 'lost').length;
    const accepted = scoped.quotes.filter((q) => q.status === 'accepted');
    const aiEntries = scoped.audit.filter((a) => a.actorType === 'ai');
    const auto = aiEntries.filter((a) => a.hitl === 'auto').length;
    const thisMonth = monthKey(Date.now());
    return {
      openRfqs: scoped.rfqs.filter((r) => ['new', 'review', 'ready', 'sourcing', 'rates_in'].includes(r.status)).length,
      winRate: won + lost ? Math.round((won / (won + lost)) * 100) : 0,
      active: scoped.shipments.filter((s) => ['booked', 'in_transit', 'arrived'].includes(s.status)).length,
      avgMargin: accepted.length ? Math.round((accepted.reduce((a, q) => a + q.marginPct, 0) / accepted.length) * 10) / 10 : 0,
      gp: accepted.reduce((a, q) => a + q.profit, 0),
      mismatches: scoped.documents.filter((d) => d.status === 'mismatch').length,
      apVariance: scoped.apInvoices.filter((a) => a.status === 'variance').reduce((s, a) => s + a.recon.variance, 0),
      arPosted: scoped.arInvoices.filter((a) => a.status === 'posted' && monthKey(new Date(a.postedAt).getTime()) === thisMonth).reduce((s, a) => s + a.total, 0),
      automation: aiEntries.length ? Math.round((auto / aiEntries.length) * 100) : 0,
      aiCount: aiEntries.length,
    };
  }, [scoped]);

  const weekly = useMemo(() => {
    const weeks = [];
    for (let i = 11; i >= 0; i -= 1) {
      const start = dayjs().startOf('week').subtract(i, 'week');
      const row = { week: start.format('DD MMM') };
      for (const ch of Object.keys(CHANNELS)) row[ch] = 0;
      weeks.push({ start, end: start.add(1, 'week'), row });
    }
    for (const r of scoped.rfqs) {
      const t = dayjs(r.receivedAt);
      const w = weeks.find((x) => !t.isBefore(x.start) && t.isBefore(x.end));
      if (w) w.row[r.channel] += 1;
    }
    return weeks.map((w) => w.row);
  }, [scoped.rfqs]);

  const byMode = useMemo(() => {
    const m = {};
    for (const q of scoped.quotes.filter((x) => x.status === 'accepted')) {
      const rfq = lookup.rfq(q.rfqId);
      const mode = rfq?.data?.mode || 'SEA_FCL';
      m[mode] = (m[mode] || 0) + q.profit;
    }
    return Object.entries(m).map(([mode, profit]) => ({ mode: MODES[mode].label, profit: Math.round(profit) }));
  }, [scoped.quotes, lookup]);

  const pending = useMemo(() => pendingItems(scoped, lookup), [scoped, lookup]);
  const mine = pending.filter((p) => p.role === user.role || user.role === 'admin');
  const funnelMax = FUNNEL[0][1](scoped) || 1;
  const plan = PLANS[tenant.plan];
  const usage = scoped.usage[monthKey(Date.now())] || {};

  return (
    <>
      <PageHeader
        title={`Good ${dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        subtitle={`${tenant.name} · ${tenant.city} · operating currency ${cur}`}
        extra={<Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/approvals')}>{mine.length} item(s) waiting for you</Button>}
      />
      <Row gutter={[16, 16]}>
        {[
          ['Open RFQs', k.openRfqs, null, '/rfqs'],
          ['Win rate (quoted)', `${k.winRate}%`, null, '/quotes'],
          ['Active shipments', k.active, null, '/shipments'],
          ['Avg. margin on won quotes', `${k.avgMargin}%`, null, '/quotes'],
          ['Gross profit booked', fmtMoney(k.gp, cur), null, '/quotes'],
          ['AR posted this month', fmtMoney(k.arPosted, cur), null, '/invoicing'],
          ['Document mismatches', k.mismatches, k.mismatches ? 'warn' : null, '/documents'],
          ['Open AP variance', fmtMoney(k.apVariance, cur), k.apVariance ? 'warn' : null, '/invoicing?tab=ap'],
        ].map(([title, value, warn, link]) => (
          <Col xs={12} md={8} xl={6} key={title}>
            <Card size="small" hoverable onClick={() => navigate(link)} className="fp-kpi">
              <Statistic title={<span>{warn && <WarningOutlined style={{ color: '#fa541c', marginRight: 4 }} />}{title}</span>} value={value} />
            </Card>
          </Col>
        ))}

        <Col xs={24} xl={14}>
          <Card title="RFQ intake by channel (last 12 weeks)" size="small">
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={weekly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.25} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <RTooltip cursor={{ fillOpacity: 0.06 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {Object.keys(CHANNELS).map((ch, i, arr) => (
                    <Bar key={ch} dataKey={ch} name={CHANNELS[ch].label} stackId="a" fill={CHANNEL_COLOR[ch]} stroke="var(--fp-surface, #fff)" strokeWidth={1} radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="RFQ → invoice funnel" size="small" extra={<Typography.Text type="secondary">all time</Typography.Text>}>
            {FUNNEL.map(([label, fn], i) => {
              const v = fn(scoped);
              return (
                <div className="fp-funnel-row" key={label}>
                  <div style={{ width: 120, fontSize: 12.5 }}>{label}</div>
                  <div style={{ flex: 1 }}>
                    <div className="fp-funnel-bar" style={{ width: `${Math.max(6, (v / funnelMax) * 100)}%`, background: SERIES[0], opacity: 1 - i * 0.11 }}>{v}</div>
                  </div>
                  <div style={{ width: 44, textAlign: 'right', fontSize: 12 }} className="fp-muted">{i ? `${Math.round((v / funnelMax) * 100)}%` : ''}</div>
                </div>
              );
            })}
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="Waiting for a human" size="small" extra={<Button type="link" onClick={() => navigate('/approvals')}>Open approvals</Button>}>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              dataSource={pending.slice(0, 7)}
              scroll={{ x: 520 }}
              locale={{ emptyText: <Empty description="Nothing waiting" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              onRow={(r) => ({ onClick: () => navigate(r.link), className: 'fp-click' })}
              columns={[
                { title: 'Type', dataIndex: 'kind', width: 130, render: (v) => <Tag color={KIND_LABELS[v].color}>{KIND_LABELS[v].label}</Tag> },
                { title: 'Item', render: (r) => <div><b>{r.ref}</b> <span className="fp-muted">· {r.title}</span></div> },
                { title: 'Role', dataIndex: 'role', width: 140, responsive: ['md'], render: (v) => <RoleTag role={v} /> },
                { title: 'Since', dataIndex: 'since', width: 110, render: (v) => <TimeAgo value={v} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title={<Space><RobotOutlined /> AI automation</Space>} size="small">
            <Row gutter={16} align="middle">
              <Col span={10} style={{ textAlign: 'center' }}>
                <Progress type="dashboard" percent={k.automation} size={120} strokeColor={SERIES[0]} />
                <div className="fp-muted" style={{ fontSize: 12 }}>of {k.aiCount} AI actions needed no human touch</div>
              </Col>
              <Col span={14}>
                <Typography.Text strong>Gross profit by mode (won)</Typography.Text>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer>
                    <BarChart data={byMode} layout="vertical" margin={{ left: 10, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="mode" width={70} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <RTooltip formatter={(v) => fmtMoney(v, cur)} cursor={{ fillOpacity: 0.06 }} />
                      <Bar dataKey="profit" name="Gross profit" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Plan usage this month ({plan.name})</Typography.Text>
              {Object.entries(METERS).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 170, fontSize: 12 }}>{label}</span>
                  <Progress percent={Math.round(((usage[key] || 0) / plan.included[key]) * 100)} size="small" status={(usage[key] || 0) > plan.included[key] ? 'exception' : 'normal'} format={() => `${usage[key] || 0}/${plan.included[key]}`} style={{ flex: 1, margin: 0 }} />
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="Shipments in flight" size="small" extra={<Button type="link" onClick={() => navigate('/tracking')}>Tracking board</Button>}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={scoped.shipments.filter((s) => ['booked', 'in_transit', 'arrived'].includes(s.status)).slice(0, 6)}
              scroll={{ x: 520 }}
              onRow={(r) => ({ onClick: () => navigate(`/shipments/${r.id}`), className: 'fp-click' })}
              columns={[
                { title: 'Shipment', render: (s) => <div><b>{s.ref}</b><div className="fp-mono fp-muted">{s.cwKey}</div></div> },
                { title: 'Lane', render: (s) => <Lane origin={s.origin} destination={s.destination} short /> },
                { title: 'Mode', dataIndex: 'mode', responsive: ['md'], render: (m) => <ModeTag mode={m} /> },
                { title: 'ETA', dataIndex: 'eta', render: (v) => dayjs(v).format('DD MMM') },
                { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="shipment" status={v} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Latest AI actions" size="small" extra={<Button type="link" onClick={() => navigate('/audit')}>Audit log</Button>}>
            <List
              size="small"
              dataSource={scoped.audit.filter((a) => a.actorType === 'ai').slice(0, 7)}
              renderItem={(a) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space size={4} wrap><ActorTag type="ai" name={a.entityRef} />{a.hitl && <StatusTag kind="hitl" status={a.hitl} />}<span className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={a.at} /></span></Space>}
                    description={<span style={{ fontSize: 12.5 }}>{a.summary}</span>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        All figures are scoped to <b>{tenant.name}</b> — switch tenant in the top bar to see another forwarder's isolated data.
      </Typography.Paragraph>
    </>
  );
}
