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
