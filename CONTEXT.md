# CONTEXT.md — Engineering Action Log

> **Mandatory:** every engineering action (design decision, file created/changed, command run, bug found/fixed)
> is appended here in chronological order. The next AI/engineer MUST continue this log in the same format.
> For the architecture overview and how to continue the work, read `HANDOFF.md`. For the latest feature audit, read `docs/FEATURE_REVIEW.md`.
>
> Base language: **English** (entries #001–#012 were originally written in Indonesian and translated in #017).

Entry format: `### [YYYY-MM-DD] #NNN — Title` followed by bullets: *Action*, *Reason*, *Files*, *Result*.

---

### [2026-10-20] #001 — Repository bootstrap
- Action: empty repo on branch `claude/exciting-einstein-b58ibb`. Created a Vite + React 18 project by hand (`package.json`, `vite.config.js`, `index.html`, `.gitignore`).
- Reason: the user asked for a React JS system with no backend and mock data. Vite chosen for fast, zero-config builds.
- Dependencies: `react`, `react-dom`, `react-router-dom` (HashRouter so it can be hosted statically without server rewrites); dev deps `vite`, `@vitejs/plugin-react`. No UI library — custom CSS keeps it light and easy for other AIs to read.
- Result: `npm install` OK.

### [2026-10-20] #002 — Architecture decisions
- One global store (`src/store/AppStore.jsx`) using React Context + `useReducer`.
- **Every business action** is dispatched through `act(type, payload, meta)`; the reducer automatically appends an entry to `state.activityLog` (in-app audit trail, exportable to Markdown from the *Activity Log* page). This satisfies "every action is recorded" at runtime too.
- State persisted to `localStorage` (key `eo-ms-state-v1`); *Reset demo data* in Settings.
- The "Event" entity is the *deal* from Lead to Archived (one entity across the lifecycle), so the CRM pipeline = events in pre-booking stages.
- Pure business logic (pricing, tax, payment schedules, cancellation, holds, overtime, …) lives in `src/lib/*` (pure functions, testable with `node --test`).
- Decor Inventory System simulated as an "external API" (`src/lib/decorApi.js`) with latency and separate storage (`eo-decor-inventory-v1`).
- Mock data is generated relative to today so the demo always looks current.

### [2026-10-20] #003 — Pure business logic (`src/lib`)
- Files: `dates.js`, `money.js`, `ids.js`, `pricing.js` (fixed/per_guest/percentage + US/EU/UK/CH tax + reverse charge), `contracts.js` (payment schedules, cancellation table, template rendering), `lifecycle.js` (12 stages + 3 exits + transition guards), `availability.js` (per-weekday capacity, prioritized holds), `tasks.js` (T-minus templates, auto-shift), `staff.js` (CA daily overtime, EU WTD, conflict detection, freelancer classification risk), `ros.js` (timeline shift), `decorApi.js` (mock external API), `derived.js` (financial/budget/headcount/leakage/closing selectors), `permissions.js` (RBAC per role).
- Reason: keep business rules separate from UI so they are testable and portable to a backend later.

### [2026-10-20] #004 — Mock data (`src/data`)
- `config.js`: company, FX rates, 10 tax jurisdictions, 26-item service catalog, 2 payment schedules, 2 cancellation policies, contract template, 5 Event Types (segment configuration: active features, task/proposal/form templates), lead sources, email templates, 8 automations, QuickBooks/Xero account mapping, roles.
- `seed.js`: 14 users (8 roles incl. multi-user client accounts & vendors), 11 clients, 12 vendors, 10 staff, 14 events covering every stage (lead → archived, lost, cancelled), stacked holds on one date, approved/pending/exception change orders, run of show, shifts, guests + tables, incident, decor reservations.

### [2026-10-20] #005 — Store & action handlers (`src/store`)
- `reducer.js`: single dispatcher; clone draft → handler → **append to `activityLog`** (including REJECTED actions with status `rejected`). Offline actions get `sync: 'pending'` and go to `offlineQueue`.
- `handlers/*.js`: system (automation tick, reset, online/offline), crm (lead, hold, stage, postpone, cancel), sales (proposal versions, contract, e-sign), finance (invoices, payment → date lock on deposit, late fee, credit note, gratuity, vendor payables, accounting sync), planning, vendors, guests, ops (change orders, run of show, incidents, shifts, decor, close-out), settings.
- `AppStore.jsx`: Context, localStorage persistence, async side effects to the Decor API, automation tick every 60 s, online/offline listeners.

### [2026-10-20] #006 — Unit / integration tests
- `tests/logic.test.js` (+ `tests/setup.js` localStorage shim). Command: `npm test`.
- Result: 14/14 passing.

### [2026-10-20] #007 — Base UI & layout
- `src/styles.css`, `src/components/ui.jsx`, `src/components/Layout.jsx`, `src/components/Availability.jsx`, `src/main.jsx`, `src/App.jsx` (HashRouter + per-role guard). *(Superseded by the design system in #014.)*
- Decision: `CommitInput` dispatches only on blur/Enter so the audit log is not flooded per keystroke.

### [2026-10-20] #008 — Global pages
- `Dashboard`, `Pipeline` (drag-and-drop kanban with guards, inquiry modal with availability check, lost), `Calendar` (capacity, holds, release/extend), `Events`, `Vendors`, `Staff` (+ .ics export), `Finance` (AR/AP/deferred/cash forecast/gratuities/commissions/accounting), `Reports` (6 reports), `Automation` (outbox, workflows, templates), `Settings`, `ActivityLog` (filter + .md export).

### [2026-10-20] #009 — Event workspace (15 tabs)
- Overview, Proposal, Contract, Planning (+ Decor panel via API), Vendors, Guests, Seating, Budget, Change Orders, Run of Show (+ call sheet), Crew, Finance, Messages, Post-Event, Activity.

### [2026-10-20] #010 — Portals & mobile
- `ClientPortal.jsx` (multi-user permissions + payer scope), `VendorPortal.jsx`, `DayOf.jsx` (live status, +5/+15 shift, check-in, incidents with photo, call sheet, clock in/out, offline simulation), `RsvpPublic.jsx`.

### [2026-10-20] #011 — Verification
- Build OK; Playwright smoke over all routes, 15 tabs × 8 events and all portal tabs: 0 runtime errors. E2E inquiry → deposit → locked → Planning passes.
- Visual fixes: `.alert` as block, card margins inside grids, Carter seed enlarged to 68 households, toast no longer replays after reload.

### [2026-10-20] #012 — Documentation
- Created `HANDOFF.md` and `README.md` (Indonesian at the time; rewritten in English in #017).
- Push attempt failed with HTTP 403 (Claude GitHub App has no access to the repository) — commits kept locally.

### [2026-10-20] #013 — New request: feature roast + Atomic Design system + English as base language
- Action: user asked to (1) critically re-review ("roast") all features against the spec, (2) rebuild the UI on an atomic design system (tokens → atoms → molecules → organisms → templates → pages), (3) use English as the base language (UI + all documentation).
- Plan: write `docs/FEATURE_REVIEW.md` (findings + status), create `src/design-system/`, replace all `window.prompt/confirm/alert` with design-system dialogs, fix the high-impact gaps, translate `CONTEXT.md`/`HANDOFF.md`/`README.md` to English. From this entry on the log is written in English.

### [2026-10-20] #014 — Atomic Design system (`src/design-system/`)
- Action: created tokens (`tokens/tokens.css` + `tokens.js`: color, typography, spacing, radius, elevation, motion, z-index), hand-authored layered CSS (`styles/base|atoms|molecules|organisms|templates.css`, entry `styles/index.css`), and components:
  - atoms: `Button`, `Badge`, `Input/Select/Textarea/Checkbox`, `Money`, `Swatch`, `ProgressBar`, `Spinner`, `Avatar`, `QrCode` (new dep `qrcode@1.5.4`)
  - molecules: `Field` (hint/error), `CommitInput`, `StageBadge`, `StatusBadge`, `StatTile`, `Alert`, `Tabs`, `PillSelect`, `KeyValue`, `EmptyState`, `SearchInput`, `ConfirmButton`, `Toast`
  - organisms: `Card`, `PageHeader`, `Modal` (Esc/backdrop close, aria), `DialogProvider/useDialog` (promise-based confirm/alert/prompt/form), `BarChart`
  - templates: `PortalTemplate`, `MobileTemplate`, `PublicTemplate`; app shell = `src/components/AppShell.jsx`
  - single barrel `src/design-system/index.js` — pages import only from it.
- Removed `src/styles.css` and `src/components/ui.jsx`; renamed `Layout.jsx` → `AppShell.jsx`.
- Codemod (scratchpad script, not committed): rewired imports, renamed `Stat/Kv/Empty/Progress` → `StatTile/KeyValue/EmptyState/ProgressBar`, converted every `<button className="btn …">` into `<Button variant size>`.
- Replaced all 26 `window.prompt/confirm/alert` calls with design-system dialogs (typed fields, validation, Esc to cancel). Lead form now shows inline "Required" errors.
- Verification: build OK; Playwright smoke (all routes/tabs/portals) 0 runtime errors; E2E flow still passes.

### [2026-10-20] #015 — Feature roast: bug fixes (store / lib)
- R1 `handlers/system.js`: holds of signed contracts are never auto-released; `depositOverdue` flag + one-time danger notification.
- R2 `lib/permissions.js#visibleNotifications` used by `AppShell` and `NOTIFICATIONS_READ` — clients/vendors/crew only see their own events.
- R3 `handlers/sales.js#lineFromCatalog` converts base-currency catalog prices into the proposal currency.
- R4 `handlers/vendors.js#BOOKING_CONFIRM` rejects vendors with expired COI/licenses.
- R5 `handlers/crm.js#EVENT_POSTPONE`: integer day delta via `diffDays`, load-in/out moved, bookings must re-confirm, vendors/crew/client notified.
- R7 `handlers/guests.js#RSVP_SET` enforces `settings.rsvpDeadlineDays` for public RSVPs.
- G1 `lib/availability.js`: planner-based capacity (`capacity.plannerBased`) + `plannersFree`.
- G5 `lib/staff.js#weeklyCompliance`: FLSA weekly 40h overtime + EU/UK/CH weekly maximum across events.
- G10 `lib/pricing.js#diffProposals`.
- New handlers: `USER_CREATE`, `USER_UPDATE`, `CATALOG_ADD`, `EMAIL_SEND`, `DOCUMENT_GENERATED`.
- State shape changed → seed `version: 2` (older localStorage snapshots are re-seeded automatically).
- Tests: +6 (weekly OT, signed hold, currency conversion, COI guard, notification isolation, proposal diff) → 20/20 passing.

### [2026-10-20] #016 — Feature roast: UI additions
- `pages/InquiryPublic.jsx` (route `#/inquiry?source=…`) + "Simulate marketplace lead" in Pipeline.
- `pages/DesignSystem.jsx` living style guide (route `#/design-system`, admin nav).
- Vendor portal: RFQ quotes + assigned tasks; seed adds a vendor task for Bloom & Vine.
- Real QR codes (RSVP page, day-of check-in, Guests tab) and printable badges; `lib/documents.js` (invoice/receipt, proposal, badges) + `printDocument()`.
- Settings: invite user, change role, client-portal permission pills, add catalog item, task-template editor, RSVP deadline, planner-based capacity toggle.
- Messages tab: email-from-template composer. Reports: segment + date filters. Events: "Only my events". Dashboard: role-tailored KPIs/attention items/side panel. Proposal: version diff card. Staff: weekly overtime warnings with premium.
- Contract builder: add signers from client portal users; portal signing matched by e-mail only.
- Tooling: scratchpad `jsxcheck.py` (undefined JSX component/hook check) run after each batch → 0 problems.
- Verification: build OK, Playwright smoke 0 runtime errors incl. inquiry submission, table dialog, marketplace simulation; screenshots of style guide, finance dashboard and vendor portal reviewed.

### [2026-10-20] #017 — English as base language
- Translated `CONTEXT.md` entries #001–#012 to English; rewrote `HANDOFF.md` and `README.md` in English; added `docs/FEATURE_REVIEW.md`. UI copy was already English.

### [2026-10-20] #018 — Commit & push attempt
- Committed `89b3bbb` (design system) and `6a18890` (feature roast + English docs) on `claude/exciting-einstein-b58ibb`.
- `git push` failed again with HTTP 403: the Claude GitHub App has no access to `sandmanz26/ERP-Collection-3.0`. Commits remain local until access is granted (https://claude.ai/connect-github), then push with `git push -u origin claude/exciting-einstein-b58ibb`.

### [2026-10-20] #019 — New request: event workforce, vendor-centric coordination, visual timelines
- Request (user): events involve many people, often hired as outsourced labour; event management differs from task/project management because many more vendors are involved; visuals and timelines are what usually gets missed.
- Plan:
  1. **Workforce module** — per-event staffing plan (`positions`: department, role, qty, date/time, source internal | freelance | outsourced via agency/vendor, rate, credential zones) filled by internal staff (shifts with `positionId`) or external workers (`workers`: agency-supplied or freelance). Vendor portal lets agencies submit their crew roster. QR credentials, day-of crew check-in, workforce cost into costing, staffing-gap alerts.
  2. **Production coordination** — shared venue resources (loading dock, service elevator, rooms; exclusive or not), venue access windows, curfew, vendor-to-vendor dependencies on run-of-show items, automatic conflict detection (`productionIssues`).
  3. **Visuals** — design-system organisms `Gantt` (lanes, day/hour scales, markers, shading, drag-to-move), `CoverageChart` (required vs filled staff per slot), `SitePlan` (SVG floor plan, drag elements, tables linked to seating). New event tabs *People*, *Timeline*, *Site plan*; planner workload timeline in Calendar.

### [2026-10-20] #020 — Workforce & production logic (`src/lib`, `src/store`)
- `lib/workforce.js`: departments, sources (internal / freelance / outsourced), credential zones, `positionFill` (shifts with `positionId` + external `workers`), `staffingSummary`, `positionCost` (outsourced = booked headcount × hours × rate; freelance = confirmed people; internal = via shifts), `workforceCost`, `coverage` (required vs confirmed per slot), `credentialCode`.
- `lib/timeline.js`: `productionIssues` (exclusive-resource clashes, vendor dependency violations, outside access window, past curfew, outside vendor booked window, unconfirmed vendors on shared/final ROS, staffing gaps), `planningTimeline` (milestones, task lanes, one lane per vendor with engagement + payables + deliverables, RFQs, client payments), `dayTimeline` (by vendor / function / resource / crew, access-window shading, curfew markers), `workloadTimeline` (planner portfolio).
- `lib/derived.js#crewCost` now = shift cost + workforce cost (flows into budget "Staffing", profit, reports).
- `store/handlers/workforce.js` (new): `POSITION_ADD/UPDATE/REMOVE`, `POSITION_ASSIGN_STAFF` (creates linked shift), `WORKER_ADD/UPDATE/REMOVE` (agency users restricted to their own positions/crew), `CREW_CHECKIN` (by credential code), `CREW_NO_SHOW`, `RESOURCE_ADD/REMOVE`, `ACCESS_WINDOW_SET`, `SITE_ROOM_ADD`, `SITE_ELEMENT_ADD/UPDATE/REMOVE`. `EVENT_POSTPONE` also moves positions and access windows.
- Data shape: events gain `positions`, `workers`, `production { accessWindows, resources }`, `sitePlan { rooms[] }`; ROS items gain `resourceIds`, `dependsOn`. Seed `version: 3`.
- Seed: vendors *Shield Event Security* and *StaffPro Events* (staffing agencies), user `u_vendor3` (agency portal). Carter wedding: 8 positions / 29 heads across 5 departments, 4 supplying vendors, named crews, 5 venue resources, access window 08:00–01:00, extra production items with **deliberate demo conflicts** (dock clash rentals vs catering, centrepieces before the lighting rig ends), 2-room site plan with tables linked to the seating chart. Acme summit: 6 positions incl. union AV crew via SoundWave, eve-of load-in window, freight elevator, keynote site plan.
- Tests +7 (costing/coverage, conflict detection, conflict cleared by moving an item, agency roster + QR check-in + cross-vendor guard, staff assignment → linked shift → crew cost, postponement moves staffing) → 26/26.

### [2026-10-20] #021 — Visual organisms (`src/design-system/organisms`)
- `Gantt`: lanes with automatic sub-row stacking, day or hour ticks with collision-free label thinning, markers (today / now / event / curfew), hatched shading (no venue access), background windows, labelled milestones, fit-to-width + zoom, pointer drag and ←/→ keyboard move with snapping.
- `CoverageChart`: required (outline) vs confirmed (brand) vs gap (danger), with text summary — identity never by color alone.
- `SitePlan`: SVG floor plan in meters, 1 m / 5 m grid, drag elements with 0.5 m snap, selection and highlight states.
- CSS for all three in `styles/organisms.css` (tone classes from tokens). Living style guide (`#/design-system`) now demos them.

### [2026-10-20] #022 — Screens
- Event workspace: new tabs **Timeline** (planning Gantt ↔ event-day production Gantt grouped by vendor/function/resource/crew, drag-to-reschedule, Production check panel, coverage chart, venue resources & access windows), **People** (staffing plan by department/source, assign staff, add external people, statuses & zones, roster CSV, printable QR crew credentials, agency summary, coverage), **Site plan** (rooms, element palette, inspector, vendor footprint, seated counts per table). "Crew" tab renamed "Crew shifts".
- Run of show: edit dialog with venue resources and "must start after" dependencies; columns show them.
- Vendor portal: *Crew requested from you* (agency submits names → credentials; edit status), own production lane Gantt with own issues, own site-plan footprint.
- Day-of: *Crew* check-in tab (scan CRW code, in/out, no-show → alert) + desktop **Live production board** (Gantt with NOW line, drag = shift following items) beside the phone.
- Calendar: **Planner workload** portfolio Gantt. Dashboard: KPIs *Open crew slots* and *Production conflicts* for planner/production + attention items.
- Verification: build OK; Playwright smoke incl. new tabs on 8 events, groupings, keyboard reschedule (logged as `ROS_ITEM_UPDATE`), agency roster submission, crew check-in → 0 runtime errors; screenshots reviewed (planning Gantt, resource Gantt, people, site plan, day-of board, workload) and fixed (fit-to-width, milestone labels, tick collisions, table label sizing, missing `tone-info`).

### [2026-10-20] #023 — Commit & push attempt
- Committed the workforce / production / visual-timeline work on `claude/exciting-einstein-b58ibb`. `git push` still fails with HTTP 403 (no GitHub App access to `sandmanz26/ERP-Collection-3.0`); all commits remain local until access is granted.

### [2026-10-20] #024 — New request: mock login for admin & team + UI/UX clean-up with the design skill
- Request: add mock login data for the admin and team side; re-check the UI so it is clean with good UX; use the design skill.
- Loaded the `artifact-design` skill as the review lens (fundamentals only — this is an app, not a published artifact): extend the existing design system instead of replacing it, deliberate type pairing (Inter is a generic default), both light & dark themes from tokens, no emoji as icons, summary-before-detail for tool UIs, active-voice copy.
- Plan: (A) mock accounts + login/logout/session + failed-login & suspended-account handling, all audited; (B) self-hosted fonts + SVG `Icon` atom replacing emoji/glyph icons; (C) dark theme via tokens + theme switch; (D) grouped sidebar, mobile drawer, user menu, global search; (E) grouped event-workspace tabs (18 tabs no longer in one overflowing row); (F) portal hero restyle, screenshot review in light/dark/mobile and fixes.

### [2026-10-20] #025 — Mock authentication (admin & team)
- `src/data/accounts.js`: `DEMO_PASSWORD` (`demo1234`), lockout policy (5 failures → 15 min), profile data (title, phone, timezone, status, MFA flag) per account, extra team accounts: Rachel Ng (2nd admin), Mei Tan (invited planner), Tyler Grant (suspended former sales).
- Seed: every user gets `password`, `status`, `lastLoginAt`; state starts signed out (`currentUserId: null`), new `loginAttempts`, `theme`; seed `version: 4`.
- Handlers: `LOGIN` (case-insensitive email, attempt counter, lockout, suspended refusal, invited → active on first sign-in), `LOGOUT`, `SET_USER` (demo account switch from the user menu; refuses suspended), `THEME_SET`, `USER_PASSWORD_RESET` (temp password, clears lockout), `USER_STATUS` (suspend/reactivate; cannot suspend yourself). `USER_CREATE` now creates *invited* users with a temporary password.
- Reducer: handlers may return `{ error }` to persist state (e.g. the attempt counter) while reporting a rejection; log rows record the acting account (`actorId`) or the attempted e-mail for anonymous attempts.
- UI: `pages/Login.jsx` (sign-in form with inline validation, show/hide password, lockout notice, one-click demo accounts for team and portals, mock-auth disclaimer); `App.jsx` renders Login when signed out and applies the theme; Settings → Users shows status, MFA, failed attempts, last sign-in, Reset password, Suspend/Reactivate.
- Tests +2 (login/lockout/suspended/invited/logout; password reset clears lockout) → 28/28. Browser check of the real form: empty-field errors, lockout message, suspended message, role-scoped nav, theme switch, sign-out.

### [2026-10-20] #026 — UI/UX clean-up (design skill fundamentals)
- Typography: self-hosted `@fontsource` Fraunces (display headings), Hanken Grotesk (UI), JetBrains Mono (times, codes, credential IDs) — work offline on venue day; heading `text-wrap: balance`, uppercase labels letter-spaced.
- Tokens: all ~60 literal colors moved into tokens (`tokens.css`), complete dark palette under `prefers-color-scheme` (guarded by `:not([data-theme="light"])`) and `[data-theme="dark"]`, `color-scheme` set; sidebar intentionally dark in both themes. Theme switch (System / Light / Dark) in the user menu.
- Icons: new `Icon` atom (47 stroke icons); every emoji/glyph icon replaced (nav, alerts, badges, buttons, modal close, checklists, ratings, toast).
- App shell rebuilt: grouped sidebar (Overview / Sales / Operations / Money / Workspace / Admin), mobile drawer with scrim, global search (`/` shortcut, arrow keys, events/clients/vendors/staff/crew), notifications popover with severity stripes, user menu (profile, theme, demo-account switch, sign out), focus-visible styles, reduced-motion support.
- Event workspace: 18 flat tabs regrouped into 5 phases (Sell / Plan / Produce / Money & close / Messages & log) with red dots where something needs attention.
- Dashboard: new `AttentionList` molecule (severity stripe + icon, danger first, "Show all") replaces the wall of filled alerts; KPI money without cents; "Days out" column.
- Layout fixes from screenshot review: grid children `min-width: 0`, cards scroll their own overflow, long links wrap, Day-of layout stacks below 1100px → **no horizontal scroll on any route at 400px**; login brand panel centered, submit label centered; portal hero flat ink with accent edge (no purple gradient).
- Living style guide gained the icon set and AttentionList.
- Verification: build OK, 28/28 tests, Playwright smoke + E2E flow with real sign-in → 0 runtime errors; screenshots reviewed in light, dark and 400px.
- Test scripts (scratchpad, not committed) now sign in through the login form.
