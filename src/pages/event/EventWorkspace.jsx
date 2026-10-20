import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useStore, useEvent } from '../../store/AppStore.jsx';
import { Tabs, StageBadge, Badge, EmptyState } from '../../design-system/index.js';
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

export default function EventWorkspace() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { state, today, user } = useStore();
  const ev = useEvent(id);
  if (!ev) return <EmptyState>Event not found. <Link to="/events">Back</Link></EmptyState>;
  const et = eventType(state, ev);
  const tab = sp.get('tab') || 'overview';
  const f = et.features;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'proposal', label: 'Proposal', count: ev.proposals.length },
    { id: 'contract', label: 'Contract' },
    { id: 'planning', label: 'Planning', count: ev.tasks.filter((t) => t.status !== 'done').length },
    { id: 'vendors', label: 'Vendors', count: ev.vendorBookings.length },
    { id: 'guests', label: f.registration ? 'Attendees' : 'Guests & RSVP', count: ev.households.reduce((a, h) => a + h.guests.length, 0) },
    f.seating && { id: 'seating', label: 'Seating' },
    { id: 'budget', label: 'Budget' },
    { id: 'co', label: 'Change Orders', count: ev.changeOrders.filter((c) => c.status !== 'approved' && c.status !== 'rejected').length },
    { id: 'ros', label: 'Run of Show' },
    { id: 'staff', label: 'Crew' },
    { id: 'finance', label: 'Finance' },
    { id: 'messages', label: 'Messages', count: ev.messages.length },
    { id: 'post', label: 'Post-Event' },
    { id: 'activity', label: 'Activity' },
  ].filter(Boolean);
  const Comp = { overview: Overview, proposal: ProposalTab, contract: ContractTab, planning: PlanningTab, vendors: VendorsTab, guests: GuestsTab, seating: SeatingTab, budget: BudgetTab, co: ChangeOrdersTab, ros: RunOfShowTab, staff: StaffTab, finance: FinanceTab, messages: MessagesTab, post: PostEventTab, activity: EventActivity }[tab] ?? Overview;
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
            {ev.dateStatus === 'locked' ? <Badge tone="ok">🔒 Date locked</Badge> : ev.dateStatus === 'hold' ? <Badge tone="warn">⏳ Date on hold (deposit pending)</Badge> : null}
            <Badge>{ev.currency}</Badge>
            <span className="muted">{clientOf(state, ev)?.name}</span>
            {ev.poNumber && <Badge tone="info">PO {ev.poNumber}</Badge>}
          </div>
        </div>
        {['admin', 'planner', 'production'].includes(user.role) && <Link className="btn" to={`/dayof/${ev.id}`}>▶ Day-of mode</Link>}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setSp({ tab: t })} />
      <Comp ev={ev} et={et} />
    </div>
  );
}
