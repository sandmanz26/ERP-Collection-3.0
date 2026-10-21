import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Popover, Result, Row, Select, Space, Steps, Switch, Table, Tag, Tooltip, Typography, AutoComplete, Empty } from 'antd';
import { RobotOutlined, SendOutlined, CheckOutlined, TrophyOutlined, ThunderboltOutlined, ClockCircleOutlined, MailOutlined, WhatsAppOutlined, FilePdfOutlined, FileExcelOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { makeReply } from '../lib/simulate.js';
import { compareRates } from '../lib/pricing.js';
import { FIELD_LABELS } from '../lib/extract.js';
import { PORTS, MODES, CONTAINER_TYPES, INCOTERMS, COMMODITIES, portName } from '../lib/reference.js';
import { mathRng } from '../lib/util.js';
import { PageHeader, StatusTag, ChannelTag, ConfTag, Money, TimeAgo, fmtDate, fmtMoney, ModeTag, Lane, fmtDateTime } from '../components/common.jsx';
import { SERIES } from '../components/palette.js';

const STEP_ORDER = ['new', 'review', 'ready', 'sourcing', 'rates_in', 'quoted', 'won'];
const REVIEW_ROLES = ['admin', 'pricing', 'sales', 'manager'];

function SourceMessage({ rfq, customer }) {
  const raw = rfq.raw;
  const icon = { email: <MailOutlined />, whatsapp: <WhatsAppOutlined />, pdf: <FilePdfOutlined />, excel: <FileExcelOutlined /> }[rfq.channel];
  return (
    <Card size="small" title={<Space>{icon} Original message</Space>} extra={<ChannelTag channel={rfq.channel} />}>
      <Descriptions size="small" column={1} style={{ marginBottom: 8 }}>
        <Descriptions.Item label="From">{raw.from || customer?.email} <span className="fp-muted">({customer?.name})</span></Descriptions.Item>
        <Descriptions.Item label="Subject">{rfq.subject}</Descriptions.Item>
        {raw.fileName && <Descriptions.Item label="Attachment"><Tag icon={icon}>{raw.fileName}</Tag></Descriptions.Item>}
        <Descriptions.Item label="Received">{fmtDateTime(rfq.receivedAt)}</Descriptions.Item>
      </Descriptions>
      {rfq.channel === 'whatsapp' && <div className="fp-wa">{raw.body}</div>}
      {rfq.channel === 'email' && <pre className="fp-raw">{raw.body}</pre>}
      {rfq.channel === 'pdf' && <pre className="fp-raw">{raw.text}</pre>}
      {rfq.channel === 'excel' && (raw.rows ? (
        <Table size="small" pagination={false} scroll={{ x: true }} rowKey={(_, i) => i} dataSource={raw.rows} columns={Object.keys(raw.rows[0]).map((k) => ({ title: k, dataIndex: k }))} />
      ) : <pre className="fp-raw">{raw.text}</pre>)}
    </Card>
  );
}

function ExtractionReview({ rfq, threshold, canEdit }) {
  const { run, user } = useStore();
  const [form] = Form.useForm();
  const f = rfq.extraction.fields;
  const review = new Set(rfq.extraction.reviewFields || []);
  const locked = !['review', 'ready', 'sourcing', 'rates_in'].includes(rfq.status);
  useEffect(() => {
    form.setFieldsValue({ ...rfq.data, cargoReadyDate: rfq.data.cargoReadyDate ? dayjs(rfq.data.cargoReadyDate) : null });
  }, [rfq.data, form]);
  const mode = Form.useWatch('mode', form);

  const confirm = async () => {
    const v = await form.validateFields();
    run(ops.confirmExtraction, { rfqId: rfq.id, data: { ...v, cargoReadyDate: v.cargoReadyDate ? v.cargoReadyDate.format('YYYY-MM-DD') : null } }, { success: 'Shipment data confirmed — ready to request rates' });
  };

  const label = (key) => (
    <Space size={6}>
      {review.has(key) && rfq.status === 'review' && <WarningOutlined style={{ color: '#fa8c16' }} />}
      <span>{FIELD_LABELS[key]}</span>
      <ConfTag value={f[key]?.confidence} threshold={threshold} />
    </Space>
  );
  // Evidence snippet shown under each field so reviewers can check it against the source.
  const ev = (key) => (f[key]?.evidence && f[key].confidence > 0 ? <Tooltip title={f[key].evidence}><span className="fp-evidence">“{f[key].evidence.slice(0, 34)}{f[key].evidence.length > 34 ? '…' : ''}”</span></Tooltip> : null);
  const portOptions = PORTS.map((p) => ({ value: p.code, label: portName(p.code) }));
  const req = [{ required: true, message: 'Required' }];
  return (
    <Card
      size="small"
      title={<Space><RobotOutlined /> AI-extracted shipment data</Space>}
      extra={<Space><span className="fp-muted" style={{ fontSize: 12 }}>{rfq.extraction.model}</span><ConfTag value={rfq.extraction.overall} threshold={threshold} /></Space>}
    >
      {rfq.status === 'review' && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Human review required: ${review.size} field(s) below the ${Math.round(threshold * 100)}% auto-accept threshold`} description="Check the highlighted fields against the original message, correct them, then confirm. Your corrections are logged and used to improve extraction." />
      )}
      {rfq.extraction.reviewedBy && <Alert type="success" showIcon style={{ marginBottom: 12 }} message={`Confirmed by ${rfq.extraction.reviewedBy} · ${fmtDateTime(rfq.extraction.reviewedAt)}${rfq.extraction.corrections?.length ? ` · corrected: ${rfq.extraction.corrections.map((k) => FIELD_LABELS[k]).join(', ')}` : ''}`} />}
      <Form form={form} layout="vertical" disabled={!canEdit || locked} requiredMark={false}>
        <Row gutter={12}>
          <Col xs={24} md={8}><Form.Item name="mode" label={label('mode')} extra={ev('mode')} rules={req}><Select options={Object.entries(MODES).map(([value, m]) => ({ value, label: m.label }))} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="origin" label={label('origin')} extra={ev('origin')} rules={req}><Select showSearch optionFilterProp="label" options={portOptions} status={review.has('origin') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="destination" label={label('destination')} extra={ev('destination')} rules={req}><Select showSearch optionFilterProp="label" options={portOptions} status={review.has('destination') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="commodity" label={label('commodity')} extra={ev('commodity')} rules={req}><AutoComplete options={COMMODITIES.map((c) => ({ value: c }))} filterOption status={review.has('commodity') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="weightKg" label={label('weightKg')} extra={ev('weightKg')} rules={req}><InputNumber min={0} style={{ width: '100%' }} addonAfter="kg" status={review.has('weightKg') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="volumeCbm" label={label('volumeCbm')} extra={ev('volumeCbm')} rules={mode === 'SEA_LCL' ? req : []}><InputNumber min={0} style={{ width: '100%' }} addonAfter="cbm" /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="packages" label={label('packages')} extra={ev('packages')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          {mode === 'SEA_FCL' && (
            <>
              <Col xs={12} md={8}><Form.Item name="containerType" label={label('containerType')} extra={ev('containerType')} rules={req}><Select options={CONTAINER_TYPES.map((c) => ({ value: c, label: c }))} /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="containerCount" label={label('containerCount')} extra={ev('containerCount')} rules={req}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            </>
          )}
          <Col xs={12} md={8}><Form.Item name="incoterm" label={label('incoterm')} extra={ev('incoterm')} rules={req}><Select options={INCOTERMS.map((c) => ({ value: c, label: c }))} status={review.has('incoterm') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="cargoReadyDate" label={label('cargoReadyDate')} extra={ev('cargoReadyDate')} rules={req}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" status={review.has('cargoReadyDate') && rfq.status === 'review' ? 'warning' : ''} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="hazardous" label={label('hazardous')} extra={ev('hazardous')} valuePropName="checked"><Switch checkedChildren="DG" unCheckedChildren="Non-DG" /></Form.Item></Col>
        </Row>
      </Form>
      {!locked && (
        <Tooltip title={canEdit ? '' : `Your role (${user.role}) cannot confirm RFQ data`}>
          <Button type="primary" icon={<CheckOutlined />} onClick={confirm} disabled={!canEdit}>
            {rfq.status === 'review' ? 'Confirm & approve extraction' : 'Save corrections'}
          </Button>
        </Tooltip>
      )}
    </Card>
  );
}

function RateRequests({ rfq }) {
  const { scoped, lookup, run, tenant } = useStore();
  const navigate = useNavigate();
  const eligible = ops.partnersForMode({ partners: scoped.partners }, tenant.id, rfq.data.mode);
  const already = new Set(rfq.rateRequests.map((r) => r.partnerId));
  const [selected, setSelected] = useState(() => eligible.filter((p) => !already.has(p.id)).slice(0, 3).map((p) => p.id));
  const [templateId, setTemplateId] = useState(tenant.settings.defaultTemplateId);
  const pending = rfq.rateRequests.filter((r) => r.status === 'sent');
  const canRequest = ['ready', 'sourcing', 'rates_in'].includes(rfq.status);

  const simulate = (rr) => {
    const rng = mathRng();
    const partner = lookup.partner(rr.partnerId);
    const declined = rng.chance(0.1);
    run(ops.recordRateReply, { rfqId: rfq.id, rrId: rr.id, declined, reply: declined ? null : makeReply(rng, rfq.data, partner, tenant.currency, Date.now()) }, { actor: ops.AI_ACTOR });
  };
  const cmp = useMemo(() => compareRates(rfq.rateRequests.map((r) => ({ ...r, partnerRating: lookup.partner(r.partnerId)?.rating }))), [rfq.rateRequests, lookup]);
  const quote = rfq.quoteId && lookup.quote(rfq.quoteId);
  const quoteActive = quote && !['rejected', 'expired'].includes(quote.status);

  const createQuote = (rrId) => {
    const q = run(ops.createQuote, { rfqId: rfq.id, rrId, templateId }, { actor: ops.AI_ACTOR, success: (x) => `Quote ${x.ref} drafted with margin rule “${x.ruleName}”` });
    if (q) navigate(`/quotes/${q.id}`);
  };

  const chartData = cmp.rows.map((r) => ({ name: lookup.partner(r.partnerId)?.name, total: r.reply.total, id: r.id })).sort((a, b) => a.total - b.total);

  return (
    <>
      <Card size="small" title={<Space><SendOutlined /> Rate requests to carriers & agents</Space>} style={{ marginTop: 16 }}>
        {canRequest && (
          <Space wrap style={{ marginBottom: 12 }}>
            <Select
              mode="multiple"
              style={{ minWidth: 380 }}
              value={selected}
              onChange={setSelected}
              placeholder="Select partners"
              options={eligible.map((p) => ({ value: p.id, label: `${p.name} (${p.type}, ★${p.rating})`, disabled: already.has(p.id) }))}
            />
            <Button type="primary" icon={<SendOutlined />} disabled={!selected.filter((s) => !already.has(s)).length} onClick={() => run(ops.sendRateRequests, { rfqId: rfq.id, partnerIds: selected.filter((s) => !already.has(s)) }, { actor: ops.AI_ACTOR, success: 'AI drafted and sent the rate requests' })}>
              Send rate requests
            </Button>
            {pending.length > 0 && <Button icon={<ThunderboltOutlined />} onClick={() => pending.forEach(simulate)}>Simulate {pending.length} partner repl{pending.length > 1 ? 'ies' : 'y'}</Button>}
          </Space>
        )}
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={rfq.rateRequests}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No rate requests yet" /> }}
          scroll={{ x: 800 }}
          columns={[
            { title: 'Partner', render: (r) => <div><b>{lookup.partner(r.partnerId)?.name}</b><div className="fp-muted" style={{ fontSize: 12 }}>{lookup.partner(r.partnerId)?.email} · via {r.channel}</div></div> },
            { title: 'Sent', dataIndex: 'sentAt', render: (v) => <TimeAgo value={v} /> },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag kind="rate" status={v} /> },
            { title: 'Buy total', render: (r) => (r.reply ? <Money value={r.reply.total} currency={r.reply.currency} /> : '—') },
            { title: 'Transit', render: (r) => (r.reply ? `${r.reply.transitDays} d` : '—') },
            { title: 'Valid until', render: (r) => (r.reply ? fmtDate(r.reply.validUntil) : '—') },
            {
              title: '',
              render: (r) => (r.status === 'sent' ? (
                <Space>
                  <Button size="small" onClick={() => simulate(r)}>Simulate reply</Button>
                  <Button size="small" type="text" onClick={() => run(ops.recordRateReply, { rfqId: rfq.id, rrId: r.id, declined: true }, { actor: ops.AI_ACTOR })}>Declined</Button>
                </Space>
              ) : r.reply ? (
                <Popover title="Partner reply (parsed by AI)" content={<div style={{ maxWidth: 420 }}><pre className="fp-raw">{r.reply.rawText}</pre><span className="fp-muted">Parse confidence</span> <ConfTag value={r.reply.parseConfidence} /></div>}>
                  <Button size="small" type="link">Raw reply</Button>
                </Popover>
              ) : null),
            },
          ]}
        />
      </Card>

      {cmp.rows.length > 0 && (
        <Card
          size="small"
          title={<Space><TrophyOutlined /> Rate comparison</Space>}
          style={{ marginTop: 16 }}
          extra={!quoteActive && (
            <Space>
              <span className="fp-muted" style={{ fontSize: 12 }}>Quote template</span>
              <Select size="small" value={templateId} onChange={setTemplateId} style={{ width: 200 }} options={tenant.settings.quoteTemplates.map((t) => ({ value: t.id, label: t.name }))} />
            </Space>
          )}
        >
          {quoteActive && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={<span>Quote <Link to={`/quotes/${quote.id}`}>{quote.ref}</Link> was created from {lookup.partner(quote.partnerId)?.name}'s rate · <StatusTag kind="quote" status={quote.status} /></span>} />}
          <Row gutter={16}>
            <Col xs={24} lg={15}>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={[...cmp.rows].sort((a, b) => b.score - a.score)}
                expandable={{
                  expandedRowRender: (r) => (
                    <Table size="small" pagination={false} rowKey="code" dataSource={r.reply.charges} columns={[{ title: 'Code', dataIndex: 'code', width: 70 }, { title: 'Charge', dataIndex: 'desc' }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => <Money value={v} currency={r.reply.currency} digits={2} /> }]} />
                  ),
                }}
                columns={[
                  { title: 'Partner', render: (r) => <div><b>{lookup.partner(r.partnerId)?.name}</b> <span className="fp-muted">★{lookup.partner(r.partnerId)?.rating}</span><div>{r.id === cmp.bestId && <Tag color="green">Best value</Tag>}{r.id === cmp.cheapestId && <Tag color="blue">Cheapest</Tag>}{r.id === cmp.fastestId && <Tag color="purple">Fastest</Tag>}</div></div> },
                  { title: 'Total', align: 'right', render: (r) => <div><Money value={r.reply.total} currency={r.reply.currency} strong />{r.deltaPct > 0 && <div className="fp-muted" style={{ fontSize: 12 }}>+{r.deltaPct}%</div>}</div> },
                  { title: 'Transit', render: (r) => <span><ClockCircleOutlined /> {r.reply.transitDays} d<div className="fp-muted" style={{ fontSize: 12 }}>{r.reply.routing}</div></span> },
                  { title: 'Score', dataIndex: 'score', render: (v) => <Tooltip title="60% price · 25% transit · 15% partner rating"><b>{v}</b></Tooltip> },
                  { title: '', render: (r) => !quoteActive && <Button size="small" type={r.id === cmp.bestId ? 'primary' : 'default'} onClick={() => createQuote(r.id)}>Quote this</Button> },
                ]}
              />
            </Col>
            <Col xs={24} lg={9}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Buy total by partner ({tenant.currency})</Typography.Text>
              <div style={{ height: Math.max(120, chartData.length * 44) }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 56 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <RTooltip formatter={(v) => fmtMoney(v, tenant.currency)} cursor={{ fillOpacity: 0.06 }} />
                    <Bar dataKey="total" name="Buy total" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                      {chartData.map((d) => <Cell key={d.id} fill={SERIES[0]} fillOpacity={d.id === cmp.bestId ? 1 : 0.45} />)}
                      <LabelList dataKey="total" position="right" formatter={(v) => fmtMoney(v, tenant.currency)} style={{ fontSize: 11, fill: 'currentColor' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Col>
          </Row>
        </Card>
      )}
    </>
  );
}

export default function RfqDetail() {
  const { id } = useParams();
  const { scoped, lookup, runAsync, tenant, user } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const rfq = scoped.rfqs.find((r) => r.id === id);
  if (!rfq) return <Result status="404" title="RFQ not found in this tenant" subTitle="It may belong to another forwarder." extra={<Button onClick={() => navigate('/rfqs')}>Back to inbox</Button>} />;
  const customer = lookup.customer(rfq.customerId);
  const threshold = tenant.settings.extraction.autoAcceptThreshold;
  const stepIdx = rfq.status === 'lost' ? 5 : STEP_ORDER.indexOf(rfq.status);

  const extract = async () => {
    setBusy(true);
    await runAsync(ops.extractRfq, { rfqId: rfq.id }, { actor: ops.AI_ACTOR, success: (r) => (r.status === 'review' ? 'Extraction complete — review required' : 'Extraction complete — auto-accepted') });
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title={<Space>{rfq.ref}<StatusTag kind="rfq" status={rfq.status} /></Space>}
        subtitle={<span>{customer?.name} · tier {customer?.tier} · received <TimeAgo value={rfq.receivedAt} />{rfq.data && <> · <Lane origin={rfq.data.origin} destination={rfq.data.destination} /> · <ModeTag mode={rfq.data.mode} /></>}</span>}
        extra={[
          rfq.status === 'new' && <Button key="e" type="primary" icon={<RobotOutlined />} loading={busy} onClick={extract}>Run AI extraction</Button>,
          rfq.extraction && ['review', 'ready'].includes(rfq.status) && <Button key="r" icon={<RobotOutlined />} loading={busy} onClick={extract}>Re-extract</Button>,
          <Button key="b" onClick={() => navigate('/rfqs')}>Back</Button>,
        ]}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps
          size="small"
          current={stepIdx}
          status={rfq.status === 'lost' ? 'error' : rfq.status === 'review' ? 'process' : undefined}
          items={[{ title: 'Received' }, { title: 'AI extraction' }, { title: 'Human review' }, { title: 'Rates requested' }, { title: 'Rates compared' }, { title: rfq.status === 'lost' ? 'Lost' : 'Quoted' }, { title: 'Won' }]}
        />
        {rfq.lostReason && <Alert style={{ marginTop: 12 }} type="error" showIcon message={`Lost: ${rfq.lostReason}`} />}
      </Card>
      <Row gutter={16}>
        <Col xs={24} xl={10}><SourceMessage rfq={rfq} customer={customer} /></Col>
        <Col xs={24} xl={14}>
          {rfq.extraction ? (
            <ExtractionReview rfq={rfq} threshold={threshold} canEdit={REVIEW_ROLES.includes(user.role)} />
          ) : (
            <Card size="small"><Result icon={<RobotOutlined />} title="Not extracted yet" subTitle="Run the AI to turn this message into origin, destination, commodity, weight, volume, Incoterms and cargo-ready date." extra={<Button type="primary" loading={busy} onClick={extract}>Run AI extraction</Button>} /></Card>
          )}
        </Col>
      </Row>
      {rfq.data && rfq.status !== 'new' && rfq.status !== 'review' && <RateRequests rfq={rfq} />}
    </>
  );
}
