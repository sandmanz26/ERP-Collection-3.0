import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore.jsx';
import { Card, Badge, download, PillSelect, Button, Icon } from '../design-system/index.js';
import { fmtDateTime } from '../lib/dates.js';
import { activityToMarkdown } from '../lib/exportMd.js';
import { useFeature } from '../platform/SaasChrome.jsx';

export default function ActivityLog() {
  const canExport = useFeature('auditExport');
  const { state, user } = useStore();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  let log = state.activityLog;
  if (user.role === 'crew') log = log.filter((l) => l.userId === user.id);
  log = log.filter((l) => (role === 'all' || l.role === role) && (status === 'all' || l.status === status) && (!q || `${l.summary} ${l.type} ${l.userName}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>Activity log (audit trail)</h1><div className="muted">Every action in the system — including rejected attempts and automation runs — is recorded here and can be exported as Markdown.</div></div>
        {canExport ? <Button variant="primary" onClick={() => download('activity-log.md', activityToMarkdown(log), 'text/markdown')}>Export .md</Button> : <Button disabled title="Audit log export is included in the Agency plan"><Icon name="lock" size={14} /> Export .md (Agency)</Button>}
      </div>
      <div className="row mb">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <PillSelect options={['all', 'admin', 'sales', 'planner', 'production', 'finance', 'crew', 'client', 'vendor', 'system']} value={role} onChange={setRole} />
        <PillSelect options={['all', 'ok', 'rejected']} value={status} onChange={setStatus} />
      </div>
      <Card>
        <div className="faint mb">{log.length} entries</div>
        <table className="t">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Event</th><th>Summary</th></tr></thead>
          <tbody>
            {log.slice(0, 500).map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.ts)}</td>
                <td>{l.userName}<div className="faint">{l.role}</div></td>
                <td><code>{l.type}</code></td>
                <td>{l.eventId && <Link to={`/events/${l.eventId}`}>{state.events.find((e) => e.id === l.eventId)?.name ?? l.eventId}</Link>}</td>
                <td>{l.status === 'rejected' && <Badge tone="danger">rejected</Badge>} {l.sync === 'pending' && <Badge tone="warn">offline · pending sync</Badge>}{l.sync === 'synced' && <Badge tone="ok">synced</Badge>} {l.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
