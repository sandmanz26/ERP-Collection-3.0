import { useMemo } from 'react';
import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography, Descriptions } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import { useStore } from '../store/StoreProvider.jsx';
import { PLANS, METERS } from '../lib/reference.js';
import { monthKey } from '../lib/util.js';
import { PageHeader, fmtMoney } from '../components/common.jsx';
import { SERIES } from '../components/palette.js';

export function invoiceFor(planKey, u) {
  const plan = PLANS[planKey];
  const lines = Object.keys(METERS).map((k) => {
    const used = u?.[k] || 0;
    const over = Math.max(0, used - plan.included[k]);
    return { key: k, label: METERS[k], used, included: plan.included[k], over, rate: plan.overage[k], amount: Math.round(over * plan.overage[k] * 100) / 100 };
  });
  const overage = lines.reduce((a, l) => a + l.amount, 0);
  return { plan, lines, overage, total: plan.monthly + overage };
}

export default function Usage() {
  const { scoped, tenant } = useStore();
  const months = useMemo(() => Object.keys(scoped.usage).sort(), [scoped.usage]);
  const cur = monthKey(Date.now());
  const bill = invoiceFor(tenant.plan, scoped.usage[cur]);
  const chart = months.map((m) => ({ month: dayjs(`${m}-01`).format('MMM YY'), ...Object.fromEntries(Object.keys(METERS).map((k) => [k, scoped.usage[m][k] || 0])) }));
  const dayOfMonth = dayjs().date();
  const days = dayjs().daysInMonth();

  return (
    <>
      <PageHeader title="Usage & billing" subtitle={`Metered per tenant — RFQs, documents and invoices processed. Plan: ${bill.plan.name} (USD ${bill.plan.monthly}/month)`} />
      <Row gutter={16}>
        {bill.lines.map((l) => {
          const projected = Math.round((l.used / dayOfMonth) * days);
          return (
            <Col xs={24} md={8} key={l.key}>
              <Card size="small">
                <Statistic title={`${l.label} — ${dayjs().format('MMMM')}`} value={l.used} suffix={`/ ${l.included}`} />
                <Progress percent={Math.round((l.used / l.included) * 100)} status={l.used > l.included ? 'exception' : 'normal'} showInfo={false} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Projected month-end: {projected} {projected > l.included ? <Tag color="orange">over plan by {projected - l.included}</Tag> : <Tag color="green">within plan</Tag>}
                </Typography.Text>
              </Card>
            </Col>
          );
        })}
        <Col xs={24} xl={15} style={{ marginTop: 16 }}>
          <Card size="small" title="Monthly usage (last 6 months)">
            <div style={{ height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -10 }} barGap={2}>
                  <CartesianGrid vertical={false} strokeOpacity={0.25} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <RTooltip cursor={{ fillOpacity: 0.06 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {Object.entries(METERS).map(([k, label], i) => <Bar key={k} dataKey={k} name={label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9} style={{ marginTop: 16 }}>
          <Card size="small" title={`Estimated invoice — ${dayjs().format('MMMM YYYY')}`}>
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={bill.lines}
              columns={[
                { title: 'Meter', dataIndex: 'label' },
                { title: 'Over', dataIndex: 'over', align: 'right' },
                { title: 'Rate', dataIndex: 'rate', align: 'right', render: (v) => `$${v}` },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => fmtMoney(v, 'USD', 2) },
              ]}
              summary={() => (
                <>
                  <Table.Summary.Row><Table.Summary.Cell colSpan={3}>Platform fee ({bill.plan.name})</Table.Summary.Cell><Table.Summary.Cell align="right">{fmtMoney(bill.plan.monthly, 'USD', 2)}</Table.Summary.Cell></Table.Summary.Row>
                  <Table.Summary.Row><Table.Summary.Cell colSpan={3}><b>Total (so far)</b></Table.Summary.Cell><Table.Summary.Cell align="right"><b>{fmtMoney(bill.total, 'USD', 2)}</b></Table.Summary.Cell></Table.Summary.Row>
                </>
              )}
            />
            <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
              <Descriptions.Item label="AI calls this month">{(scoped.usage[cur]?.aiCalls || 0).toLocaleString()} (not billed, for cost monitoring)</Descriptions.Item>
              <Descriptions.Item label="Billing entity">{tenant.name}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={24} style={{ marginTop: 16 }}>
          <Card size="small" title="Usage table">
            <Table
              size="small"
              rowKey="month"
              pagination={false}
              dataSource={[...months].reverse().map((m) => ({ month: m, ...scoped.usage[m], bill: invoiceFor(tenant.plan, scoped.usage[m]).total }))}
              columns={[
                { title: 'Month', dataIndex: 'month', render: (m) => dayjs(`${m}-01`).format('MMMM YYYY') },
                ...Object.entries(METERS).map(([k, label]) => ({ title: label, dataIndex: k, align: 'right' })),
                { title: 'AI calls', dataIndex: 'aiCalls', align: 'right' },
                { title: 'Billed (USD)', dataIndex: 'bill', align: 'right', render: (v) => fmtMoney(v, 'USD', 2) },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
