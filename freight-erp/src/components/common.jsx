import { useState } from 'react';
import { Button, Input, Modal, Popconfirm, Space, Steps, Tag, Tooltip, Typography, Badge, App } from 'antd';
import { CheckOutlined, CloseOutlined, CopyOutlined, RobotOutlined, UserOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MODES, CHANNELS, portByCode, ROLES } from '../lib/reference.js';
import { canApprove, currentStepIndex } from '../lib/approvals.js';
import { esc } from '../lib/connectors/cargowise.js';

dayjs.extend(relativeTime);

export const fmtMoney = (n, currency = 'USD', digits = 0) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const fmtNum = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: digits }));
export const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const fmtDateTime = (d) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—');
export const fromNow = (d) => (d ? dayjs(d).fromNow() : '—');

export const Money = ({ value, currency, digits = 0, strong }) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined }}>{fmtMoney(value, currency, digits)}</span>;

export const TimeAgo = ({ value }) => (value ? <Tooltip title={fmtDateTime(value)}><span>{fromNow(value)}</span></Tooltip> : '—');

const FLAGS = { ID: '🇮🇩', SG: '🇸🇬', CN: '🇨🇳', HK: '🇭🇰', KR: '🇰🇷', VN: '🇻🇳', TH: '🇹🇭', MY: '🇲🇾', IN: '🇮🇳', AE: '🇦🇪', DE: '🇩🇪', NL: '🇳🇱', BE: '🇧🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺' };
export const flag = (country) => FLAGS[country] || '🏳️';

export const Port = ({ code, short }) => {
  const p = portByCode[code];
  if (!p) return <span>{code || '—'}</span>;
  return (
    <Tooltip title={`${p.name}, ${p.country} · UN/LOCODE ${p.code}`}>
      <span>{flag(p.country)} {short ? p.code : p.name}</span>
    </Tooltip>
  );
};
export const Lane = ({ origin, destination, short }) => (
  <span style={{ whiteSpace: 'nowrap' }}>
    <Port code={origin} short={short} /> <span className="fp-muted">→</span> <Port code={destination} short={short} />
  </span>
);

export const ModeTag = ({ mode }) => (mode ? <Tag color={MODES[mode]?.color}>{MODES[mode]?.label || mode}</Tag> : <Tag>—</Tag>);
export const ChannelTag = ({ channel }) => <Tag color={CHANNELS[channel]?.color}>{CHANNELS[channel]?.label || channel}</Tag>;
export const RoleTag = ({ role }) => <Tag color={ROLES[role]?.color}>{ROLES[role]?.label || role}</Tag>;

export function ConfTag({ value, threshold = 0.9 }) {
  if (value == null) return <Tag>—</Tag>;
  const pct = Math.round(value * 100);
  const color = value === 0 ? 'red' : value >= threshold ? 'green' : value >= 0.75 ? 'gold' : 'red';
  return <Tag color={color} style={{ fontVariantNumeric: 'tabular-nums' }}>{value === 0 ? 'missing' : `${pct}%`}</Tag>;
}

const STATUS = {
  rfq: { new: ['default', 'New'], review: ['orange', 'Needs review'], ready: ['blue', 'Ready to source'], sourcing: ['processing', 'Awaiting rates'], rates_in: ['cyan', 'Rates received'], quoted: ['purple', 'Quoted'], won: ['green', 'Won'], lost: ['red', 'Lost'] },
  quote: { draft: ['default', 'Draft'], pending_approval: ['orange', 'Pending approval'], approved: ['blue', 'Approved'], sent: ['geekblue', 'Sent'], accepted: ['green', 'Accepted'], rejected: ['red', 'Rejected'], expired: ['default', 'Expired'] },
  shipment: { booking_pending: ['orange', 'Booking pending'], booking_hold: ['red', 'Booking on hold'], booked: ['blue', 'Booked'], in_transit: ['processing', 'In transit'], arrived: ['cyan', 'Arrived'], delivered: ['green', 'Delivered'], closed: ['default', 'Closed'] },
  document: { validated: ['green', 'Validated'], mismatch: ['red', 'Mismatch'], resolved: ['blue', 'Resolved'], correction_requested: ['orange', 'Correction requested'] },
  ar: { draft: ['default', 'Draft'], pending_approval: ['orange', 'Pending approval'], approved: ['blue', 'Approved'], posted: ['green', 'Posted to CW'] },
  ap: { matched: ['green', 'Auto-matched'], variance: ['red', 'Variance'], approved: ['blue', 'Approved'], posted: ['green', 'Posted to CW'], disputed: ['volcano', 'Disputed'] },
  rate: { sent: ['processing', 'Awaiting reply'], replied: ['green', 'Replied'], declined: ['default', 'Declined'], no_reply: ['default', 'No reply'] },
  connector: { connected: ['green', 'Connected'], error: ['red', 'Error'], disabled: ['default', 'Disabled'] },
  notification: { draft: ['orange', 'Awaiting review'], sent: ['green', 'Sent'], discarded: ['default', 'Discarded'] },
  issue: { open: ['red', 'Open'], accepted_doc: ['blue', 'Record updated'], overridden: ['purple', 'Record kept'], correction_requested: ['orange', 'Correction requested'] },
  hitl: { auto: ['green', 'Auto'], pending: ['orange', 'Needs human'], approved: ['blue', 'Human approved'], rejected: ['red', 'Human rejected'] },
};
export const statusLabel = (kind, status) => STATUS[kind]?.[status]?.[1] || status;
export const statusOptions = (kind) => Object.entries(STATUS[kind]).map(([value, [, label]]) => ({ value, label }));

export function StatusTag({ kind, status }) {
  const [color, label] = STATUS[kind]?.[status] || ['default', status || '—'];
  if (color === 'processing') return <Badge status="processing" text={label} />;
  return <Tag color={color}>{label}</Tag>;
}

export const ActorTag = ({ type, name }) => {
  const icon = type === 'ai' ? <RobotOutlined /> : type === 'system' ? <SettingOutlined /> : <UserOutlined />;
  const color = type === 'ai' ? 'purple' : type === 'system' ? 'default' : 'blue';
  return <Tag icon={icon} color={color}>{name}</Tag>;
};

export function PageHeader({ title, subtitle, extra }) {
  return (
    <div className="fp-page-head">
      <div>
        <Typography.Title level={3}>{title}</Typography.Title>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}

function highlightXml(xml) {
  return esc(xml)
    .replace(/(&lt;\/?)([\w:]+)/g, '$1<span class="t">$2</span>')
    .replace(/([\w:]+)=(&quot;.*?&quot;)/g, '<span class="a">$1</span>=$2');
}

export function CodeViewer({ body, format = 'xml' }) {
  const { message } = App.useApp();
  return (
    <div style={{ position: 'relative' }}>
      <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', right: 10, top: 8, zIndex: 1 }} onClick={() => { navigator.clipboard?.writeText(body); message.success('Copied'); }}>
        Copy
      </Button>
      {format === 'xml' ? <pre className="fp-xml" dangerouslySetInnerHTML={{ __html: highlightXml(body) }} /> : <pre className="fp-xml">{body}</pre>}
    </div>
  );
}

/** Sequential approval chain with approve / reject controls for the current step. */
export function ApprovalChain({ chain, user, onDecide, compact }) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  if (!chain?.length) return <Typography.Text type="secondary">No approval steps required by this tenant's workflow.</Typography.Text>;
  const idx = currentStepIndex(chain);
  const step = chain[idx];
  const allowed = step && canApprove(user, step);
  return (
    <div>
      <Steps
        size="small"
        direction={compact ? 'horizontal' : 'vertical'}
        current={idx < 0 ? chain.length : idx}
        status={chain.some((s) => s.status === 'rejected') ? 'error' : idx < 0 ? 'finish' : 'process'}
        items={chain.map((s) => ({
          title: s.name,
          description: (
            <span style={{ fontSize: 12 }}>
              <RoleTag role={s.role} />
              {s.status === 'approved' && `Approved by ${s.by} · ${fmtDateTime(s.at)}`}
              {s.status === 'rejected' && `Rejected by ${s.by}: “${s.comment}”`}
              {s.status === 'pending' && (s === step ? 'Waiting for decision' : 'Queued')}
            </span>
          ),
        }))}
      />
      {step && onDecide && (
        <Space style={{ marginTop: 8 }} wrap>
          <Tooltip title={allowed ? '' : `Requires role "${ROLES[step.role]?.label}". Switch user in the top bar.`}>
            <Popconfirm title={`Approve “${step.name}”?`} onConfirm={() => onDecide(true, '')} disabled={!allowed}>
              <Button type="primary" icon={<CheckOutlined />} disabled={!allowed}>Approve</Button>
            </Popconfirm>
          </Tooltip>
          <Button danger icon={<CloseOutlined />} disabled={!allowed} onClick={() => setRejecting(true)}>Reject</Button>
        </Space>
      )}
      <Modal
        title={`Reject “${step?.name}”`}
        open={rejecting}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !comment.trim() }}
        onCancel={() => setRejecting(false)}
        onOk={() => {
          onDecide(false, comment.trim());
          setRejecting(false);
          setComment('');
        }}
      >
        <Typography.Paragraph type="secondary">A reason is required and is written to the audit log.</Typography.Paragraph>
        <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason for rejection" />
      </Modal>
    </div>
  );
}

export const Field = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
    <div>{children ?? '—'}</div>
  </div>
);
