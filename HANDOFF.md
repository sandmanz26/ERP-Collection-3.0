# HANDOFF.md — EO Management System (for the next AI / engineer)

> Read this first, then `CONTEXT.md` (chronological log of every engineering action) and `docs/FEATURE_REVIEW.md` (latest audit + backlog).
> **Mandatory rule:** every change you make MUST be logged as a new entry in `CONTEXT.md`
> (`### [YYYY-MM-DD] #NNN — Title` + Action/Reason/Files/Result), and the relevant section of this file must be updated.
> Base language for code, UI copy and docs: **English**.

## 1. Summary
End-to-end Event Organizer management system (Lead → Archived) for **social** (weddings, birthdays, private galas) and
**corporate** (conferences, product launches, offsites) events in the US and Western Europe.
- **Stack:** React 18 + Vite 6 + react-router-dom 6 (HashRouter) + `qrcode`. No backend, no UI library.
- **UI:** in-house **Atomic Design system** in `src/design-system/` (tokens → atoms → molecules → organisms → templates). Pages import only from `src/design-system/index.js`. Living style guide: `#/design-system` (admin).
- **Data:** mock (`src/data/`), persisted to `localStorage` (`eo-ms-state-v1`, state `version: 6`, platform state `version: 1`). The external Decor Inventory is simulated under its own key (`eo-decor-inventory-v1`).
- **Audit:** every action goes through `act()` → reducer → `state.activityLog` (incl. rejected attempts, automation runs, offline-pending actions, generated documents). Export to Markdown from *Activity Log* or the event *Activity* tab.

## 2. Running
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 51 unit/integration tests (logic, risk, platform) (node --test)
npm run build    # static output in dist/
```
**Sign in** with any demo account (password `demo1234`; the login page lists them all and fills them in with one click):

| Account | Role | Notes |
|---|---|---|
| olivia@lumiere.events | Owner / Admin | MFA flag on |
| rachel@lumiere.events | Owner / Admin | operations admin |
| marcus@lumiere.events · sofia@lumiere.events | Sales | Sofia covers Europe |
| ava@lumiere.events · lucas@lumiere.events | Planner | Lucas = Paris office |
| diego@lumiere.events | Production | |
| hannah@lumiere.events | Finance | MFA flag on |
| jamal@lumiere.events | Crew (freelance) | lands on Day-of mode |
| mei@lumiere.events | Planner | *invited* — first sign-in activates |
| tyler@lumiere.events | Sales | *suspended* — sign-in refused |
| emily.carter@… · robert.carter@… · nina@halvorsenrobotics.com · david.lee@halvorsenrobotics.com | Client portal | different permissions |
| hello@bloomvine.com · ops@soundwave.av · booking@staffpro.events | Vendor / agency portal | |

5 wrong passwords lock an e-mail for 15 minutes (admins can *Reset password* in Settings → Users). The user menu (top right) switches theme and offers a demo-only account switch.
*Settings → Reset demo data* restores the seed. Public pages (no login): `#/inquiry`, `#/rsvp?event=<id>`.

## 2b. SaaS layer (read docs/SAAS.md)
The app is one **workspace** inside a multi-tenant SaaS (**EventOS**). `src/Root.jsx` renders the **platform layer**
(landing, sign-up, onboarding, find-workspace, operator console) until a workspace is entered, then mounts the app via
`src/platform/WorkspaceRoot.jsx` with an isolated store (`eo-ws-<tenantId>`) and an **entitlement guard** on every
action (`src/platform/entitlements.js#checkAction`). Plans/limits/features: `src/platform/plans.js`. New workspaces are
built by `src/platform/workspace.js#buildWorkspace` from the onboarding answers. Subscriptions & mock billing:
`src/platform/platformReducer.js`. In-app: subscription banner, Settings → *Plan & billing*, Getting-started checklist,
upgrade walls, workspace switcher. Rules of thumb:
- Never read `localStorage` keys directly — use `PlatformStore` helpers (`readTenantState`, `loadTenantState`).
- A new gated capability = add a feature in `plans.js`, map the action in `ACTION_FEATURE` (or route/tab in
  `ROUTE_FEATURE`/`TAB_FEATURE`), and the UI shows lock + `UpgradeWall` automatically.
- Anything that must not touch a customer workspace (like `RESET_DEMO`) is refused in `checkAction` for non-demo tenants.
- Tenant code must use workspace settings (`settings.defaults`, `baseCurrency`, `toBase`) — never hard-coded USD/regions/user ids.

## 3. Architecture & data flow
```
UI (pages/*) ──act(type,payload)──► store/reducer.js ──► store/handlers/<domain>.js (mutate a cloned draft)
     ▲                                     │  ├─ append activityLog (ok / rejected / offline-pending)
     │                                     │  ├─ ctx.notify() → state.notifications (scoped by visibleNotifications)
     │                                     │  └─ ctx.sideEffects → state.effects
     └──── useStore() ◄── Context ◄────────┘
store/AppStore.jsx: persistence · async effects to lib/decorApi.js · SYSTEM_TICK every 60 s · online/offline listeners
Derived data (totals, tax, margin, headcount, leakage, closing) = lib/derived.js — NEVER stored in state.
```
- Business-rule violations throw `BusinessError` (via `assert`) → state unchanged, logged as `REJECTED`, red toast.
- Never mutate state from the UI. New action = new function in `src/store/handlers/<domain>.js` (auto-registered by the spread in `reducer.js`).
- Typed inputs that dispatch use `CommitInput` (commit on blur/Enter) so the audit log isn't flooded.
- Never use `window.prompt/confirm/alert` — use `useDialog()` (`form`, `confirm`, `prompt`, `alert`).
- When the state shape changes, bump `version` in `seed.js` and the check in `AppStore.jsx#init`.

## 4. Design system (`src/design-system/`)
| Layer | Contents |
|---|---|
| `tokens/` | `tokens.css` (color incl. **full dark palette**, typography, spacing, radius, elevation, motion, z-index — the only place raw values live), `tokens.js` mirror |
| `styles/` | `base.css`, `atoms.css`, `molecules.css`, `organisms.css`, `templates.css` (+ print rules), entry `index.css` |
| `atoms/` | `Button` (variant: primary/secondary/success/danger/danger-solid/ghost, size, loading), **`Icon`** (47 stroke icons — never emoji), `Badge`, `Input/Select/Textarea/Checkbox`, `Money`, `Swatch`, `ProgressBar`, **`ProgressRing`**, `Spinner`, `Avatar`, `QrCode` |
| `molecules/` | **`Callout`** (tone, icon, title, CTA action, meta), **`AttentionList`**, `Field` (hint/error), `CommitInput`, `StageBadge`, `StatusBadge`, `StatTile`, `Alert`, `Tabs`, `PillSelect`, `KeyValue`, `EmptyState`, `SearchInput`, `ConfirmButton`, `Toast` |
| `organisms/` | `Card`, `PageHeader`, `Modal`, `DialogProvider/useDialog`, `BarChart`, **`Gantt`** (+ `hourTicks`, `dayTicks`), **`CoverageChart`**, **`SitePlan`**, **`Stepper`** (clickable lifecycle: done/current/todo/exit), **`Timeline`** (vertical dated list grouped by period, with a Today divider), **`JourneyMap`** (road from first to last stop with a pulsing "You are here" pin; stops are buttons; scrolls sideways on phones and centers the pin) |
| `templates/` | `PortalTemplate`, `MobileTemplate`, `PublicTemplate` (app shell: `src/components/AppShell.jsx`) |
| `hooks/` | `useForm`, `download`, `printDocument`, `escapeHtml` |
Fonts: self-hosted via `@fontsource` (IBM Plex Sans for everything, IBM Plex Mono for code/IDs only), imported in `main.jsx`. Visual style: taste-skill app style **framed sheet** (#040) — sidebar + top bar on one tinted frame, pages on a white sheet, colour only on data/status, lagoon accent `#1b6c80`, ink primary button, KPIs as one divided container. Rules in CONTEXT #040; don't reintroduce violet/indigo, uppercase micro-labels, tinted icon squares, card shadows or a dark sidebar. Theme: `state.theme` (system/light/dark) → `data-theme` on `<html>` (App.jsx).
Rules: components reference tokens only (no literal colors in CSS); status colors (success/warning/danger/info) are reserved for state; add new atoms to the style guide page.

## 4b. Events are not projects — how the system models that
An event is a **one-day (or few-day) production assembled from many companies and many temporary people**, so beyond tasks it models:
- **Workforce**: `ev.positions` = staffing plan (department, role, qty, call/wrap, source internal | freelance | outsourced via agency/vendor, rate, credential zones). Filled by internal staff/registered freelancers (`ev.shifts[].positionId`, overtime & conflict rules apply) or external people (`ev.workers[]`: agency-supplied or one-off freelancers, each with a QR credential `CRW-…`). Agencies submit their own roster in the vendor portal; outsourced positions are costed on the **booked** headcount.
- **Production coordination**: `ev.production.resources` (exclusive ones like docks/elevators can't be double-booked), `ev.production.accessWindows`, venue curfew, ROS `resourceIds` and `dependsOn` (vendor hand-offs). `lib/timeline.js#productionIssues` flags clashes live.
- **Visuals first**: planning Gantt (one lane per vendor), event-day Gantt (by vendor/function/resource/crew, drag to reschedule), coverage chart, site plan, planner workload, live day-of board.

## 5. File map
| Path | Contents |
|---|---|
| `src/data/config.js` | Company, FX, tax jurisdictions, catalog (base currency), payment schedules, cancellation policies, contract template, **Event Types** (segment configuration), email templates, automations, QuickBooks/Xero mapping, roles, client permissions, lost reasons |
| `src/data/accounts.js` | mock credentials, lockout policy, account profiles/statuses |
| `src/data/seed.js` | `buildSeed()` — users, clients, vendors, staff, 14 events across all stages (relative to today) |
| `src/lib/pricing.js` | fixed / per_guest / percentage lines, optional items, US sales tax (service-fee taxability per jurisdiction), EU/UK/CH VAT + B2B reverse charge, `diffProposals` |
| `src/lib/contracts.js` | payment schedule from template, cancellation table, template variables |
| `src/lib/lifecycle.js` | 12 stages + 3 exits, `transitionBlockers()` |
| `src/lib/availability.js` | per-weekday & planner-based capacity, prioritized holds |
| `src/lib/tasks.js` | T-minus task templates, auto-shift |
| `src/lib/staff.js` | crew cost, CA daily OT, `weeklyCompliance` (FLSA 40h, EU/UK/CH weekly max), conflicts, freelancer classification risk |
| `src/lib/ros.js` | run of show sort/shift/filter |
| `src/lib/workforce.js` | staffing plan: fill, cost (outsourced vs freelance vs internal), coverage, credentials |
| `src/lib/timeline.js` | `productionIssues` conflict engine, `planningTimeline`, `dayTimeline`, `workloadTimeline` |
| `src/lib/decorApi.js` | **Mock Decor Inventory API** (async + latency); REST mapping in header comment |
| `src/lib/derived.js` | selectors: event financials, budget, headcount, guarantees, closing checklist, leakage, vendor compliance, payer summary |
| `src/lib/documents.js` | printable HTML: invoice/receipt, proposal, QR badges |
| `src/lib/permissions.js` | nav per role, capabilities, `clientCan`, `visibleNotifications` |
| `src/lib/exportMd.js` | activity log → Markdown |
| `src/platform/*` | SaaS layer — see docs/SAAS.md (plans, entitlements, workspace builder, platform reducer/store, WorkspaceRoot, SaasChrome, public pages, Billing) |
| `src/Root.jsx` | platform vs workspace routing, guest pages `#/rsvp?w=` `#/inquiry?w=` |
| `tests/platform.test.js` | sign-up, onboarding, tenant defaults, PPN/GST, entitlements, limits, denial logging, demo-reset guard, checkout, billing run, operator |
| `src/lib/risk.js` | **negative-case rules** (see `docs/BUSINESS_REVIEW.md`): `vendorGaps`, `vendorRefundsDue`, `finalPaymentRisk`, `weatherCall`, `leadSla`, `custodyOpen`, `vendorMeals`, `lateVendors`, `overtimeQuote`, `overtimeApprovers`, `RISK_DEFAULTS` |
| `src/store/handlers/risk.js` | BOOKING_CANCEL (+ replacement RFQ), VENDOR_REFUND_RECOVERED, VENDOR_ARRIVED, PAYMENT_REVERSE, WEATHER_PLAN_SET, WEATHER_CALL, OVERTIME_APPROVE, CUSTODY_ADD, CUSTODY_UPDATE; client notices (`ev.clientNotices`) |
| `src/lib/obligations.js` | **obligations outside the client contract** (see `docs/PROCESS_REVIEW.md`): `roomBlockStatus` (attrition, audit clause, exposure), `guaranteeCheck` (minimum guarantee, post-deadline reduction floor, overset), `allergySheet` (severe cases by table, sign-off fingerprint → stale), `permitPlan` (suggestions by country / guests / late outdoor / pyro / road; ID izin keramaian Polsek/Polres), `capacityIssues`, `postponementTerms`, `FUNCTION_TEMPLATES`, `obligationIssues` (feeds next steps + Pre-Event blockers) |
| `src/store/handlers/obligations.js` | ROOM_BLOCK_ADD / PICKUP / RELEASE (before cutoff) / SETTLE (after cutoff, optional CO to client), ALLERGY_SIGNOFF, PERMIT_SET (approval needs a reference), CAPACITY_SET, FUNCTIONS_FROM_TEMPLATE; plus rules inside FINAL_HEADCOUNT_SET (ack below guarantee, override for >5% drop after the guarantee date, venue capacity), RSVP_SET (public RSVP can't exceed a function's capacity), EVENT_POSTPONE (contract limit) |
| `src/pages/event/ObligationPanels.jsx` | RoomBlocksCard (Vendors tab), AllergyCard + FinalHeadcount + CapacityCell (Guests tab), PermitsCard + TemplatePicker (Plan → Functions & permits) |
| `src/design-system/organisms/Runway.jsx` | dashboard signature element: next 120 days as one line, events at their date, lane-stacked labels, hold vs booked vs needs attention |
| `src/pages/event/RiskPanel.jsx`, `src/pages/dayof/DayOfRisk.jsx` | cockpit *Risks & contingencies* card; Day-of Vendors / Overtime / Items tabs |
| `src/lib/clientView.js` | **client panel selectors (client-safe — no costs, margins, rates, internal notes)**: `clientJourney` (8 plain-language steps), `clientPosition` (pin position between the current step and the next dated one, next milestone, status: On track / A few things are late / Needs your attention, with clickable reasons), `clientProgress`, `clientTimeline`, `clientRoadmap` (Gantt lanes), `clientAgenda` (guest-track ROS only), `clientPrep` (tasks, forms, signatures, approvals, payments, guest deadlines → overdue / 30 days / anytime / later / done), `clientPayments` (payer-scoped), `clientTeam`, `clientUpdates` |
| `src/pages/client/ClientPanels.jsx` | client portal panels: Overview, Timeline (road map + month list), Event day agenda, To prepare, Payments, Team, callouts. `ClientPortal.jsx` groups them into sections honoring `clientCan` permissions |
| `src/lib/eventGuide.js` | **event cockpit logic**: `STAGE_INFO`, `stageDates`, `stepperSteps`, `stageRequirements`, `nextActions` (stage-aware, each with target tab + CTA), `readiness` by area, `keyDates`, role-filtered `priorities` for the dashboard |
| `src/store/*` | reducer + handlers (`system`, `crm`, `sales`, `finance`, `planning`, `vendors`, `guests`, `ops`, `settings`, `workforce`) |
| `src/pages/*.jsx` | **Login**, Dashboard (role-tailored), Pipeline, Calendar, Events, Vendors, Staff, Finance, Reports, Automation, Settings, ActivityLog, DayOf, ClientPortal, VendorPortal, RsvpPublic, InquiryPublic, DesignSystem |
| `src/pages/event/*.jsx` | event workspace tabs (Overview, **Timeline**, Proposal, Contract, Planning, Vendors, Guests, Seating, Budget, Change Orders, Run of Show, **People**, **Site plan**, Crew shifts, Finance, Messages, Post-Event, Activity) + `DecorPanel` |
| `tests/logic.test.js` | logic + store flow tests |

## 6. Spec → implementation map
| Spec | Where |
|---|---|
| §3 lifecycle, exits, date locked only after deposit | `lifecycle.js`, `crm.js`, `finance.js#lockDateIfDeposit`, `system.js` (signed holds never auto-released) |
| §4.1 CRM (sources, qualification, availability, 7-day holds + reminders, 1st/2nd hold promotion, pipeline, interactions, web/marketplace intake) | `Pipeline.jsx`, `Calendar.jsx`, `Availability.jsx`, `InquiryPublic.jsx`, `crm.js`, `system.js` |
| §4.2 proposals (catalog, 3 pricing types, optional upsells, versions + diff, tax, internal vs client view, moodboard, expiry, multi-currency, PDF) | `ProposalTab.jsx`, `sales.js`, `pricing.js`, `documents.js` |
| §4.3 contracts & e-signature | `ContractTab.jsx`, `sales.js` |
| §4.4 planning workspace | `PlanningTab.jsx`, `planning.js` |
| §4.5 vendors (directory, COI/licenses/W-9 + guard, RFQ, pass-through vs direct, commissions, portal with quotes & tasks) | `Vendors.jsx`, `VendorsTab.jsx`, `VendorPortal.jsx`, `vendors.js` |
| §4.6 guests & RSVP (households, per-function RSVP, public RSVP with deadline, seating rules, QR check-in, live headcount + guarantees) | `GuestsTab.jsx`, `SeatingTab.jsx`, `RsvpPublic.jsx`, `DayOf.jsx`, `guests.js` |
| §4.7 budget & costing | `BudgetTab.jsx`, `derived.js#budgetByCategory` |
| §4.8 change orders | `ChangeOrdersTab.jsx`, `ops.js#applyChangeOrder` |
| §4.9 run of show + day-of + offline | `RunOfShowTab.jsx`, `DayOf.jsx` (+ live production board, crew check-in), `ops.js`, `reducer.js` |
| Event workforce & outsourced crews (user request #019) | `PeopleTab.jsx`, `workforce.js` (lib + handlers), vendor portal *Crew requested*, `DayOf.jsx#CrewCheckIn` |
| Multi-vendor production coordination & visual timelines (#019) | `TimelineTab.jsx`, `SitePlanTab.jsx`, `timeline.js`, `Gantt/CoverageChart/SitePlan` organisms, Calendar workload |
| §4.10 staff & crew | `Staff.jsx`, `StaffTab.jsx`, `staff.js` |
| §4.11 finance | `Finance.jsx`, `FinanceTab.jsx`, `finance.js`, `documents.js` |
| §4.12 client portal (multi-user permissions) | `ClientPortal.jsx`, `permissions.js` |
| §4.13 communication & automation | `Automation.jsx`, `MessagesTab.jsx` (template composer), `system.js#SYSTEM_TICK` |
| §4.14 post-event | `PostEventTab.jsx`, `ops.js` |
| §4.15 reporting (with segment/date filters) | `Reports.jsx`, `Finance.jsx`, `Dashboard.jsx` |
| §2 user management + mock login | `Login.jsx`, `system.js#LOGIN/LOGOUT`, `accounts.js`, `Settings.jsx` → Users (status, last sign-in, reset, suspend) |
| §8 Decor Inventory integration | `decorApi.js`, `DecorPanel.jsx`, effects in `AppStore.jsx` |

## 7. Demo script
00. **SaaS funnel**: `#/` landing → *Start free trial* → sign-up → 6-step onboarding (pick Indonesia to see IDR + PPN) → your workspace with the trial banner and Getting-started checklist → Settings → *Plan & billing* (test card 4000 0000 0000 0002 declines, 4242… succeeds). User menu → *Switch workspace* → *Log in* → `sunsetcoast` (expired trial, read-only) / `petalandpine` (past due). `#/operator` → MRR, trials, churn, suspend / extend trial.
0. **Sign in**: one click on a role tile (Owner, Sales, Planner, Production, Finance, Day-of crew, Client, Vendor) or *All accounts* for the full list. Try a wrong password a few times on Marcus (lockout warning), Tyler (suspended).
0b. **Drive an event**: Dashboard → *Today's priorities* → click a CTA (lands on the right event tab). Event → *Overview* cockpit: click any lifecycle step (entered date/by, or what is still required), *Next steps* callouts, *Readiness* tiles jump to the area. Archived events (Brightwave) are read-only summaries.
1. **Admin** dashboard → attention list (expiring holds, overdue invoices, exception CO, guarantee warning, vendor compliance). Switch to **Hannah (finance)** / **Diego (production)** to see role-tailored dashboards.
2. **CRM** → *Simulate marketplace lead* or open *Public inquiry form* → open the lead → *Place hold* → advance → Proposal *Build* → *Send* → *Record acceptance* → *Client PDF* → Contract *Generate* → *Send* → e-sign → Finance *Record payment* → 🔒 date locked → Planning.
3. **Calendar**: release Stellar's hold #1 → Nguyen promoted, email in Communication → Outbox.
4. **Carter–Walker Wedding**: seating (deliberate rule violation), budget (multiple payers), Change Orders (CO-102 pending), Vendors (Groove can't be confirmed — COI expired), Run of Show → call sheet, Guests → QR place cards.
5. **Emily Carter (client)**: Overview (journey stepper, progress tiles, coming up, latest updates, contacts) → Timeline (road map + month list, Event day agenda) → To prepare (one list of everything due) → Payments (summary, payment plan, who pays what, pay invoices) → Team (planner team, vendors with arrival times, crew by department, venue). Approve CO-102, pay, forms, download proposal PDF. **Robert Carter**: only catering invoices. **Nina Patel**: guests only.
6. **Bloom & Vine (vendor)**: submit an RFQ quote, tick the assigned task, see only its own run-of-show rows.
7. **Halvorsen Summit**: CO-103 exception → client approval rejected until admin *Grant exception approval*.
8. **Day-of Mobile**: start/done/+15 min, incident with photo, QR check-in, *simulate offline* → "pending sync" in Activity Log → reconnect.
9. **Harper 50th** (post-event): pull Decor return report → bill damage → rate vendors → survey → Financial close.
10. **Carter → Timeline**: planning Gantt (today/event markers, vendor lanes) → *Event days* → *By venue resource* shows the loading-dock clash; drag *Rental delivery* to 08:15 and watch the Production check clear. **People**: 13 open slots, assign Tom as stagehand, print QR credentials. **Site plan**: drag a table, assign a vendor.
11. **StaffPro Events (agency)**: *Crew requested from you* → add names → credentials appear. **Day-of** (as admin): *Crew* tab check-in by code, live production board beside the phone. **Calendar**: planner workload.
12. **Settings**: invite a user, edit client permissions, add a catalog item and a task-template row. **Activity Log** → *Export .md*.

13. **Negative cases** (see `docs/BUSINESS_REVIEW.md`): Carter → Vendors → *Cancel…* Groove ("band withdrew") → replacement RFQ to Brooklyn Brass & SpinCity, red gap on the cockpit, client sees "being replaced". Finance (as Hannah/Olivia) → *Reverse…* the deposit → date back on HOLD + $35 fee. Cockpit → *Risks & contingencies*: weather call, final-balance cutoff, vendor meals, card box custody. Day-of → *Overtime* +60 min approved by Emily → invoice. Harper → Post-event: gift table not handed back blocks close. Dashboard as Marcus: unanswered inquiry SLA.

## 8. Deliberate decisions & limits
- No backend: email, Stripe, QuickBooks/Xero, e-signature, GPS and calendar sync are simulated; data shapes are ready for real integrations.
- Tax and labor rules are **illustrative**, not legal/tax advice.
- Static FX rates (Settings); FX locked per invoice (`fxRateToUSD`); catalog in base currency, converted when lines are added.
- Revenue is recognized when stage ≥ `post_event` (or after a client cancellation).
- RBAC is enforced in the UI and selected reducers — a real backend must enforce every capability server-side.
- Authentication is mock: plain-text passwords in seed data, client-side lockout, no sessions/tokens/SSO/MFA. Replace with a real identity provider (hashed credentials, server sessions, SSO, MFA) before any real use.
- See `docs/FEATURE_REVIEW.md` → *Deferred* for the backlog.
