// Markdown export of the in-app activity log (audit trail).
export function activityToMarkdown(log, title = 'Activity Log') {
  const lines = [`# ${title}`, '', `Exported: ${new Date().toISOString()}`, `Entries: ${log.length}`, '', '| # | Timestamp | User | Role | Action | Event | Status | Summary |', '|---|---|---|---|---|---|---|---|'];
  log.forEach((l, i) => {
    const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${log.length - i} | ${l.ts} | ${esc(l.userName)} | ${l.role} | \`${l.type}\` | ${l.eventId ?? ''} | ${l.status}${l.sync ? ` (${l.sync})` : ''} | ${esc(l.summary)} |`);
  });
  return lines.join('\n');
}
