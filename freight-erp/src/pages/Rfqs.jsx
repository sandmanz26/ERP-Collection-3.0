import { useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Table, Tabs, Form, Checkbox, Segmented, Typography, Alert, Tooltip } from 'antd';
import { PlusOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { renderRfq } from '../lib/simulate.js';
import { CHANNELS, MODES, portName } from '../lib/reference.js';
import { PageHeader, StatusTag, ChannelTag, ModeTag, Lane, ConfTag, TimeAgo, statusOptions } from '../components/common.jsx';

const SAMPLE = `Hi team,

Kindly quote 2x40HC from Shanghai to Jakarta.
Commodity: Furniture, non-DG
Gross weight 36,500 kg, 48 pallets.
Terms FOB. Cargo ready 18 Nov.

Thanks,
Agus`;

function NewRfqModal({ open, onClose }) {
  const { tenant, scoped, run, runAsync } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState('simulate');
  const [busy, setBusy] = useState(false);
  const [sim] = Form.useForm();
  const [paste] = Form.useForm();

  const finish = async (rfq) => {
    if (!rfq) return setBusy(false);
    await runAsync(ops.extractRfq, { rfqId: rfq.id }, { actor: ops.AI_ACTOR, success: (r) => (r.status === 'review' ? 'AI extraction done — some fields need review' : 'AI extraction done — all fields auto-accepted') });
    setBusy(false);
    onClose();
    navigate(`/rfqs/${rfq.id}`);
  };

  const submitSim = async () => {
    const v = await sim.validateFields();
    setBusy(true);
    const lane = tenant.lanes[v.lane];
    const omit = v.messy ? ['incoterm', 'cargoReadyDate', 'weightKg', 'commodity'].sort(() => Math.random() - 0.5).slice(0, 2) : [];
    const rfq = run((d, a, c) => ops.newRfqFromTruth(d, a, c, renderRfq).rfq, { tenantId: tenant.id, channel: v.channel, customerId: v.customerId, laneDef: lane, omit });
    finish(rfq);
  };

  const submitPaste = async () => {
    const v = await paste.validateFields();
    setBusy(true);
    const raw = v.channel === 'whatsapp' ? { from: scoped.customers.find((c) => c.id === v.customerId)?.whatsapp, body: v.text } : v.channel === 'email' ? { from: scoped.customers.find((c) => c.id === v.customerId)?.email, body: v.text } : { fileName: v.channel === 'pdf' ? 'uploaded_rfq.pdf' : 'uploaded_rfq.xlsx', text: v.text, pages: 1 };
    const rfq = run(ops.receiveRfq, { tenantId: tenant.id, channel: v.channel, customerId: v.customerId, subject: v.subject || v.text.split('\n').find((l) => l.trim())?.slice(0, 70), raw });
    finish(rfq);
  };

  const customerOptions = scoped.customers.map((c) => ({ value: c.id, label: `${c.name} (tier ${c.tier})` }));
  return (
    <Modal title="New RFQ" open={open} onCancel={onClose} width={680} okText={busy ? 'AI is reading…' : 'Receive & extract'} confirmLoading={busy} onOk={tab === 'simulate' ? submitSim : submitPaste}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="In production RFQs arrive automatically through the Email / WhatsApp connectors. Here you can simulate an inbound message or paste one." />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'simulate',
            label: 'Simulate inbound',
            children: (
              <Form form={sim} layout="vertical" initialValues={{ channel: 'email', customerId: scoped.customers[0]?.id, lane: 0, messy: false }}>
                <Form.Item name="channel" label="Channel"><Segmented options={Object.entries(CHANNELS).map(([value, c]) => ({ value, label: c.label }))} /></Form.Item>
                <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}><Select options={customerOptions} /></Form.Item>
                <Form.Item name="lane" label="Lane"><Select options={tenant.lanes.map((l, i) => ({ value: i, label: `${portName(l[0])} → ${portName(l[1])} · ${MODES[l[2]].label}` }))} /></Form.Item>
                <Form.Item name="messy" valuePropName="checked"><Checkbox>Make it messy (customer leaves out some details → triggers human review)</Checkbox></Form.Item>
              </Form>
            ),
          },
          {
            key: 'paste',
            label: 'Paste message',
            children: (
              <Form form={paste} layout="vertical" initialValues={{ channel: 'email', customerId: scoped.customers[0]?.id, text: SAMPLE }}>
                <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
                  <Form.Item name="channel" label="Channel"><Select style={{ width: 160 }} options={Object.entries(CHANNELS).map(([value, c]) => ({ value, label: c.label }))} /></Form.Item>
                  <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}><Select style={{ minWidth: 300 }} options={customerOptions} /></Form.Item>
                </Space>
                <Form.Item name="subject" label="Subject (optional)"><Input /></Form.Item>
                <Form.Item name="text" label="Message / document text" rules={[{ required: true }]}><Input.TextArea rows={9} className="fp-mono" /></Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}

export default function Rfqs() {
  const { scoped, lookup, runAsync } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [channel, setChannel] = useState();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState(false);

  const rows = useMemo(() => {
    let r = scoped.rfqs;
    if (status === 'open') r = r.filter((x) => !['won', 'lost', 'quoted'].includes(x.status));
    else if (status !== 'all') r = r.filter((x) => x.status === status);
    if (channel) r = r.filter((x) => x.channel === channel);
    if (q) {
      const s = q.toLowerCase();
      r = r.filter((x) => `${x.ref} ${x.subject} ${lookup.customer(x.customerId)?.name} ${x.data?.origin} ${x.data?.destination} ${x.data?.commodity}`.toLowerCase().includes(s));
    }
    return r;
  }, [scoped.rfqs, status, channel, q, lookup]);

  const newOnes = scoped.rfqs.filter((r) => r.status === 'new');
  const extractAll = async () => {
    setBulk(true);
    for (const r of newOnes) await runAsync(ops.extractRfq, { rfqId: r.id }, { actor: ops.AI_ACTOR, latency: 450 });
    setBulk(false);
  };

  return (
    <>
      <PageHeader
        title="RFQ inbox"
        subtitle="Customer RFQs from email, PDF, Excel and WhatsApp — normalised by AI into one shipment format"
        extra={[
          <Tooltip key="x" title={newOnes.length ? '' : 'No unprocessed RFQs'}>
            <Button icon={<RobotOutlined />} loading={bulk} disabled={!newOnes.length} onClick={extractAll}>Extract {newOnes.length} new</Button>
          </Tooltip>,
          <Button key="n" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New RFQ</Button>,
        ]}
      />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select value={status} onChange={setStatus} style={{ width: 190 }} options={[{ value: 'open', label: 'Open (not yet quoted)' }, { value: 'all', label: 'All statuses' }, ...statusOptions('rfq')]} />
          <Select allowClear placeholder="Channel" value={channel} onChange={setChannel} style={{ width: 140 }} options={Object.entries(CHANNELS).map(([value, c]) => ({ value, label: c.label }))} />
          <Input.Search allowClear placeholder="Search ref, customer, port, commodity" onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
          <Typography.Text type="secondary">{rows.length} RFQ(s)</Typography.Text>
        </Space>
        <Table
          rowKey="id"
          size="middle"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          onRow={(r) => ({ onClick: () => navigate(`/rfqs/${r.id}`), className: 'fp-click' })}
          columns={[
            { title: 'RFQ', dataIndex: 'ref', width: 150, render: (v, r) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}><TimeAgo value={r.receivedAt} /></div></div> },
            { title: 'Channel', dataIndex: 'channel', width: 100, render: (v) => <ChannelTag channel={v} /> },
            { title: 'Customer / subject', render: (r) => <div><div>{lookup.customer(r.customerId)?.name}</div><Typography.Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 300 }}>{r.subject}</Typography.Text></div> },
            { title: 'Lane', render: (r) => (r.data ? <Lane origin={r.data.origin} destination={r.data.destination} short /> : <Typography.Text type="secondary"><ThunderboltOutlined /> not extracted</Typography.Text>) },
            { title: 'Mode', width: 100, render: (r) => (r.data ? <ModeTag mode={r.data.mode} /> : '—') },
            { title: 'AI confidence', width: 120, sorter: (a, b) => (a.extraction?.overall || 0) - (b.extraction?.overall || 0), render: (r) => (r.extraction ? <ConfTag value={r.extraction.overall} /> : '—') },
            { title: 'Rates', width: 80, render: (r) => (r.rateRequests.length ? `${r.rateRequests.filter((x) => x.status === 'replied').length}/${r.rateRequests.length}` : '—') },
            { title: 'Status', dataIndex: 'status', width: 150, render: (v) => <StatusTag kind="rfq" status={v} /> },
          ]}
        />
      </Card>
      <NewRfqModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
