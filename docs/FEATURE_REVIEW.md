# Feature Review ("Roast") — EO Management System

Review date: 2026-10-20 · Reviewer: AI senior product engineer · Scope: every module in the spec (§3–§4.15, §8) versus the v0.1 build.

Verdict on v0.1: **broad coverage, but several correctness bugs and "demo-ware" shortcuts that a real event company would hit in week one.**
Severity: 🔴 bug / data-integrity · 🟠 spec gap · 🟡 UX / polish. Status: ✅ fixed in this pass · ⏭ deferred (see bottom).

## 🔴 Bugs & data-integrity problems

| # | Finding | Why it matters | Status |
|---|---|---|---|
| R1 | **A signed event lost its date when the hold expired.** The automation engine expired *every* hold past 7 days — including Laurent–Dubois, whose contract was signed but deposit unpaid — and set `dateStatus = none`. | The spec says a signed-but-unpaid date is a *hold*, not "free". Silently releasing it could double-book a wedding. | ✅ Signed events keep the hold; a one-time **"deposit overdue — date at risk"** alert goes to finance/sales and is surfaced on the dashboard. Test added. |
| R2 | **Notification privacy leak.** Notifications were addressed to *roles*, so every client user saw every other client's change-order alerts, and every vendor saw every vendor's timeline changes. | GDPR / client confidentiality. | ✅ `visibleNotifications()` scopes client → own client account, vendor → events they're booked on, crew → events they have shifts on. Test added. |
| R3 | **Currency mix-up.** Catalog prices (USD) were copied raw into EUR/GBP/CHF proposals — €12,000 planning fee for a $12,000 item. | Under-/over-pricing every destination event. | ✅ Catalog is maintained in base currency and converted at the current rate when lines are added. Test added. |
| R4 | **Vendor with an expired COI could be confirmed.** Compliance was only a badge. | Insurance exposure; venues refuse uninsured vendors. | ✅ `BOOKING_CONFIRM` is rejected (and logged) while COI/license is expired. Test added. |
| R5 | **Postponement left vendors behind.** Tasks/shifts/payments moved, but vendor load-in/load-out stayed on the old date and vendors were not told. | Vendor no-show on the new date. | ✅ Load-in/out shift with the event, confirmed bookings flip back to *requested* (must re-confirm), vendors/crew/client notified. |
| R6 | **Contract signing matched portal users by first name.** Two "Emily"s could sign for each other. | Legally invalid signature. | ✅ Strict e-mail match; contract builder can add signers directly from client portal users with *sign* permission. |
| R7 | RSVP could be changed on the public page after the deadline. | Catering numbers drift after final headcount. | ✅ Configurable RSVP deadline (T-30 default) enforced for public RSVP; shown on the RSVP page. |

## 🟠 Spec gaps

| # | Spec | Gap in v0.1 | Status |
|---|---|---|---|
| G1 | 4.1 capacity "based on planner availability" | Capacity was a per-weekday number only. | ✅ Optional *planner-based capacity* (caps by lead-planner headcount) + "planners free" shown in every availability check. |
| G2 | 4.1 capture from website form / marketplaces | Only a manual internal modal. | ✅ Public **inquiry form** (`#/inquiry?source=…`) and a **marketplace lead simulator** (The Knot / WeddingWire / Bark e-mail parse). |
| G3 | 4.5 vendor portal: RFQ & tasks | Vendors could not answer RFQs or see tasks assigned to them. | ✅ Vendor portal: submit/update quotes, task checklist. |
| G4 | 4.6 QR check-in | "QR" was just a text code. | ✅ Real QR codes (atom `QrCode`): RSVP page, day-of check-in, printable badges/place cards. |
| G5 | 4.10 overtime rules | Only California daily OT was computed; US weekly (FLSA 40h) and EU weekly maximum ignored across events. | ✅ `weeklyCompliance()` across all events with premium cost; shown on Staff page. Test added. |
| G6 | 4.11 invoices & receipts | No invoice document; "receipt" only logged a note. | ✅ Printable invoice/receipt (bill-to, PO, VAT ID, payments, locked FX) and client proposal PDF. Every generation is audit-logged. |
| G7 | 2. Owner manages users | No user management. | ✅ Invite user, change role, edit client-portal permissions. |
| G8 | 4.2/4.4 configurable templates | Catalog items and task templates could not be added from the UI. | ✅ Add catalog item; add/remove task-template rows per Event Type. |
| G9 | 4.13 templates with variables | Templates only used by automations. | ✅ "Email from template" composer per event (merge, edit, send → outbox + interactions). |
| G10 | 4.2 version history | Versions existed but no "what changed". | ✅ Version diff (added / removed / changed lines, total delta). |
| G11 | 4.15 reporting | No filters. | ✅ Segment + event-date range filters across all reports and leakage. |

## 🟡 UX / architecture

| # | Finding | Status |
|---|---|---|
| U1 | 26 `window.prompt/confirm/alert` calls — unstyled, unvalidated, untestable, blocked in some browsers. | ✅ Promise-based design-system dialogs (`useDialog().form/confirm/prompt/alert`) with typed fields and validation. |
| U2 | Ad-hoc CSS classes and hand-rolled buttons on every page. | ✅ **Atomic Design system** (`src/design-system/`): tokens → atoms → molecules → organisms → templates; pages import only from the barrel; living style guide at `#/design-system`. |
| U3 | One dashboard for every role. | ✅ Role-tailored KPIs and attention list (sales / planner / production / finance / admin). |
| U4 | Planner "my events" filter was dead code (`|| true`). | ✅ "Only my events" toggle (default on for planners & sales). |
| U5 | Lead form validated with `alert()`. | ✅ Inline field errors. |
| U6 | Modals couldn't be closed with Esc; no ARIA roles. | ✅ Esc/backdrop close, `role=dialog`, `aria-selected` on tabs, `aria-pressed` on pills. |

## ⏭ Deferred (honest backlog)

- **Real integrations**: Stripe, DocuSign-grade e-signature (certificate of completion), QuickBooks/Xero APIs, Gmail/Outlook sync, Google/Microsoft calendar push — all still mocked (data shapes are ready).
- **Server-side authorization**: RBAC is enforced in the UI and in a few reducers only; a backend must enforce every capability.
- **Weekly overtime in event costing**: the premium is reported per staff member, not yet allocated back to individual events.
- **Seating floor plan** with free x/y placement and venue CAD import.
- **i18n**: English is the base language; strings are not yet extracted into a dictionary.
- **Offline**: simulated (local queue + sync flag); a real build needs a service worker + IndexedDB + conflict resolution.
- **Bundle size** (~600 KB): route-level code splitting.


---

## Addendum (#019–#022) — "Events are not projects": people, vendors, visuals & timelines

User feedback: events involve many people (often outsourced), many more vendors than a project, and **visuals and timelines are what usually gets missed**. Gaps found in the previous build and what was done:

| # | Gap | Status |
|---|---|---|
| E1 | Only individual crew shifts existed — no staffing plan ("12 servers 15:00–24:00"), no way to represent agency-supplied crews, no headcount-vs-confirmed view. | ✅ Staffing plan per event (department, role, qty, call/wrap, source, rate, zones); internal/freelance/outsourced; agency rosters; coverage chart; open-slot alerts on dashboard. |
| E2 | Outsourced labour cost was invisible in costing. | ✅ Agency positions billed on booked headcount, freelancers on confirmed people → crew cost → budget, profit, reports. |
| E3 | No accreditation / venue access control for temporary crew. | ✅ Credential zones, `CRW-` QR credentials (printable), day-of crew check-in/out, no-show alerts. |
| E4 | Agencies/vendors couldn't supply names. | ✅ Vendor-portal roster submission (restricted to their own positions). |
| E5 | Vendors coordinated as a list; no shared-resource, hand-off, access-window or curfew logic. | ✅ Venue resources (exclusive vs shared), access windows, ROS dependencies, live conflict engine + Production check panel. |
| E6 | Timelines were tables only. | ✅ Planning Gantt (one lane per vendor), event-day Gantt by vendor/function/resource/crew with drag-to-reschedule, live day-of board with NOW line, planner workload Gantt. |
| E7 | No visual of the space. | ✅ Site plan per room (drag elements, vendor footprint, seated counts from the seating chart); vendors see their own footprint. |

Still deferred: multi-event crew pooling (one agency crew across two same-day events), union rules beyond a rate, per-zone access scanning hardware, CAD/PDF floor-plan import, Gantt drag for vendor booked windows (only ROS items are draggable today).


---

## Addendum (#024–#026) — Login & UI/UX review

| # | Finding | Status |
|---|---|---|
| L1 | No login: anyone could switch to any role from a dropdown. | ✅ Mock sign-in with credentials, statuses (active/invited/suspended), lockout after 5 failures, audit of every attempt; admin reset/suspend. Account switch kept only as a labelled demo tool in the user menu. |
| U7 | Emoji used as icons (inconsistent rendering, no accessible names). | ✅ `Icon` atom; all emoji/glyph icons replaced. |
| U8 | Generic default typeface; no dark theme; literal colors in CSS. | ✅ Self-hosted type pairing; full token-based dark palette with System/Light/Dark switch. |
| U9 | 18 workspace tabs in one overflowing row. | ✅ Five phase groups with attention dots. |
| U10 | Dashboard attention area was a wall of filled red/yellow boxes. | ✅ `AttentionList` with severity stripes, danger first, collapsible. |
| U11 | Page scrolled sideways at phone width; sidebar unusable on mobile. | ✅ Drawer navigation, overflow fixes; verified 0 horizontal scroll on every route at 400px. |
| U12 | No way to find a record quickly. | ✅ Global search with `/` shortcut and keyboard navigation. |

Deferred: real identity provider (SSO, MFA, server sessions), per-user saved preferences on a server, i18n string extraction.

## Addendum (#030–#031) — Login clutter, priorities, lifecycle, "drive the event"
- **Login was a wall of 18 demo accounts** → 8 role tiles (one click signs in) + an *All accounts* dialog.
- **No guidance after sign-in** → role-aware *Today's priorities* callouts on the dashboard (each opens the exact event tab); task callouts on the client and vendor portals.
- **Lifecycle bar looked clickable but wasn't** → `Stepper` organism: every stage is selectable and shows when/by whom it was entered (recorded `stageHistory`) or what is still required to reach it. Closed events show the final stage as done.
- **Archived event offered Postpone/Cancel** → stage-aware actions; closed events get a read-only summary.
- **Overview too shallow to run an event** → cockpit: next steps with CTAs, key dates with countdown, readiness by area (money, vendors, guests, people, production, tasks), functions, venue & logistics, who's who, vendors on site. Overview is its own phase; event rows are clickable.
