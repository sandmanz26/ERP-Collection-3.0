import { useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Popconfirm, Segmented, Space, Table, Tag, Tooltip, Typography, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import * as ops from '../store/ops.js';
import { pendingItems, KIND_LABELS } from '../lib/inbox.js';
import { PageHeader, RoleTag, TimeAgo, ConfTag } from '../components/common.jsx';
import { ROLES } from '../lib/reference.js';

export default function Approvals() {
  const { scoped, lookup, run, user } = useStore();
  const navigate = useNavigate();
  const [scope, setScope] = useState('mine');
  const [kind, setKind] = useState('all');
  const [rejecting, setRejecting] = useState(null);
  const [comment, setComment] = useState('');
  const all = useMemo(() => pendingItems(scoped, lookup), [scoped, lookup]);
  const mineFilter = (i) => user.role === 'admin' || i.role === user.role;
  const rows = all.filter((i) => (scope === 'all' || mineFilter(i)) && (kind === 'all' || i.kind === kind));
  const decide = (item, approve, c = '') => run(ops.decide, { kind: item.kind, id: item.id, subId: item.subId, approve, comment: c }, { success: approve ? `${item.ref} approved` : `${item.ref} rejected` });

  return (
    <>
      <PageHeader title="Approvals" subtitle="Human-in-the-loop queue: every critical AI step that needs a person, across all modules" />
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message={<span>You are acting as <b>{user.name}</b> (<RoleTag role={user.role} />). Steps for other roles are visible under “Everyone” but cannot be decided — use the user switcher in the top bar to act as another role.</span>}
      />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: `For my role (${all.filter(mineFilter).length})` }, { value: 'all', label: `Everyone (${all.length})` }]} />
          <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All types' }, ...Object.entries(KIND_LABELS).map(([value, k]) => ({ value, label: `${k.label} (${all.filter((i) => i.kind === value).length})` }))]} />
        </Space>
        <Table
          rowKey="key"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 1100 }}
          columns={[
            { title: 'Type', dataIndex: 'kind', width: 140, render: (v) => <Tag color={KIND_LABELS[v].color}>{KIND_LABELS[v].label}</Tag> },
            { title: 'Reference', dataIndex: 'ref', width: 190, render: (v, r) => <a onClick={() => navigate(r.link)} style={{ whiteSpace: 'nowrap' }}><b>{v}</b></a> },
            { title: 'What needs a decision', width: 440, render: (r) => <div><div>{r.title}{r.severity === 'high' && <Tag color="red" style={{ marginLeft: 6 }}>high</Tag>}</div><Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', maxWidth: 420 }} ellipsis={{ tooltip: r.detail }}>{r.detail}</Typography.Text></div> },
            { title: 'AI conf.', dataIndex: 'confidence', width: 90, render: (v) => (v != null ? <ConfTag value={v} /> : '—') },
            { title: 'Required role', dataIndex: 'role', width: 150, render: (v) => <RoleTag role={v} /> },
            { title: 'Waiting', dataIndex: 'since', width: 110, sorter: (a, b) => (a.since < b.since ? -1 : 1), render: (v) => <TimeAgo value={v} /> },
            {
              title: 'Decision',
              width: 210,
              fixed: 'right',
              render: (r) => {
                const allowed = mineFilter(r);
                if (!r.inline) return <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(r.link)}>Review</Button>;
                return (
                  <Tooltip title={allowed ? '' : `Requires ${ROLES[r.role]?.label}`}>
                    <Space size={4}>
                      <Popconfirm title={`Approve ${r.ref}?`} onConfirm={() => decide(r, true)} disabled={!allowed}>
                        <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!allowed}>Approve</Button>
                      </Popconfirm>
                      <Button size="small" danger icon={<CloseOutlined />} disabled={!allowed} onClick={() => setRejecting(r)} />
                      <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => navigate(r.link)} />
                    </Space>
                  </Tooltip>
                );
              },
            },
          ]}
        />
      </Card>
      <Modal
        title={`Reject ${rejecting?.ref}`}
        open={!!rejecting}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !comment.trim() }}
        onCancel={() => setRejecting(null)}
        onOk={() => {
          decide(rejecting, false, comment.trim());
          setRejecting(null);
          setComment('');
        }}
      >
        <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason (written to the audit log)" />
      </Modal>
    </>
  );
}
