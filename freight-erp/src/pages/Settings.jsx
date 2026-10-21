import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, ColorPicker, Descriptions, Divider, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Slider, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, EditOutlined, CloudServerOutlined } from '@ant-design/icons';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { MODES, ROLES, REGIONS, PLANS, PORTS, CHARGE_CODES, MILESTONES } from '../lib/reference.js';
import { APPROVAL_KINDS, CONDITION_TYPES, describeCondition } from '../lib/approvals.js';
import { findMarginRule, applyMargin } from '../lib/pricing.js';
import { PageHeader, RoleTag, fmtMoney, TimeAgo } from '../components/common.jsx';
import QuotePreview from '../components/QuotePreview.jsx';

const COUNTRIES = [...new Set(PORTS.map((p) => p.country))];
const ADMIN_ONLY = <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Only tenant admins can change settings. Switch to an admin user in the top bar." />;

function Organization() {
  const { tenant, run, user } = useStore();
  const [migrate, setMigrate] = useState(false);
  const [target, setTarget] = useState();
  const region = REGIONS[tenant.region];
  return (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <Card size="small" title="Organization">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Tenant ID"><span className="fp-mono">{tenant.id}</span></Descriptions.Item>
            <Descriptions.Item label="Legal name">{tenant.name}</Descriptions.Item>
            <Descriptions.Item label="Head office">{tenant.city}, {tenant.country}</Descriptions.Item>
            <Descriptions.Item label="Operating currency">{tenant.currency}</Descriptions.Item>
            <Descriptions.Item label="Plan">{PLANS[tenant.plan].name}</Descriptions.Item>
            <Descriptions.Item label="Customer since">{tenant.createdAt}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title={<Space><CloudServerOutlined /> Data residency</Space>}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Home region">{region.flag} {region.name} <Tag>{tenant.region}</Tag></Descriptions.Item>
            <Descriptions.Item label="Regulation">{region.law}</Descriptions.Item>
            <Descriptions.Item label="Storage zones">{region.storage}</Descriptions.Item>
            <Descriptions.Item label="AI processing">{region.ai} — documents and messages never leave the region</Descriptions.Item>
            <Descriptions.Item label="Backups">Encrypted, same region, 35-day point-in-time recovery</Descriptions.Item>
            <Descriptions.Item label="Retention">
              <InputNumber disabled={user.role !== 'admin'} value={tenant.settings.retentionDays} min={365} step={365} addonAfter="days" onChange={(v) => v && run(ops.updateSettings, { tenantId: tenant.id, section: 'retentionDays', value: v, label: 'data retention' })} />
            </Descriptions.Item>
          </Descriptions>
          <Button style={{ marginTop: 12 }} disabled={user.role !== 'admin'} onClick={() => setMigrate(true)}>Request region migration</Button>
        </Card>
      </Col>
      <Modal title="Request region migration" open={migrate} onCancel={() => setMigrate(false)} okButtonProps={{ disabled: !target }} onOk={() => { run(ops.updateTenant, { tenantId: tenant.id, patch: { pendingMigration: target }, label: `Requested migration ${tenant.region} → ${target}` }, { success: 'Migration request logged — platform team will schedule it' }); setMigrate(false); }}>
        <Typography.Paragraph>Migrations copy all tenant data to the target region, verify checksums, then switch over in a maintenance window. The source copy is deleted after 30 days.</Typography.Paragraph>
        <Select style={{ width: '100%' }} placeholder="Target region" value={target} onChange={setTarget} options={Object.entries(REGIONS).filter(([k]) => k !== tenant.region).map(([k, r]) => ({ value: k, label: `${r.flag} ${r.name} (${k}) — ${r.law}` }))} />
      </Modal>
      {tenant.pendingMigration && <Col span={24}><Alert style={{ marginTop: 16 }} type="info" showIcon message={`Pending migration to ${tenant.pendingMigration}`} /></Col>}
    </Row>
  );
}

function Users() {
  const { scoped, run, tenant, user } = useStore();
  const [open, setOpen] = useState(null);
  const [form] = Form.useForm();
  const isAdmin = user.role === 'admin';
  useEffect(() => {
    if (open) form.setFieldsValue(open.id ? open : { name: '', email: '', role: 'ops' });
  }, [open, form]);
  const save = async () => {
    const v = await form.validateFields();
    run(ops.upsertUser, { user: { ...open, ...v, tenantId: tenant.id } }, { success: open.id ? 'User updated' : 'Invitation sent' });
    setOpen(null);
  };
  return (
    <Card size="small" title="Users & roles" extra={<Button type="primary" icon={<PlusOutlined />} disabled={!isAdmin} onClick={() => setOpen({})}>Invite user</Button>}>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={scoped.users}
        columns={[
          { title: 'Name', dataIndex: 'name', render: (v, u) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}>{u.email}</div></div> },
          { title: 'Role', dataIndex: 'role', render: (r) => <RoleTag role={r} /> },
          { title: 'Can approve', dataIndex: 'role', render: (r) => <span style={{ fontSize: 12 }}>{ROLES[r].desc}</span> },
          { title: 'MFA', dataIndex: 'mfa', render: (v) => (v ? <Tag color="green">on</Tag> : <Tag>off</Tag>) },
          { title: 'Last login', dataIndex: 'lastLoginAt', render: (v) => <TimeAgo value={v} /> },
          { title: 'Status', dataIndex: 'active', render: (v) => (v === false ? <Tag>deactivated</Tag> : <Tag color="green">active</Tag>) },
          { title: '', render: (u) => isAdmin && <Space><Button size="small" icon={<EditOutlined />} onClick={() => setOpen(u)} /><Button size="small" disabled={u.id === user.id} onClick={() => run(ops.upsertUser, { user: { ...u, active: u.active === false } })}>{u.active === false ? 'Reactivate' : 'Deactivate'}</Button></Space> },
        ]}
      />
      <Modal title={open?.id ? 'Edit user' : 'Invite user'} open={!!open} onCancel={() => setOpen(null)} onOk={save}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}><Select options={Object.entries(ROLES).map(([value, r]) => ({ value, label: `${r.label} — ${r.desc}` }))} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function MarginRules() {
  const { tenant, run, user } = useStore();
  const rules = [...tenant.settings.marginRules].sort((a, b) => a.priority - b.priority);
  const [edit, setEdit] = useState(null);
  const [form] = Form.useForm();
  const [sim, setSim] = useState({ mode: 'SEA_FCL', customerTier: 'B', originCountry: undefined, destCountry: undefined, buyTotal: 2500 });
  const isAdmin = ['admin', 'manager'].includes(user.role);
  const save = (list, label) => run(ops.updateSettings, { tenantId: tenant.id, section: 'marginRules', value: list, label }, { success: 'Margin rules saved' });
  useEffect(() => {
    if (edit) form.setFieldsValue({ ...edit, fixedFees: edit.fixedFees || [], overridesList: Object.entries(edit.overrides || {}).map(([code, pct]) => ({ code, pct })) });
  }, [edit, form]);
  const submit = async () => {
    const v = await form.validateFields();
    const rule = { ...edit, ...v, overrides: Object.fromEntries((v.overridesList || []).filter((o) => o?.code).map((o) => [o.code, o.pct])), match: { modes: v.match?.modes || [], customerTiers: v.match?.customerTiers || [], originCountries: v.match?.originCountries || [], destCountries: v.match?.destCountries || [] } };
    delete rule.overridesList;
    const list = edit.id ? rules.map((r) => (r.id === edit.id ? rule : r)) : [...rules, { ...rule, id: `mr${Date.now()}`, active: true }];
    save(list, `margin rule “${rule.name}”`);
    setEdit(null);
  };
  const match = findMarginRule(rules, sim);
  const preview = applyMargin([{ code: 'FRT', desc: 'Freight', buy: sim.buyTotal * 0.8 }, { code: 'THO', desc: 'THC origin', buy: sim.buyTotal * 0.1 }, { code: 'DOC', desc: 'Docs', buy: sim.buyTotal * 0.1 }], match, sim);
  const cond = (r) => {
    const m = r.match || {};
    const parts = [m.modes?.length && m.modes.map((x) => MODES[x].label).join('/'), m.customerTiers?.length && `tier ${m.customerTiers.join('/')}`, m.originCountries?.length && `from ${m.originCountries.join('/')}`, m.destCountries?.length && `to ${m.destCountries.join('/')}`].filter(Boolean);
    return parts.length ? parts.join(' · ') : <i>any shipment</i>;
  };
  return (
    <Row gutter={16}>
      <Col xs={24} xl={16}>
        <Card size="small" title="Margin rules (first match by priority wins)" extra={<Button type="primary" icon={<PlusOutlined />} disabled={!isAdmin} onClick={() => setEdit({ name: '', priority: 50, markupPct: 12, minProfit: 100, roundTo: 5, match: {}, fixedFees: [], overrides: {} })}>Add rule</Button>}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={rules}
            rowClassName={(r) => (r.id === match?.id ? 'fp-row-ok' : '')}
            scroll={{ x: 800 }}
            columns={[
              { title: '#', dataIndex: 'priority', width: 50 },
              { title: 'Rule', dataIndex: 'name', render: (v, r) => <div><b>{v}</b><div className="fp-muted" style={{ fontSize: 12 }}>{cond(r)}</div></div> },
              { title: 'Markup', dataIndex: 'markupPct', render: (v, r) => <div>{v}%{Object.keys(r.overrides || {}).length > 0 && <div className="fp-muted" style={{ fontSize: 12 }}>{Object.entries(r.overrides).map(([c, p]) => `${c} ${p}%`).join(', ')}</div>}</div> },
              { title: 'Min. profit', dataIndex: 'minProfit', render: (v) => fmtMoney(v, tenant.currency) },
              { title: 'Round to', dataIndex: 'roundTo', render: (v) => v || '—' },
              { title: 'Fixed fees', dataIndex: 'fixedFees', render: (v) => (v?.length ? v.map((f) => <Tag key={f.code}>{f.code} {f.amount}</Tag>) : '—') },
              { title: 'Active', dataIndex: 'active', render: (v, r) => <Switch size="small" checked={v !== false} disabled={!isAdmin} onChange={(c) => save(rules.map((x) => (x.id === r.id ? { ...x, active: c } : x)), `margin rule “${r.name}” ${c ? 'enabled' : 'disabled'}`)} /> },
              { title: '', render: (r) => isAdmin && <Space><Button size="small" icon={<EditOutlined />} onClick={() => setEdit(r)} /><Popconfirm title="Delete rule?" onConfirm={() => save(rules.filter((x) => x.id !== r.id), `deleted margin rule “${r.name}”`)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card size="small" title="Rule tester">
          <Form layout="vertical" size="small">
            <Form.Item label="Mode"><Select value={sim.mode} onChange={(mode) => setSim({ ...sim, mode })} options={Object.entries(MODES).map(([value, m]) => ({ value, label: m.label }))} /></Form.Item>
            <Form.Item label="Customer tier"><Select value={sim.customerTier} onChange={(customerTier) => setSim({ ...sim, customerTier })} options={['A', 'B', 'C'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Space>
              <Form.Item label="Origin country"><Select allowClear style={{ width: 110 }} value={sim.originCountry} onChange={(originCountry) => setSim({ ...sim, originCountry })} options={COUNTRIES.map((c) => ({ value: c, label: c }))} /></Form.Item>
              <Form.Item label="Dest. country"><Select allowClear style={{ width: 110 }} value={sim.destCountry} onChange={(destCountry) => setSim({ ...sim, destCountry })} options={COUNTRIES.map((c) => ({ value: c, label: c }))} /></Form.Item>
            </Space>
            <Form.Item label="Buy total"><InputNumber style={{ width: '100%' }} value={sim.buyTotal} min={0} onChange={(buyTotal) => setSim({ ...sim, buyTotal: buyTotal || 0 })} addonAfter={tenant.currency} /></Form.Item>
          </Form>
          <Alert type={match ? 'success' : 'warning'} showIcon message={match ? `Matches “${match.name}”` : 'No rule matches — sold at cost'} description={<span>Sell {fmtMoney(preview.sellTotal, tenant.currency, 2)} · profit {fmtMoney(preview.profit, tenant.currency, 2)} · margin {preview.marginPct}%{preview.toppedUp > 0 && ` · topped up ${preview.toppedUp}`}</span>} />
        </Card>
      </Col>
      <Modal title={edit?.id ? `Edit “${edit.name}”` : 'New margin rule'} open={!!edit} onCancel={() => setEdit(null)} onOk={submit} width={720}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={16}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="priority" label="Priority (lower wins)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name={['match', 'modes']} label="Modes (empty = any)"><Select mode="multiple" options={Object.entries(MODES).map(([value, m]) => ({ value, label: m.label }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name={['match', 'customerTiers']} label="Customer tiers"><Select mode="multiple" options={['A', 'B', 'C'].map((v) => ({ value: v, label: `Tier ${v}` }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name={['match', 'originCountries']} label="Origin countries"><Select mode="multiple" options={COUNTRIES.map((c) => ({ value: c, label: c }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name={['match', 'destCountries']} label="Destination countries"><Select mode="multiple" options={COUNTRIES.map((c) => ({ value: c, label: c }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="markupPct" label="Markup %" rules={[{ required: true }]}><InputNumber min={-50} max={300} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="minProfit" label="Minimum profit"><InputNumber min={0} style={{ width: '100%' }} addonAfter={tenant.currency} /></Form.Item></Col>
            <Col span={8}><Form.Item name="roundTo" label="Round sell up to"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Divider orientation="left" plain>Per-charge markup overrides</Divider>
          <Form.List name="overridesList">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'code']}><Select style={{ width: 220 }} options={Object.entries(CHARGE_CODES).map(([value, l]) => ({ value, label: `${value} — ${l}` }))} /></Form.Item>
                    <Form.Item name={[f.name, 'pct']}><InputNumber addonAfter="%" /></Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                  </Space>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({ code: 'THD', pct: 0 })}>Add override</Button>
              </>
            )}
          </Form.List>
          <Divider orientation="left" plain>Fixed fees added to the quote</Divider>
          <Form.List name="fixedFees">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'code']}><Select style={{ width: 120 }} options={Object.keys(CHARGE_CODES).map((value) => ({ value, label: value }))} /></Form.Item>
                    <Form.Item name={[f.name, 'desc']}><Input placeholder="Description" /></Form.Item>
                    <Form.Item name={[f.name, 'amount']}><InputNumber min={0} addonAfter={tenant.currency} /></Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                  </Space>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({ code: 'HDL', desc: 'Handling fee', amount: 35 })}>Add fixed fee</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Row>
  );
}

function Templates() {
  const { tenant, run, user, scoped, lookup } = useStore();
  const [selected, setSelected] = useState(tenant.settings.quoteTemplates[0].id);
  const tpl = tenant.settings.quoteTemplates.find((t) => t.id === selected) || tenant.settings.quoteTemplates[0];
  const [draft, setDraft] = useState(tpl);
  useEffect(() => setDraft(tpl), [tpl]);
  const isAdmin = user.role === 'admin';
  const sampleQuote = scoped.quotes[0];
  const save = () => run(ops.updateSettings, { tenantId: tenant.id, section: 'quoteTemplates', value: tenant.settings.quoteTemplates.map((t) => (t.id === draft.id ? draft : t)), label: `quote template “${draft.name}”` }, { success: 'Template saved' });
  return (
    <Row gutter={16}>
      <Col xs={24} xl={10}>
        <Card size="small" title="Quote templates" extra={<Space><span className="fp-muted" style={{ fontSize: 12 }}>Default</span><Select size="small" disabled={!isAdmin} value={tenant.settings.defaultTemplateId} onChange={(v) => run(ops.updateSettings, { tenantId: tenant.id, section: 'defaultTemplateId', value: v, label: 'default quote template' })} options={tenant.settings.quoteTemplates.map((t) => ({ value: t.id, label: t.name }))} style={{ width: 170 }} /></Space>}>
          <Select value={selected} onChange={setSelected} style={{ width: '100%', marginBottom: 12 }} options={tenant.settings.quoteTemplates.map((t) => ({ value: t.id, label: t.name }))} />
          <Form layout="vertical" disabled={!isAdmin}>
            <Form.Item label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Form.Item>
            <Space wrap>
              <Form.Item label="Brand colour"><ColorPicker value={draft.accent} onChange={(c) => setDraft({ ...draft, accent: c.toHexString() })} /></Form.Item>
              <Form.Item label="Validity (days)"><InputNumber min={1} value={draft.validityDays} onChange={(v) => setDraft({ ...draft, validityDays: v })} /></Form.Item>
              <Form.Item label="Itemised charges"><Switch checked={draft.showBreakdown} onChange={(v) => setDraft({ ...draft, showBreakdown: v })} /></Form.Item>
              <Form.Item label="Show transit"><Switch checked={draft.showTransit} onChange={(v) => setDraft({ ...draft, showTransit: v })} /></Form.Item>
            </Space>
            <Form.Item label="Intro"><Input.TextArea rows={2} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} /></Form.Item>
            <Form.Item label="Terms (one per line)"><Input.TextArea rows={4} value={draft.terms.join('\n')} onChange={(e) => setDraft({ ...draft, terms: e.target.value.split('\n') })} /></Form.Item>
            <Form.Item label="Footer"><Input value={draft.footer} onChange={(e) => setDraft({ ...draft, footer: e.target.value })} /></Form.Item>
            <Button type="primary" onClick={save}>Save template</Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={14}>
        <Card size="small" title="Live preview (latest quote)">
          {sampleQuote ? <QuotePreview quote={sampleQuote} template={draft} tenant={tenant} customer={lookup.customer(sampleQuote.customerId)} rfq={lookup.rfq(sampleQuote.rfqId)} /> : <Typography.Text type="secondary">No quotes yet</Typography.Text>}
        </Card>
      </Col>
    </Row>
  );
}

function Workflows() {
  const { tenant, run, user } = useStore();
  const isAdmin = user.role === 'admin';
  const save = (kind, steps) => run(ops.updateSettings, { tenantId: tenant.id, section: 'workflows', value: { ...tenant.settings.workflows, [kind]: steps }, label: `${APPROVAL_KINDS[kind]} workflow` }, { success: 'Workflow saved' });
  return (
    <>
      {!isAdmin && ADMIN_ONLY}
      <Row gutter={[16, 16]}>
        {['quote', 'booking', 'arInvoice', 'apInvoice', 'notification'].map((kind) => {
          const steps = tenant.settings.workflows[kind] || [];
          const update = (i, patch) => save(kind, steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
          const move = (i, d) => {
            const next = [...steps];
            [next[i], next[i + d]] = [next[i + d], next[i]];
            save(kind, next);
          };
          return (
            <Col xs={24} xl={12} key={kind}>
              <Card size="small" title={APPROVAL_KINDS[kind]} extra={<Button size="small" icon={<PlusOutlined />} disabled={!isAdmin} onClick={() => save(kind, [...steps, { id: `w${Date.now()}`, name: 'New approval step', role: 'manager', condition: { type: 'always' }, active: true }])}>Add step</Button>}>
                {!steps.length && <Alert type="success" showIcon message="Fully automated — no human step" description={kind === 'notification' ? 'Customer updates are sent as soon as the milestone arrives (if auto-notify is on).' : 'The AI completes this step without approval.'} />}
                {steps.map((s, i) => (
                  <Card key={s.id} size="small" type="inner" style={{ marginBottom: 8 }} title={<Space><Tag>{i + 1}</Tag><Input size="small" variant="borderless" disabled={!isAdmin} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && update(i, { name: e.target.value })} style={{ fontWeight: 600, width: 260 }} /></Space>} extra={<Space size={2}><Switch size="small" checked={s.active !== false} disabled={!isAdmin} onChange={(v) => update(i, { active: v })} /><Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={!isAdmin || i === 0} onClick={() => move(i, -1)} /><Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={!isAdmin || i === steps.length - 1} onClick={() => move(i, 1)} /><Popconfirm title="Remove step?" onConfirm={() => save(kind, steps.filter((_, j) => j !== i))}><Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={!isAdmin} /></Popconfirm></Space>}>
                    <Space wrap>
                      <span className="fp-muted">Approver</span>
                      <Select size="small" disabled={!isAdmin} value={s.role} style={{ width: 160 }} onChange={(role) => update(i, { role })} options={Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label }))} />
                      <span className="fp-muted">when</span>
                      <Select size="small" disabled={!isAdmin} value={s.condition.type} style={{ width: 200 }} onChange={(type) => update(i, { condition: { type, value: CONDITION_TYPES[type].unit ? s.condition.value ?? 10 : undefined } })} options={Object.entries(CONDITION_TYPES).map(([value, c]) => ({ value, label: c.label }))} />
                      {CONDITION_TYPES[s.condition.type].unit && <InputNumber size="small" disabled={!isAdmin} value={s.condition.value} onChange={(value) => value != null && update(i, { condition: { ...s.condition, value } })} addonAfter={CONDITION_TYPES[s.condition.type].unit === '%' ? '%' : tenant.currency} style={{ width: 150 }} />}
                    </Space>
                    <div className="fp-muted" style={{ fontSize: 12, marginTop: 4 }}>{describeCondition(s.condition, tenant.currency)}</div>
                  </Card>
                ))}
              </Card>
            </Col>
          );
        })}
      </Row>
    </>
  );
}

function Automation() {
  const { tenant, run, user } = useStore();
  const s = tenant.settings;
  const isAdmin = user.role === 'admin';
  const set = (section, patch, label) => run(ops.updateSettings, { tenantId: tenant.id, section, value: { ...s[section], ...patch }, label });
  const allMilestones = [...new Map(Object.values(MILESTONES).flat().map((m) => [m.code, m])).values()];
  return (
    <>
      {!isAdmin && ADMIN_ONLY}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="RFQ extraction">
            <Typography.Text>Auto-accept threshold: <b>{Math.round(s.extraction.autoAcceptThreshold * 100)}%</b></Typography.Text>
            <Slider disabled={!isAdmin} min={0.6} max={0.99} step={0.01} value={s.extraction.autoAcceptThreshold} onChangeComplete={(v) => set('extraction', { autoAcceptThreshold: v }, 'extraction threshold')} tooltip={{ formatter: (v) => `${Math.round(v * 100)}%` }} />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>Fields below the threshold go to a human. Higher = safer, more manual review.</Typography.Paragraph>
            <Checkbox disabled={!isAdmin} checked={s.extraction.autoRequestRates} onChange={(e) => set('extraction', { autoRequestRates: e.target.checked }, 'auto rate requests')}>Automatically send rate requests after confident extraction</Checkbox>
          </Card>
          <Card size="small" title="Rate requests" style={{ marginTop: 16 }}>
            <Space wrap>
              <span>Minimum partners per RFQ</span>
              <InputNumber disabled={!isAdmin} min={1} max={6} value={s.rateRequests.minPartners} onChange={(v) => v && set('rateRequests', { minPartners: v }, 'rate request partners')} />
              <span>Reply deadline</span>
              <InputNumber disabled={!isAdmin} min={1} value={s.rateRequests.responseHours} addonAfter="hours" onChange={(v) => v && set('rateRequests', { responseHours: v }, 'rate reply deadline')} />
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Tracking & customer updates">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Checkbox disabled={!isAdmin} checked={s.tracking.autoNotify} onChange={(e) => set('tracking', { autoNotify: e.target.checked }, 'auto customer notifications')}>Send customer updates automatically (skip review)</Checkbox>
              <span>Notify customers on</span>
              <Select disabled={!isAdmin} mode="multiple" style={{ width: '100%' }} value={s.tracking.notifyOn} onChange={(notifyOn) => set('tracking', { notifyOn }, 'notification milestones')} options={allMilestones.map((m) => ({ value: m.code, label: `${m.code} — ${m.name}` }))} />
              <span>Default channel</span>
              <Select disabled={!isAdmin} style={{ width: 200 }} value={s.tracking.channel} onChange={(channel) => set('tracking', { channel }, 'notification channel')} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
            </Space>
          </Card>
          <Card size="small" title="AP reconciliation" style={{ marginTop: 16 }}>
            <Space wrap>
              <span>Tolerance</span>
              <InputNumber disabled={!isAdmin} min={0} step={0.5} value={s.ap.tolerancePct} addonAfter="%" onChange={(v) => v != null && set('ap', { tolerancePct: v }, 'AP tolerance %')} />
              <span>or</span>
              <InputNumber disabled={!isAdmin} min={0} value={s.ap.toleranceAbs} addonAfter={tenant.currency} onChange={(v) => v != null && set('ap', { toleranceAbs: v }, 'AP tolerance amount')} />
            </Space>
            <div style={{ marginTop: 12 }}>
              <span>Rebill unexpected costs with markup </span>
              <InputNumber disabled={!isAdmin} min={0} value={s.ap.rebillMarkupPct} addonAfter="%" onChange={(v) => v != null && set('ap', { rebillMarkupPct: v }, 'rebill markup')} />
            </div>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default function Settings() {
  const { tenant } = useStore();
  return (
    <>
      <PageHeader title="Tenant settings" subtitle={`Configuration for ${tenant.name} only — every forwarder has its own margin rules, templates, approval steps and automation`} />
      <Tabs
        items={[
          { key: 'org', label: 'Organization & residency', children: <Organization /> },
          { key: 'users', label: 'Users & roles', children: <Users /> },
          { key: 'margin', label: 'Margin rules', children: <MarginRules /> },
          { key: 'templates', label: 'Quote templates', children: <Templates /> },
          { key: 'workflows', label: 'Approval workflows', children: <Workflows /> },
          { key: 'automation', label: 'AI & automation', children: <Automation /> },
        ]}
      />
    </>
  );
}
