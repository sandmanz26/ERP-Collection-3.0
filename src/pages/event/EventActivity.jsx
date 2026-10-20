import React from 'react';
import { useStore } from '../../store/AppStore.jsx';
import { Card, Badge, download } from '../../components/ui.jsx';
import { fmtDateTime } from '../../lib/dates.js';
import { activityToMarkdown } from '../../lib/exportMd.js';

export default function EventActivity({ ev }) {
  const { state } = useStore();
  const log = state.activityLog.filter((l) => l.eventId === ev.id);
  return (
    <Card title={`Audit trail for this event (${log.length})`} actions={<button className="btn" onClick={() => download(`${ev.id}-activity.md`, activityToMarkdown(log, `Activity — ${ev.name}`), 'text/markdown')}>Export .md</button>}>
      <table className="t">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Summary</th></tr></thead>
        <tbody>{log.map((l) => <tr key={l.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.ts)}</td><td>{l.userName}<div className="faint">{l.role}</div></td><td><code>{l.type}</code></td><td>{l.status === 'rejected' ? <Badge tone="danger">rejected</Badge> : null} {l.summary}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
