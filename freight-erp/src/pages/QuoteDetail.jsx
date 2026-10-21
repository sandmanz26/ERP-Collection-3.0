import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Result, Row, Select, Space, Statistic, Table, Timeline, Tooltip, Typography, Segmented } from 'antd';
import { SendOutlined, CheckOutlined, CloseOutlined, PlusOutlined, DeleteOutlined, RollbackOutlined, SaveOutlined, AuditOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { totals } from '../lib/pricing.js';
import { CHARGE_CODES } from '../lib/reference.js';
import { PageHeader, StatusTag, Money, ApprovalChain, fmtDateTime, Lane, ModeTag } from '../components/common.jsx';
import QuotePreview from '../components/QuotePreview.jsx';

const EDIT_ROLES = ['admin', 'pricing', 'manager'];
const SEND_ROLES = ['admin', 'sales', 'pricing', 'manager'];

export default function QuoteDetail() {
  const { id } = useParams();
  const { scoped, lookup, run, tenant, user } = useStore();
  const navigate = useNavigate();
  const quote = scoped.quotes.find((q) => q.id === id);
  const [lines, setLines] = useState(quote?.lines || []);
  const [dirty, setDirty] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('Price');
  const [channel, setChannel] = useState('email');
  useEffect(() => {
    setLines(quote?.lines || []);
    setDirty(false);
  }, [quote?.lines]);
  if (!quote) return <Result status="404" title="Quote not found in this tenant" extra={<Button onClick={() => navigate('/quotes')}>Back</Button>} />;

  const rfq = lookup.rfq(quote.rfqId);
  const customer = lookup.customer(quote.customerId);
  const template = tenant.settings.quoteTemplates.find((t) => t.id === quote.templateId) || tenant.settings.quoteTemplates[0];
  const editable = quote.status === 'draft' && EDIT_ROLES.includes(user.role);
  const live = editable ? { ...quote, lines, ...totals(lines) } : quote;
  const rule = tenant.settings.marginRules.find((r) => r.id === quote.ruleId);

  const setLine = (i, patch) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const accept = () => {
    const s = run(ops.customerDecision, { quoteId: quote.id, accepted: true }, { success: (x) => (x.status === 'booked' ? `Shipment ${x.ref} created and pushed to CargoWise (${x.cwKey})` : `Shipment ${x.ref} created — booking awaits ops confirmation`) });
    if (s) navigate(`/shipments/${s.id}`);
  };

  return (
    <>
      <PageHeader
        title={<Space>{quote.ref}<StatusTag kind="quote" status={quote.status} /></Space>}
        subtitle={<span>{customer?.name} · from <Link to={`/rfqs/${quote.rfqId}`}>{rfq?.ref}</Link> · {rfq?.data && <Lane origin={rfq.data.origin} destination={rfq.data.destination} />} <ModeTag mode={rfq?.data?.mode} /></span>}
        extra={[
          quote.status === 'draft' && (
            <Tooltip key="s" title={dirty ? 'Save your line changes first' : ''}>
              <Button type="primary" icon={<AuditOutlined />} disabled={dirty || !EDIT_ROLES.includes(user.role)} onClick={() => run(ops.submitQuote, { quoteId: quote.id }, { success: 'Submitted to the approval workflow' })}>Submit for approval</Button>
            </Tooltip>
          ),
          ['pending_approval', 'approved'].includes(quote.status) && <Button key="w" icon={<RollbackOutlined />} onClick={() => run(ops.withdrawQuote, { quoteId: quote.id })}>Withdraw to draft</Button>,
          quote.status === 'approved' && (
            <Space.Compact key="send">
              <Select value={channel} onChange={setChannel} style={{ width: 120 }} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
              <Button type="primary" icon={<SendOutlined />} disabled={!SEND_ROLES.includes(user.role)} onClick={() => run(ops.sendQuote, { quoteId: quote.id, channel }, { success: `Quote sent to ${customer?.name}` })}>Send to customer</Button>
            </Space.Compact>
          ),
          quote.status === 'sent' && <Button key="a" type="primary" icon={<CheckOutlined />} onClick={accept}>Customer accepted</Button>,
          quote.status === 'sent' && <Button key="r" danger icon={<CloseOutlined />} onClick={() => setRejectOpen(true)}>Customer rejected</Button>,
          quote.shipmentId && <Button key="sh" onClick={() => navigate(`/shipments/${quote.shipmentId}`)}>Open shipment</Button>,
        ]}
      />
      {quote.rejectionNote && quote.status === 'draft' && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={`Returned by approver: “${quote.rejectionNote}”`} />}
      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card size="small" title="Pricing" extra={editable && dirty && <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => run(ops.updateQuoteLines, { quoteId: quote.id, lines }, { success: 'Lines saved' })}>Save lines</Button>}>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}><Statistic title="Buy" value={live.buyTotal} precision={2} prefix={quote.currency} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={6}><Statistic title="Sell" value={live.sellTotal} precision={2} prefix={quote.currency} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={6}><Statistic title="Profit" value={live.profit} precision={2} prefix={quote.currency} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={6}><Statistic title="Margin" value={live.marginPct} suffix="%" valueStyle={{ fontSize: 18, color: live.marginPct < 8 ? '#cf1322' : '#389e0d' }} /></Col>
            </Row>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={<span>Margin rule applied: <b>{quote.ruleName}</b>{rule && <> — markup {rule.markupPct}%, min. profit {quote.currency} {rule.minProfit}, rounding {rule.roundTo || 'none'}</>}{quote.toppedUp > 0 && <> · freight topped up by {quote.currency} {quote.toppedUp} to meet minimum profit</>}</span>}
            />
            <Table
              size="small"
              rowKey={(_, i) => i}
              pagination={false}
              dataSource={live.lines}
              scroll={{ x: 640 }}
              columns={[
                { title: 'Code', dataIndex: 'code', width: 70, render: (v, l, i) => (editable ? <Select size="small" value={v} style={{ width: 90 }} popupMatchSelectWidth={260} onChange={(c) => setLine(i, { code: c, desc: CHARGE_CODES[c] })} options={Object.entries(CHARGE_CODES).map(([value, label]) => ({ value, label: `${value} — ${label}` }))} /> : v) },
                { title: 'Charge', dataIndex: 'desc', render: (v, l, i) => (editable ? <Input size="small" value={v} onChange={(e) => setLine(i, { desc: e.target.value })} /> : <span>{v}{l.fixedFee && <span className="fp-muted"> (fixed fee)</span>}</span>) },
                { title: 'Buy', dataIndex: 'buy', align: 'right', width: 120, render: (v, l, i) => (editable ? <InputNumber size="small" value={v} min={0} onChange={(x) => setLine(i, { buy: x || 0 })} style={{ width: 110 }} /> : <Money value={v} currency={quote.currency} digits={2} />) },
                { title: 'Markup', dataIndex: 'markupPct', align: 'right', width: 80, render: (v, l) => (l.buy ? `${Math.round(((l.sell - l.buy) / l.buy) * 1000) / 10}%` : '—') },
                { title: 'Sell', dataIndex: 'sell', align: 'right', width: 130, render: (v, l, i) => (editable ? <InputNumber size="small" value={v} min={0} onChange={(x) => setLine(i, { sell: x || 0 })} style={{ width: 120 }} /> : <Money value={v} currency={quote.currency} digits={2} strong />) },
                editable ? { title: '', width: 40, render: (_, __, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true); }} /> } : null,
              ].filter(Boolean)}
              footer={editable ? () => <Button size="small" icon={<PlusOutlined />} onClick={() => { setLines((ls) => [...ls, { code: 'HDL', desc: CHARGE_CODES.HDL, buy: 0, sell: 0 }]); setDirty(true); }}>Add charge</Button> : undefined}
            />
          </Card>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title="Approval workflow">
                {(quote.status !== 'draft' || quote.approvals.length > 0) && <ApprovalChain chain={quote.approvals} user={user} onDecide={quote.status === 'pending_approval' ? (approve, comment) => run(ops.decide, { kind: 'quote', id: quote.id, approve, comment }, { success: approve ? 'Approved' : 'Rejected — quote returned to draft' }) : null} />}
                {quote.status === 'draft' && !quote.approvals.length && <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>Steps are computed on submit from the tenant's workflow (margin, value, customer tier, DG).</Typography.Paragraph>}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="History">
                <Timeline items={[...quote.history].reverse().map((h) => ({ children: <div><div>{h.text}</div><div className="fp-muted" style={{ fontSize: 12 }}>{h.by} · {fmtDateTime(h.at)}</div></div> }))} />
              </Card>
            </Col>
          </Row>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            size="small"
            title="Customer preview"
            extra={
              <Select
                size="small"
                value={quote.templateId}
                disabled={!['draft', 'pending_approval', 'approved'].includes(quote.status)}
                onChange={(templateId) => run(ops.setQuoteTemplate, { quoteId: quote.id, templateId })}
                style={{ width: 190 }}
                options={tenant.settings.quoteTemplates.map((t) => ({ value: t.id, label: t.name }))}
              />
            }
          >
            <QuotePreview quote={live} template={template} tenant={tenant} customer={customer} rfq={rfq} />
          </Card>
        </Col>
      </Row>
      <Modal title="Record customer rejection" open={rejectOpen} onCancel={() => setRejectOpen(false)} okButtonProps={{ danger: true }} okText="Mark as lost" onOk={() => { run(ops.customerDecision, { quoteId: quote.id, accepted: false, reason }); setRejectOpen(false); }}>
        <Typography.Paragraph>Lost reason (used in win/loss analysis):</Typography.Paragraph>
        <Segmented block value={reason} onChange={setReason} options={['Price', 'Transit time', 'Customer chose another forwarder', 'Shipment cancelled']} />
      </Modal>
    </>
  );
}
