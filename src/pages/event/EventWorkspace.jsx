import React from 'react';
import { useWorkspace } from '../../platform/PlatformStore.jsx';
import { TAB_FEATURE } from '../../platform/entitlements.js';
import { UpgradeWall } from '../../platform/SaasChrome.jsx';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useStore, useEvent } from '../../store/AppStore.jsx';
import { Tabs, StageBadge, Badge, EmptyState, Icon } from '../../design-system/index.js';
import { fmtDate, diffDays } from '../../lib/dates.js';
import { clientOf, eventType } from '../../lib/derived.js';
import Overview from './Overview.jsx';
import ProposalTab from './ProposalTab.jsx';
import ContractTab from './ContractTab.jsx';
import PlanningTab from './PlanningTab.jsx';
import VendorsTab from './VendorsTab.jsx';
import GuestsTab from './GuestsTab.jsx';
import SeatingTab from './SeatingTab.jsx';
import BudgetTab from './BudgetTab.jsx';
import ChangeOrdersTab from './ChangeOrdersTab.jsx';
import RunOfShowTab from './RunOfShowTab.jsx';
import StaffTab from './StaffTab.jsx';
import FinanceTab from './FinanceTab.jsx';
import MessagesTab from './MessagesTab.jsx';
import PostEventTab from './PostEventTab.jsx';
import EventActivity from './EventActivity.jsx';
import TimelineTab from './TimelineTab.jsx';
import PeopleTab from './PeopleTab.jsx';
import SitePlanTab from './SitePlanTab.jsx';
import { productionIssues } from '../../lib/timeline.js';
import { staffingSummary } from '../../lib/workforce.js';

export default function EventWorkspace() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { state, today, user } = useStore();
  const ws = useWorkspace();
  const ev = useEvent(id);
  if (!ev) return <EmptyState>Event not found. <Link to="/events">Back</Link></EmptyState>;
  const et = eventType(state, ev);
  const tab = sp.get('tab') || 'overview';
  const issueCount = productionIssues(state, ev).filter((i) => i.level === 'danger' && i.kind !== 'staffing').length;
  const staffing = staffingSummary(ev);
  const f = et.features;
  const PHASES = [
    { id: 'overview', label: 'Overview', tabs: [{ id: 'overview', label: 'Overview' }] },
    { id: 'sell', label: 'Sell', tabs: [
      { id: 'proposal', label: 'Proposal', count: ev.proposals.length },
      { id: 'contract', label: 'Contract', alert: ev.contract && !ev.contract.immutable },
    ] },
    { id: 'plan', label: 'Plan', tabs: [
      { id: 'planning', label: 'Tasks & planning', count: ev.tasks.filter((t) => t.status !== 'done').length },
      { id: 'vendors', label: 'Vendors', count: ev.vendorBookings.length },
      { id: 'guests', label: f.registration ? 'Attendees' : 'Guests & RSVP', count: ev.households.reduce((a, h) => a + h.guests.length, 0) },
      f.seating && { id: 'seating', label: 'Seating' },
      { id: 'budget', label: 'Budget' },
      { id: 'co', label: 'Change orders', count: ev.changeOrders.filter((c) => !['approved', 'rejected'].includes(c.status)).length, alert: ev.changeOrders.some((c) => c.status === 'sent') },
    ].filter(Boolean) },
    { id: 'produce', label: 'Produce', tabs: [
      { id: 'timeline', label: 'Timeline', count: issueCount, alert: issueCount > 0 },
      { id: 'ros', label: 'Run of show' },
      { id: 'people', label: 'People', count: staffing.open, alert: staffing.open > 0 },
      { id: 'site', label: 'Site plan' },
      { id: 'staff', label: 'Crew shifts' },
    ] },
    { id: 'close', label: 'Money & close', tabs: [
      { id: 'finance', label: 'Finance' },
      { id: 'post', label: 'Post-event' },
    ] },
    { id: 'log', label: 'Messages & log', tabs: [
      { id: 'messages', label: 'Messages', count: ev.messages.length },
      { id: 'activity', label: 'Activity' },
    ] },
  ];
  const phase = PHASES.find((ph) => ph.tabs.some((t) => t.id === tab)) ?? PHASES[0];
  const Comp = { overview: Overview, proposal: ProposalTab, contract: ContractTab, planning: PlanningTab, vendors: VendorsTab, guests: GuestsTab, seating: SeatingTab, budget: BudgetTab, co: ChangeOrdersTab, ros: RunOfShowTab, timeline: TimelineTab, people: PeopleTab, site: SitePlanTab, staff: StaffTab, finance: FinanceTab, messages: MessagesTab, post: PostEventTab, activity: EventActivity }[tab] ?? Overview;
  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <div className="faint" style={{ fontSize: 12 }}><Link to="/events">Events</Link> / {et.name}</div>
          <h1>{ev.name}</h1>
          <div className="row">
            <StageBadge stage={ev.stage} />
            <Badge tone={ev.segment === 'social' ? 'info' : 'brand'}>{ev.segment}</Badge>
            {ev.date && <Badge>{fmtDate(ev.date, { weekday: 'short' })}{ev.date >= today ? ` · T-${diffDays(today, ev.date)}` : ''}</Badge>}
            {ev.dateStatus === 'locked' ? <Badge tone="ok"><Icon name="lock" size={12} /> Date locked</Badge> : ev.dateStatus === 'hold' ? <Badge tone="warn"><Icon name="hourglass" size={12} /> Date on hold until deposit</Badge> : null}
            <Badge>{ev.currency}</Badge>
            <span className="muted">{clientOf(state, ev)?.name}</span>
            {ev.poNumber && <Badge tone="info">PO {ev.poNumber}</Badge>}
          </div>
        </div>
        {['admin', 'planner', 'production'].includes(user.role) && <Link className="btn" to={`/dayof/${ev.id}`}><Icon name="play" size={14} /> Day-of mode</Link>}
      </div>
      <nav className="phase-nav" aria-label="Event workspace">
        <div className="phase-row" role="tablist" aria-label="Phase">
          {PHASES.map((ph) => {
            const alert = ph.tabs.some((t) => t.alert);
            return (
              <button key={ph.id} role="tab" aria-selected={ph.id === phase.id} className={`phase ${ph.id === phase.id ? 'on' : ''}`} onClick={() => setSp({ tab: ph.tabs[0].id })}>
                {ph.label}{alert && <span className="phase-dot" aria-label="needs attention" />}
              </button>
            );
          })}
        </div>
        {phase.tabs.length > 1 && <Tabs tabs={phase.tabs.map((t) => ({ ...t, label: t.alert ? <>{t.label} <span className="phase-dot inline" aria-hidden /></> : t.label }))} value={tab} onChange={(t) => setSp({ tab: t })} />}
      </nav>
      {ws && TAB_FEATURE[tab] && !ws.ent.features.has(TAB_FEATURE[tab]) ? <UpgradeWall feature={TAB_FEATURE[tab]} /> : <Comp key={ev.id} ev={ev} et={et} open={(t) => { setSp({ tab: t }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
    </div>
  );
}
