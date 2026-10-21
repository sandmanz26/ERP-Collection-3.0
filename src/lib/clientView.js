// Client panel: what an end client may see about their event — progress, timeline, what to prepare, payments, people.
// Pure, client-safe selectors. Never expose costs, margins, vendor buy prices, crew rates or internal notes from here.
import { addDays, diffDays } from './dates.js';
import { STAGES, stageIndex, stageLabel, isExit } from './lifecycle.js';
import { invoiceStatus, invoiceBalance, headcount, paidAmount } from './derived.js';
import { staffingSummary } from './workforce.js';
import { clientCan } from './permissions.js';
import { stageDates } from './eventGuide.js';
import { weatherCall, vendorGaps } from './risk.js';

const at = (s) => stageIndex(s);
const sum = (a, f) => Math.round(a.reduce((x, y) => x + f(y), 0) * 100) / 100;

/** The client's journey in plain language. `done(ev)` decides completion; the first open step is "current". */
export const JOURNEY = [
  { id: 'proposal', label: 'Proposal', about: 'We shape the plan and the price with you.', you: 'Review the proposal, pick optional extras and accept it.', done: (ev) => at(ev.stage) >= at('booked') },
  { id: 'contract', label: 'Contract', about: 'The agreement is signed by everyone.', you: 'Sign the contract online.', done: (ev) => at(ev.stage) >= at('booked') },
  { id: 'secured', label: 'Date secured', about: 'Your deposit locks the date — no one else can book it.', you: 'Pay the deposit invoice.', done: (ev) => at(ev.stage) >= at('planning') && (ev.dateStatus === 'locked' || at(ev.stage) >= at('event_day')) },
  { id: 'planning', label: 'Planning', about: 'Design, vendors, guests and the event-day schedule come together.', you: 'Tick off your checklist, complete planning forms, manage your guest list.', done: (ev) => at(ev.stage) >= at('details_locked') },
  { id: 'final', label: 'Final details', about: 'Final headcount is confirmed; later changes need a change order.', you: 'Confirm the final guest count and seating.', done: (ev) => at(ev.stage) >= at('pre_event') },
  { id: 'ready', label: 'Final prep', about: 'Run of show, crew and deliveries are confirmed with every vendor.', you: 'Settle the final balance and relax — we take it from here.', done: (ev) => at(ev.stage) >= at('event_day') },
  { id: 'day', label: 'Event day', about: 'Your planner and the crew run the day on site.', you: 'Enjoy it. Your day-of coordinator is your single point of contact.', done: (ev) => at(ev.stage) >= at('post_event') },
  { id: 'wrap', label: 'Wrap-up', about: 'Returns, final invoices and your feedback.', you: 'Tell us how we did.', done: (ev) => ev.stage === 'archived' || at(ev.stage) >= at('financial_close') },
];

export function clientJourney(state, ev) {
  const exit = isExit(ev.stage);
  const view = exit ? { ...ev, stage: ev.prevStage ?? 'lead' } : ev;
  const d = stageDates(ev);
  const target = {
    final: ev.date && addDays(ev.date, -state.settings.finalHeadcountDays),
    day: ev.date,
    wrap: ev.date && addDays(ev.date, 7),
  };
  const doneAt = { proposal: d.negotiation ?? d.booked, contract: ev.contract?.signedAt?.slice(0, 10) ?? d.booked, secured: d.planning, planning: d.details_locked, final: d.pre_event, ready: d.event_day ?? ev.date, day: ev.date, wrap: d.archived ?? d.financial_close };
  let currentSeen = false;
  const steps = JOURNEY.map((j) => {
    const done = j.done(view);
    const status = done ? 'done' : currentSeen || exit ? 'todo' : 'current';
    if (status === 'current') currentSeen = true;
    return { id: j.id, label: j.label, about: j.about, you: j.you, status, date: done ? doneAt[j.id] ?? null : target[j.id] ?? null, target: !done && !!target[j.id] };
  });
  if (exit) {
    const cut = steps.findIndex((s) => s.status !== 'done');
    steps.splice(cut === -1 ? steps.length : cut, steps.length, { id: ev.stage, label: stageLabel(ev.stage), about: 'This event will not go ahead.', you: 'Your planner will contact you about any refunds.', status: 'exit', date: (ev.stageHistory || []).find((h) => h.stage === ev.stage)?.at.slice(0, 10) ?? null });
  }
  const doneCount = steps.filter((s) => s.status === 'done').length;
  return { steps, current: steps.find((s) => s.status === 'current') ?? steps.at(-1), pct: Math.round((doneCount / JOURNEY.length) * 100) };
}

/** Invoices/schedule rows this client user may see (payer-scoped users only see their own share). */
function visibleMoney(ev, user) {
  if (clientCan(user, 'view_all')) return { invoices: ev.invoices, schedule: ev.paymentSchedule, scoped: false };
  const payer = ev.payers.find((p) => p.userId === user.id);
  if (!payer || !clientCan(user, 'pay')) return null;
  const invoices = ev.invoices.filter((i) => i.payerId === payer.id);
  return { invoices, schedule: ev.paymentSchedule.filter((s) => invoices.some((i) => i.id === s.invoiceId)), scoped: true, payer };
}

export function clientPayments(ev, user, today) {
  const v = visibleMoney(ev, user);
  if (!v) return null;
  const live = v.schedule.filter((s) => s.status !== 'cancelled');
  const extraInvoices = v.invoices.filter((i) => !live.some((s) => s.invoiceId === i.id)); // damage, late fees…
  const rows = live.map((s) => {
    const inv = ev.invoices.find((i) => i.id === s.invoiceId);
    const status = s.status === 'paid' ? 'paid' : inv ? invoiceStatus(ev, inv, today) : 'scheduled';
    return { id: s.id, label: s.label, dueDate: s.dueDate, amount: s.amount, balance: inv ? invoiceBalance(ev, inv) : s.amount, status, invoice: inv, isDeposit: !!s.isDeposit, fromChangeOrder: s.source === 'change_order' };
  }).concat(extraInvoices.map((i) => ({ id: i.id, label: i.label, dueDate: i.dueDate, amount: i.amount + (i.lateFeeApplied || 0), balance: invoiceBalance(ev, i), status: invoiceStatus(ev, i, today), invoice: i })))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const total = sum(rows, (r) => r.amount);
  const paid = v.scoped ? sum(ev.payments.filter((p) => v.invoices.some((i) => i.id === p.invoiceId)), (p) => p.amount) : paidAmount(ev);
  const open = rows.filter((r) => r.status !== 'paid');
  const next = open[0] ?? null;
  return {
    rows, total, paid, remaining: Math.max(0, Math.round((total - paid) * 100) / 100), pct: total ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    next, nextInDays: next?.dueDate ? diffDays(today, next.dueDate) : null, overdue: open.filter((r) => r.status === 'overdue'),
    scoped: v.scoped, payer: v.payer, changeOrders: rows.filter((r) => r.fromChangeOrder),
  };
}

/** Everything the client should prepare, as one list (tasks, forms, decisions, signatures, payments, guests). */
export function clientPrep(state, ev, user, today) {
  const can = (p) => clientCan(user, p);
  const items = [];
  const push = (o) => items.push({ done: false, ...o });
  if (can('view_all')) ev.tasks.filter((t) => t.assigneeType === 'client').forEach((t) => push({ id: t.id, kind: 'task', category: t.category, title: t.title, due: t.dueDate, done: t.status === 'done', tab: 'prep', taskId: t.id }));
  if (can('forms')) ev.forms.forEach((f) => push({ id: f.id, kind: 'form', category: 'planning', title: `Complete “${f.name}”`, due: ev.date ? addDays(ev.date, -state.settings.finalHeadcountDays - 7) : null, done: !!f.submittedAt, tab: 'forms', cta: 'Open form' }));
  const v = ev.proposals.find((p) => p.status === 'active');
  if (v && can('approve_costs')) push({ id: `prop-${v.id}`, kind: 'decision', category: 'decisions', title: `Review & accept proposal v${v.version}`, due: v.validUntil, tab: 'proposal', cta: 'Review' });
  const mySigner = ev.contract?.signers.find((s) => s.email?.toLowerCase() === user.email?.toLowerCase());
  if (mySigner && ev.contract.status !== 'draft' && can('sign')) push({ id: 'sign', kind: 'decision', category: 'decisions', title: 'Sign the contract', due: null, done: !!mySigner.signedAt, tab: 'contract', cta: 'Sign' });
  if (can('approve_costs')) ev.changeOrders.filter((c) => c.status === 'sent' || c.status === 'approved').forEach((c) => push({ id: c.id, kind: 'decision', category: 'decisions', title: `Approve change order ${c.number}: ${c.title}`, due: null, done: c.status === 'approved', tab: 'co', cta: 'Review' }));
  const money = clientPayments(ev, user, today);
  money?.rows.forEach((r) => push({ id: `pay-${r.id}`, kind: 'payment', category: 'payments', title: `Pay ${r.label}`, due: r.dueDate, done: r.status === 'paid', amount: r.balance, tab: 'payments', cta: 'Pay' }));
  if (can('manage_guests') && ev.date && ev.households.length) {
    const hc = headcount(ev);
    push({ id: 'rsvp', kind: 'guests', category: 'guests', title: hc.pending ? `Chase ${hc.pending} guests who have not replied` : 'Collect RSVPs', due: addDays(ev.date, -state.settings.rsvpDeadlineDays), done: hc.pending === 0, tab: 'guests', cta: 'Open guests' });
    push({ id: 'final-hc', kind: 'guests', category: 'guests', title: 'Confirm the final guest count', due: addDays(ev.date, -state.settings.finalHeadcountDays), done: !!ev.finalHeadcount, tab: 'guests', cta: 'Open guests' });
  }
  const bucket = (i) => {
    if (i.done) return 'done';
    if (!i.due) return 'anytime';
    const d = diffDays(today, i.due);
    return d < 0 ? 'overdue' : d <= 30 ? 'soon' : 'later';
  };
  const withBucket = items.map((i) => ({ ...i, bucket: bucket(i) })).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const groups = [
    { id: 'overdue', label: 'Overdue', tone: 'danger' },
    { id: 'soon', label: 'Next 30 days', tone: 'warning' },
    { id: 'anytime', label: 'Whenever you are ready', tone: 'info' },
    { id: 'later', label: 'Later', tone: 'neutral' },
    { id: 'done', label: 'Done', tone: 'success' },
  ].map((g) => ({ ...g, items: withBucket.filter((i) => i.bucket === g.id) })).filter((g) => g.items.length);
  const total = withBucket.length;
  const done = withBucket.filter((i) => i.done).length;
  return { items: withBucket, groups, total, done, open: total - done, overdue: withBucket.filter((i) => i.bucket === 'overdue').length, pct: total ? Math.round((done / total) * 100) : 100 };
}

/** One dated list of everything on the road to the event (and the event itself). */
export function clientTimeline(state, ev, user, today) {
  const d = stageDates(ev);
  const rows = [];
  const add = (o) => o.date && rows.push(o);
  add({ id: 'inquiry', date: d.lead, kind: 'milestone', title: 'Inquiry received' });
  ev.proposals.filter((p) => p.acceptedAt).forEach((p) => add({ id: `acc-${p.id}`, date: p.acceptedAt.slice(0, 10), kind: 'milestone', title: `Proposal v${p.version} accepted`, tab: 'proposal' }));
  add({ id: 'signed', date: ev.contract?.signedAt?.slice(0, 10), kind: 'milestone', title: 'Contract signed', tab: 'contract' });
  add({ id: 'locked', date: d.planning, kind: 'milestone', title: 'Deposit paid — date secured', tab: 'payments' });
  clientPrep(state, ev, user, today).items.filter((i) => i.due && i.kind !== 'payment').forEach((i) => add({ id: `prep-${i.id}`, date: i.due, kind: i.kind === 'guests' ? 'deadline' : 'todo', title: i.title, done: i.done, tab: i.tab }));
  clientPayments(ev, user, today)?.rows.forEach((r) => add({ id: `pay-${r.id}`, date: r.dueDate, kind: 'payment', title: r.label, amount: r.amount, done: r.status === 'paid', overdue: r.status === 'overdue', tab: 'payments' }));
  const w = weatherCall(state, ev);
  if (w) add({ id: 'weather', date: w.due.slice(0, 10), kind: 'deadline', title: w.decided ? `Weather call made: Plan ${w.decision}` : `Weather call for ${w.function} (we decide)`, done: w.decided, detail: `A: ${w.planA} · B: ${w.planB}` });
  (ev.subEvents.length ? ev.subEvents : ev.date ? [{ id: 'main', name: ev.name, date: ev.date }] : []).forEach((s) => add({ id: `se-${s.id}`, date: s.date ?? ev.date, kind: 'event', title: s.name, detail: [s.start && `${s.start}${s.end ? `–${s.end}` : ''}`, s.room ?? s.venue].filter(Boolean).join(' · '), tab: 'timeline' }));
  return rows.map((r) => ({ ...r, past: r.date < today, overdue: r.overdue ?? (!r.done && r.date < today && ['todo', 'deadline', 'payment'].includes(r.kind)), isToday: r.date === today }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'event') - (b.kind === 'event'));
}

/** Gantt lanes for the client road map (units = days from start). */
export function clientRoadmap(state, ev, user, today) {
  if (!ev.date) return null;
  const tl = clientTimeline(state, ev, user, today);
  const start = [ev.createdAt?.slice(0, 10) ?? today, ...tl.map((r) => r.date)].sort()[0];
  const end = addDays([ev.date, ...tl.map((r) => r.date)].sort().at(-1), 10);
  const x = (dt) => diffDays(start, dt);
  const tone = (r) => (r.done ? 'ok' : r.overdue ? 'danger' : r.kind === 'deadline' ? 'warn' : r.kind === 'milestone' ? 'brand' : 'neutral');
  const lane = (id, label, kinds, opts = {}) => ({ id, label, items: tl.filter((r) => kinds.includes(r.kind)).map((r) => ({ id: r.id, start: x(r.date), end: r.kind === 'event' ? x(r.date) + 1 : undefined, milestone: r.kind !== 'event', label: r.title, tone: r.kind === 'event' ? 'danger' : tone(r), showLabel: opts.labels, href: r.tab, meta: r.date })) });
  const j = clientJourney(state, ev);
  const lanes = [
    { id: 'journey', label: 'Journey', items: j.steps.filter((s) => s.date).map((s) => ({ id: `j-${s.id}`, start: x(s.date), milestone: true, label: s.label, tone: s.status === 'done' ? 'ok' : s.status === 'current' ? 'brand' : 'neutral', showLabel: s.status !== 'todo', meta: s.date })) },
    lane('todo', 'Your to-dos', ['todo']),
    lane('deadline', 'Guest deadlines', ['deadline'], { labels: true }),
    lane('payment', 'Payments', ['payment']),
    lane('event', 'Event', ['event']),
  ].filter((l) => l.items.length);
  return { start, range: [0, x(end)], lanes, markers: [{ at: x(today), label: 'Today', tone: 'brand' }, { at: x(ev.date), label: 'Event', tone: 'danger' }], toDate: (n) => addDays(start, n) };
}

/** The guest-facing schedule for the day(s): run-of-show guest track only (no production cues or notes). */
export function clientAgenda(ev) {
  const sub = (id) => ev.subEvents.find((s) => s.id === id);
  const items = ev.ros.items.filter((i) => i.track === 'guest').map((i) => {
    const s = sub(i.subEventId);
    return { id: i.id, date: s?.date ?? ev.date, start: i.start, duration: i.duration, activity: i.activity, location: i.location, session: s?.name, status: i.liveStatus };
  });
  const sessions = ev.subEvents.filter((s) => !items.some((i) => i.session === s.name)).map((s) => ({ id: s.id, date: s.date ?? ev.date, start: s.start, duration: null, activity: s.name, location: [s.room, s.venue].filter(Boolean).join(' · '), session: s.name }));
  const all = [...items, ...sessions].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const days = [...new Set(all.map((i) => i.date))];
  return { draft: ev.ros.status !== 'final', days: days.map((dt) => ({ date: dt, items: all.filter((i) => i.date === dt) })) };
}

/** The people behind the event, client-safe: names, roles, how to reach them, when they arrive. No rates, no costs. */
export function clientTeam(state, ev) {
  const staffOf = (uid) => state.staff.find((s) => s.userId === uid);
  const core = [];
  const seen = new Set();
  const addCore = (o) => { if (o.name && !seen.has(o.name)) { seen.add(o.name); core.push(o); } };
  const planner = state.users.find((u) => u.id === ev.plannerId);
  if (planner) addCore({ name: planner.name, role: 'Lead planner', note: 'Your main contact from now to the event', email: planner.email, phone: staffOf(planner.id)?.phone ?? planner.phone, primary: true });
  ev.shifts.forEach((s) => {
    const st = state.staff.find((x) => x.id === s.staffId);
    if (st) addCore({ name: st.name, role: s.role, note: `On site ${s.start}–${s.end}`, phone: /coordinator|captain|planner/i.test(s.role) ? st.phone : null, dayOf: /coordinator/i.test(s.role) });
  });
  const sales = state.users.find((u) => u.id === ev.salesId);
  if (sales) addCore({ name: sales.name, role: 'Account manager', note: 'Proposal & contract', email: sales.email });
  const vendors = ev.vendorBookings.filter((b) => b.status !== 'cancelled').map((b) => {
    const v = state.vendors.find((x) => x.id === b.vendorId);
    return { id: b.id, name: v?.name ?? 'Vendor', category: b.category, service: b.service, confirmed: b.status === 'confirmed', arrival: b.loadIn ?? null, contact: b.status === 'confirmed' ? b.onsiteContact : null };
  });
  // A cancelled vendor not yet replaced is shown honestly as "being replaced", never silently dropped.
  vendorGaps(ev).forEach((g) => vendors.push({ id: g.booking.id, name: 'Replacement being booked', category: g.category, service: g.booking.service, confirmed: false, replacing: true, arrival: null, contact: null }));
  vendors.sort((a, b) => a.category.localeCompare(b.category));
  const st = staffingSummary(ev);
  const depts = {};
  st.rows.forEach((r) => {
    const k = r.p.department;
    depts[k] ??= { department: k, people: 0, confirmed: 0, roles: [] };
    depts[k].people += r.p.qty;
    depts[k].confirmed += Math.min(r.p.qty, r.confirmed);
    depts[k].roles.push(`${r.p.qty} × ${r.p.role}${r.p.company ? ` (${r.p.company})` : ''}`);
  });
  return { core, vendors, crew: Object.values(depts), crewTotal: st.required, crewConfirmed: st.confirmed, venue: ev.venue };
}

/** Recent client-safe updates, newest first. */
export function clientUpdates(state, ev, user, limit = 8) {
  const out = [];
  const showMoney = !!clientPayments(ev, user, new Date().toISOString().slice(0, 10));
  (ev.stageHistory || []).forEach((h) => {
    if (STAGES.some((x) => x.id === h.stage) && at(h.stage) > at('lead')) out.push({ at: h.at, icon: 'flag', text: `Moved to ${stageLabel(h.stage).replace(' (Booked)', '')}` });
  });
  if (showMoney) ev.payments.filter((p) => p.amount > 0).forEach((p) => out.push({ at: p.at, icon: 'money', text: 'Payment received — thank you', money: p.amount }));
  ev.vendorBookings.filter((b) => b.confirmedAt && b.status === 'confirmed').forEach((b) => out.push({ at: b.confirmedAt, icon: 'truck', text: `${state.vendors.find((v) => v.id === b.vendorId)?.name ?? 'Vendor'} confirmed (${b.category})` }));
  ev.decisions.forEach((dc) => out.push({ at: dc.approvedAt, icon: 'check', text: `Decision recorded: ${dc.decision}` }));
  ev.forms.filter((f) => f.submittedAt).forEach((f) => out.push({ at: f.submittedAt, icon: 'file', text: `Form submitted: ${f.name}` }));
  ev.changeOrders.filter((c) => c.status === 'sent').forEach((c) => out.push({ at: c.sentAt ?? c.createdAt, icon: 'edit', text: `Change order ${c.number} sent for approval` }));
  (ev.clientNotices || []).filter((n) => n.audience !== 'money' || showMoney).forEach((n) => out.push({ at: n.at, icon: n.tone === 'danger' ? 'alert' : n.tone === 'warning' ? 'info' : 'check', text: n.text, tone: n.tone }));
  return out.filter((u) => u.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Progress by area for the client — only areas this user may see. */
export function clientProgress(state, ev, user, today) {
  const prep = clientPrep(state, ev, user, today);
  const money = clientPayments(ev, user, today);
  const team = clientTeam(state, ev);
  const hc = headcount(ev);
  const areas = [
    { id: 'prep', label: 'Your to-dos', icon: 'checkSquare', value: `${prep.done}/${prep.total}`, pct: prep.pct, tab: 'prep', warn: prep.overdue > 0, sub: prep.overdue ? `${prep.overdue} overdue` : `${prep.open} open` },
    money && { id: 'pay', label: 'Paid', icon: 'wallet', value: `${money.pct}%`, pct: money.pct, tab: 'payments', warn: money.overdue.length > 0, sub: money.overdue.length ? `${money.overdue.length} overdue` : money.next ? `next ${money.next.label}` : 'all settled', money: true },
    team.vendors.length && { id: 'vendors', label: 'Vendors confirmed', icon: 'truck', value: `${team.vendors.filter((v) => v.confirmed).length}/${team.vendors.length}`, pct: Math.round((team.vendors.filter((v) => v.confirmed).length / team.vendors.length) * 100), tab: 'team' },
    team.crewTotal && { id: 'crew', label: 'Event crew', icon: 'hardhat', value: `${team.crewConfirmed}/${team.crewTotal}`, pct: Math.round((team.crewConfirmed / team.crewTotal) * 100), tab: 'team', sub: 'people confirmed' },
    ev.households.length && clientCan(user, 'manage_guests') && { id: 'guests', label: 'Guests replied', icon: 'users', value: `${hc.invited - hc.pending}/${hc.invited}`, pct: hc.invited ? Math.round(((hc.invited - hc.pending) / hc.invited) * 100) : 0, tab: 'guests', sub: `${hc.confirmed} attending` },
  ].filter(Boolean);
  return { areas, journey: clientJourney(state, ev), daysToGo: ev.date ? diffDays(today, ev.date) : null };
}
