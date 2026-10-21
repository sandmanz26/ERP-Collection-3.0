import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Statistic, Steps, Table, Tag, Typography } from 'antd';
import { PlusOutlined, CloudServerOutlined, SwapOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { TENANT_DEFS } from '../data/tenants.js';
import { REGIONS, PLANS } from '../lib/reference.js';
import { monthKey } from '../lib/util.js';
import { PageHeader, StatusTag } from '../components/common.jsx';
import { invoiceFor } from './Usage.jsx';

function defaultSettings(companyName) {
  const base = structuredClone(TENANT_DEFS[0].settings);
  base.marginRules = base.marginRules.filter((r) => r.id === 'mr9');
  base.quoteTemplates = base.quoteTemplates.map((t) => ({ ...t, intro: t.intro.replace('Nusa Freight Indonesia', companyName), footer: companyName }));
  return base;
}

export default function Platform() {
  const { state, run, setSession, tenant } = useStore();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const month = monthKey(Date.now());

  const rows = state.tenants.map((t) => {
    const cw = state.connectors.find((c) => c.tenantId === t.id && c.connectorKey === 'cargowise');
    const usage = state.usage[t.id]?.[month] || {};
    return { ...t, users: state.users.filter((u) => u.tenantId === t.id).length, usage, cw, mrr: invoiceFor(t.plan, usage).total };
  });

  const create = async () => {
    await form.validateFields();
    const all = form.getFieldsValue(true);
    const city = all.city.slice(0, 3).toUpperCase();
    const partners = TENANT_DEFS[0].partners.map(([name, type, modes, scac, rating, priceFactor, transitAdj]) => ({ name, type, modes, scac, rating, priceFactor, transitAdj, email: `rates@${scac.toLowerCase()}.example.com`, channel: 'email', cwCode: `${scac.padEnd(6, 'X')}${city}` }));
    const customers = [{ name: `${all.name.split(' ')[0]} Pilot Customer`, short: 'PILOT', tier: 'C', country: all.country, contact: 'Pilot Contact', preferredChannel: 'email', email: 'pilot@customer.example.com', whatsapp: '+65 8000 0000', cwCode: `PILOTX${city}`, paymentTermsDays: 30, creditLimit: 20000 }];
    const t = run(ops.createTenant, { partners, customers, tenant: { name: all.name, code: all.code.toUpperCase(), city: all.city, country: all.country, region: all.region, currency: all.currency, plan: all.plan, lanes: [['CNSHA', 'SGSIN', 'SEA_FCL'], ['SGSIN', 'DEHAM', 'SEA_FCL'], ['HKHKG', 'USLAX', 'AIR']], settings: defaultSettings(all.name) }, admin: { name: all.adminName, email: all.adminEmail } }, { actor: ops.SYSTEM_ACTOR, success: (x) => `${x.name} provisioned in ${x.region}` });
    if (t) {
      setOpen(false);
      setStep(0);
      form.resetFields();
      setSession({ tenantId: t.id });
    }
  };

  return (
    <>
      <PageHeader title="Tenants & regions" subtitle="Platform operator view — every forwarder is an isolated tenant pinned to a hosting region" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Provision tenant</Button>} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {Object.entries(REGIONS).map(([k, r]) => {
          const n = state.tenants.filter((t) => t.region === k).length;
          return (
            <Col xs={12} md={8} xl={24 / 5} key={k} style={{ flex: '1 1 0', minWidth: 180 }}>
              <Card size="small">
                <Statistic title={<span>{r.flag} {r.name}</span>} value={n} suffix={n === 1 ? 'tenant' : 'tenants'} prefix={<CloudServerOutlined />} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{k} · {r.law}</Typography.Text>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Card size="small" title="Tenants">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            { title: 'Tenant', render: (t) => <div><b>{t.name}</b> {t.id === tenant.id && <Tag color="blue">current</Tag>}<div className="fp-muted fp-mono">{t.id} · {t.code}</div></div> },
            { title: 'Region', dataIndex: 'region', render: (r, t) => <div>{REGIONS[r]?.flag} {r}{t.pendingMigration && <div><Tag color="orange">→ {t.pendingMigration}</Tag></div>}</div> },
            { title: 'Plan', dataIndex: 'plan', render: (p) => PLANS[p].name },
            { title: 'Users', dataIndex: 'users' },
            { title: 'RFQs / docs / invoices (month)', render: (t) => `${t.usage.rfqs || 0} / ${t.usage.documents || 0} / ${t.usage.invoices || 0}` },
            { title: 'Est. bill (USD)', dataIndex: 'mrr', align: 'right', render: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
            { title: 'CargoWise', render: (t) => (t.cw ? <span><StatusTag kind="connector" status={t.cw.status} /> <span className="fp-mono">{t.cw.config.enterpriseId}</span></span> : <Tag>not connected</Tag>) },
            { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag> },
            {
              title: '',
              render: (t) => (
                <Space>
                  <Button size="small" icon={<SwapOutlined />} disabled={t.status !== 'active'} onClick={() => setSession({ tenantId: t.id })}>Open</Button>
                  <Popconfirm title={t.status === 'active' ? 'Suspend tenant? Users lose access, data is kept.' : 'Reactivate tenant?'} onConfirm={() => run(ops.updateTenant, { tenantId: t.id, patch: { status: t.status === 'active' ? 'suspended' : 'active' }, label: t.status === 'active' ? 'Tenant suspended' : 'Tenant reactivated' }, { actor: ops.SYSTEM_ACTOR })}>
                    <Button size="small" danger={t.status === 'active'} disabled={t.id === tenant.id && t.status === 'active'}>{t.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Isolation model"
        description="Every record carries a tenantId and is read through tenant-scoped queries; each tenant's data store, backups and AI inference run in its home region. Connector credentials, margin rules, templates and workflows are per tenant. The platform view only sees aggregated metering."
      />
      <Modal title="Provision a new forwarder" open={open} onCancel={() => { setOpen(false); setStep(0); }} width={640} footer={[
        step > 0 && <Button key="b" onClick={() => setStep(step - 1)}>Back</Button>,
        step < 2 ? <Button key="n" type="primary" onClick={async () => { await form.validateFields(); setStep(step + 1); }}>Next</Button> : <Button key="c" type="primary" onClick={create}>Provision</Button>,
      ]}>
        <Steps size="small" current={step} style={{ marginBottom: 16 }} items={[{ title: 'Company' }, { title: 'Region & plan' }, { title: 'Admin user' }]} />
        <Form form={form} layout="vertical" initialValues={{ region: 'ap-southeast-1', currency: 'USD', plan: 'starter', country: 'SG' }}>
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <Form.Item name="name" label="Company name" rules={step === 0 ? [{ required: true }] : []}><Input placeholder="e.g. Lion City Logistics Pte Ltd" /></Form.Item>
            <Space>
              <Form.Item name="code" label="Short code (2 letters)" rules={step === 0 ? [{ required: true, len: 2 }] : []}><Input maxLength={2} style={{ width: 120 }} /></Form.Item>
              <Form.Item name="city" label="City" rules={step === 0 ? [{ required: true }] : []}><Input /></Form.Item>
              <Form.Item name="country" label="Country"><Input maxLength={2} style={{ width: 80 }} /></Form.Item>
            </Space>
          </div>
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Form.Item name="region" label="Hosting region (data residency)"><Select options={Object.entries(REGIONS).map(([k, r]) => ({ value: k, label: `${r.flag} ${r.name} — ${r.law}` }))} /></Form.Item>
            <Space>
              <Form.Item name="currency" label="Operating currency"><Select style={{ width: 140 }} options={['USD', 'EUR'].map((c) => ({ value: c, label: c }))} /></Form.Item>
              <Form.Item name="plan" label="Plan"><Select style={{ width: 260 }} options={Object.entries(PLANS).map(([k, p]) => ({ value: k, label: `${p.name} — USD ${p.monthly}/mo` }))} /></Form.Item>
            </Space>
          </div>
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <Form.Item name="adminName" label="Admin name" rules={step === 2 ? [{ required: true }] : []}><Input /></Form.Item>
            <Form.Item name="adminEmail" label="Admin email" rules={step === 2 ? [{ required: true, type: 'email' }] : []}><Input /></Form.Item>
            <Alert type="info" showIcon message="The tenant starts with a default margin rule, both quote templates and the standard approval workflows. The admin then connects CargoWise with their own eAdaptor credentials." />
          </div>
        </Form>
      </Modal>
    </>
  );
}
