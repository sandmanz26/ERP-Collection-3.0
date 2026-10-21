import { useMemo, useState } from 'react';
import { Alert, Avatar, Badge, Button, Card, Checkbox, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Typography, App } from 'antd';
import { ApiOutlined, PlusOutlined, SettingOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { CONNECTOR_DEFINITIONS, CAPABILITIES, connectorDef, resolveConnector } from '../lib/connectors/registry.js';
import { PageHeader, StatusTag, TimeAgo, CodeViewer } from '../components/common.jsx';
import { MessageLog } from './ShipmentDetail.jsx';

const SDK_SNIPPET = `// src/lib/connectors/registry.js — the ONLY place a new TMS/ERP is added.
// Pages, workflows and the store call dispatch(capability, entity) and never
// reference a vendor; routing is per tenant, using that tenant's credentials.

CONNECTOR_DEFINITIONS.push({
  key: 'descartes',
  name: 'Descartes Customs',
  category: 'Customs',
  protocol: 'REST / JSON',
  capabilities: ['shipment.create', 'document.attach'],
  configSchema: [                      // drives the settings form automatically
    { key: 'apiUrl',  label: 'API URL', type: 'url',    required: true },
    { key: 'apiKey',  label: 'API key', type: 'secret', required: true },
  ],
  adapter: {
    build(capability, entity, ctx) {   // map our canonical model → vendor format
      return { format: 'json', messageType: 'DescartesEntry', body: toDescartes(entity, ctx) };
    },
    test(config) { return { ok: !!config.apiKey, message: 'reachable' }; },
  },
});`;

function ConfigureModal({ open, onClose, instance, defKey }) {
  const { tenant, run } = useStore();
  const { message } = App.useApp();
  const def = connectorDef(instance?.connectorKey || defKey);
  const [form] = Form.useForm();
  if (!def) return null;
  const save = async () => {
    const v = await form.validateFields();
    const config = Object.fromEntries(def.configSchema.map((f) => [f.key, f.type === 'secret' && v[f.key] ? '••••••••' : v[f.key] || '']));
    const test = def.adapter.test(Object.fromEntries(def.configSchema.map((f) => [f.key, v[f.key] || (f.type === 'secret' && instance?.config?.[f.key]) || ''])));
    run(ops.upsertConnector, { instance: { ...(instance || {}), tenantId: tenant.id, connectorKey: def.key, name: v.name, config, enabledCapabilities: v.capabilities, status: test.ok ? 'connected' : 'error', lastTest: { ok: test.ok, message: test.message, at: new Date().toISOString() } } });
    if (test.ok) message.success(`Saved — ${test.message}`);
    else message.warning(`Saved, but connection test failed: ${test.message}`);
    onClose();
  };
  return (
    <Modal title={<Space><Avatar shape="square" style={{ background: '#2f54eb' }}>{def.logo}</Avatar>{instance ? `Configure ${instance.name}` : `Add ${def.name}`}</Space>} open={open} onCancel={onClose} onOk={save} okText="Save & test" width={620} destroyOnClose>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Credentials are stored per tenant (${tenant.name}) in ${tenant.region}, encrypted at rest, and never shared with other forwarders.`} />
      <Form form={form} layout="vertical" preserve={false} initialValues={{ name: instance?.name || def.name, capabilities: instance?.enabledCapabilities || def.capabilities, ...Object.fromEntries(def.configSchema.map((f) => [f.key, f.type === 'secret' ? '' : instance?.config?.[f.key]])) }}>
        <Form.Item name="name" label="Display name" rules={[{ required: true }]}><Input /></Form.Item>
        {def.configSchema.map((f) => (
          <Form.Item key={f.key} name={f.key} label={f.label} rules={f.required && !(f.type === 'secret' && instance) ? [{ required: true, message: 'Required' }] : []} extra={f.type === 'secret' && instance ? 'Leave empty to keep the stored secret' : undefined}>
            {f.type === 'secret' ? <Input.Password placeholder={instance ? '••••••••' : ''} /> : f.type === 'select' ? <Select options={f.options.map((o) => ({ value: o, label: o }))} /> : <Input placeholder={f.placeholder} />}
          </Form.Item>
        ))}
        <Form.Item name="capabilities" label="Enabled capabilities"><Checkbox.Group options={def.capabilities.map((c) => ({ value: c, label: CAPABILITIES[c] }))} /></Form.Item>
      </Form>
    </Modal>
  );
}

export default function Connectors() {
  const { scoped, run, tenant, state } = useStore();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(null); // { instance } | { defKey }
  const [msgType, setMsgType] = useState();

  const test = (inst) => {
    const res = connectorDef(inst.connectorKey).adapter.test({ ...inst.config, password: inst.config.password ? 'stored' : '', clientSecret: inst.config.clientSecret ? 'stored' : '' });
    run(ops.upsertConnector, { instance: { ...inst, status: inst.status === 'disabled' ? 'disabled' : res.ok ? 'connected' : 'error', lastTest: { ok: res.ok, message: res.message, at: new Date().toISOString() } } });
    res.ok ? message.success(res.message) : message.error(res.message);
  };
  const routing = useMemo(() => Object.entries(CAPABILITIES).map(([cap, label]) => ({ cap, label, inst: resolveConnector(state.connectors, tenant.id, cap) })), [state.connectors, tenant.id]);
  const msgs = scoped.messages.filter((m) => !msgType || m.messageType.startsWith(msgType));

  return (
    <>
      <PageHeader title="Connectors" subtitle="Connector framework — build once, each forwarder connects with their own credentials" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ defKey: 'cargowise' })}>Add connector</Button>} />
      <Tabs
        items={[
          {
            key: 'installed',
            label: `Installed (${scoped.connectors.length})`,
            children: (
              <Row gutter={[16, 16]}>
                {scoped.connectors.map((inst) => {
                  const def = connectorDef(inst.connectorKey);
                  return (
                    <Col xs={24} md={12} xl={8} key={inst.id}>
                      <Card
                        size="small"
                        title={<Space><Avatar shape="square" style={{ background: inst.connectorKey === 'cargowise' ? '#0050b3' : '#595959' }}>{def.logo}</Avatar><div><div>{inst.name}</div><div className="fp-muted" style={{ fontSize: 12, fontWeight: 400 }}>{def.vendor} · {def.protocol}</div></div></Space>}
                        extra={<StatusTag kind="connector" status={inst.status} />}
                        actions={[
                          <Button key="t" type="text" icon={<ThunderboltOutlined />} onClick={() => test(inst)}>Test</Button>,
                          <Button key="c" type="text" icon={<SettingOutlined />} onClick={() => setEditing({ instance: inst })}>Configure</Button>,
                          <Button key="d" type="text" onClick={() => run(ops.upsertConnector, { instance: { ...inst, status: inst.status === 'disabled' ? 'connected' : 'disabled' } })}>{inst.status === 'disabled' ? 'Enable' : 'Disable'}</Button>,
                          <Popconfirm key="r" title="Remove connector?" onConfirm={() => run(ops.removeConnector, { id: inst.id })}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>,
                        ]}
                      >
                        <div style={{ marginBottom: 8 }}>{inst.enabledCapabilities.map((c) => <Tag key={c}>{CAPABILITIES[c]}</Tag>)}</div>
                        <div className="fp-muted" style={{ fontSize: 12 }}>
                          {inst.connectorKey === 'cargowise' && <div>Enterprise <b>{inst.config.enterpriseId}</b> · server <b>{inst.config.serverId}</b> · company <b>{inst.config.companyCode}</b></div>}
                          <div>Last sync: {inst.lastSyncAt ? <TimeAgo value={inst.lastSyncAt} /> : 'never'}</div>
                          {inst.lastTest && <div>Last test: <Badge status={inst.lastTest.ok ? 'success' : 'error'} text={inst.lastTest.message} /></div>}
                          {inst.status === 'error' && !inst.lastTest && <div style={{ color: '#cf1322' }}>Authentication failed — credentials missing or expired</div>}
                        </div>
                      </Card>
                    </Col>
                  );
                })}
                <Col span={24}>
                  <Card size="small" title="Capability routing for this tenant">
                    <Typography.Paragraph type="secondary">The core product only emits capabilities. The first connected connector with a capability enabled receives the message.</Typography.Paragraph>
                    <Table size="small" pagination={false} rowKey="cap" dataSource={routing} columns={[{ title: 'Capability', render: (r) => <div><span className="fp-mono">{r.cap}</span><div className="fp-muted" style={{ fontSize: 12 }}>{r.label}</div></div> }, { title: 'Routed to', render: (r) => (r.inst ? <Space><ApiOutlined />{r.inst.name}</Space> : <Tag color="red">No connector — step blocked</Tag>) }, { title: 'Format', render: (r) => (r.inst ? connectorDef(r.inst.connectorKey).formats.join(', ') : '—') }]} />
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'catalog',
            label: 'Catalog',
            children: (
              <Table
                rowKey="key"
                dataSource={CONNECTOR_DEFINITIONS}
                pagination={false}
                scroll={{ x: 900 }}
                columns={[
                  { title: 'Connector', render: (d) => <Space><Avatar shape="square">{d.logo}</Avatar><div><b>{d.name}</b><div className="fp-muted" style={{ fontSize: 12 }}>{d.vendor}</div></div></Space> },
                  { title: 'Category', dataIndex: 'category' },
                  { title: 'Protocol', dataIndex: 'protocol' },
                  { title: 'Capabilities', render: (d) => d.capabilities.map((c) => <Tag key={c}>{c}</Tag>) },
                  { title: 'Installed', render: (d) => scoped.connectors.filter((c) => c.connectorKey === d.key).length || '—' },
                  { title: '', render: (d) => <Button size="small" onClick={() => setEditing({ defKey: d.key })}>Add</Button> },
                ]}
              />
            ),
          },
          {
            key: 'messages',
            label: `Message log (${scoped.messages.length})`,
            children: (
              <>
                <Select allowClear placeholder="Message type" value={msgType} onChange={setMsgType} style={{ width: 240, marginBottom: 12 }} options={['UniversalShipment', 'UniversalEvent', 'UniversalTransaction', 'Mail'].map((v) => ({ value: v, label: v }))} />
                <MessageLog messages={msgs.slice(0, 80)} />
              </>
            ),
          },
          { key: 'sdk', label: 'Connector SDK', children: <Card size="small"><Typography.Paragraph>New TMS / ERP connectors plug in without changes to the core product. Each definition declares capabilities, a config schema (rendered as the form above) and an adapter that maps the canonical shipment / event / invoice model to the vendor format.</Typography.Paragraph><CodeViewer format="json" body={SDK_SNIPPET} /></Card> },
        ]}
      />
      {editing && <ConfigureModal open onClose={() => setEditing(null)} instance={editing.instance} defKey={editing.defKey} />}
    </>
  );
}
