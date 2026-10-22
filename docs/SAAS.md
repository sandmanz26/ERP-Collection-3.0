# SaaS layer — EventOS

The event-management app (everything built before #037) is now **one workspace** inside a multi-tenant SaaS.
A **platform layer** sits above it and owns sign-up, onboarding, workspaces, plans, billing, entitlements and the
operator console. Like the rest of the project it is a **front-end mock** (no backend, data in `localStorage`), but it
is shaped exactly like a production SaaS so a backend can replace the mock behind the same contracts.

```
                         ┌───────────────────────────── Platform layer (src/platform) ─────────────────────────────┐
 visitor ─► Landing ─► Sign-up ─► Onboarding (6 steps) ─► buildWorkspace() ─► workspace state ─► ENTER_WORKSPACE      │
 member  ─► Log in = find workspace (URL or email) ─► workspace sign-in (tenant Login)                               │
 owner   ─► Settings → Plan & billing ─► CHECKOUT / PLAN_CHANGE / CARD_UPDATE / CANCEL / RESUME / DELETE            │
 billing ─► PLATFORM_TICK (trial expiry, renewals, failed renewals → past due, scheduled cancellations)             │
 SaaS owner ─► #/operator ─► MRR · trials · churn · workspaces (extend trial, suspend, comp plan)                    │
                         └────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │ entitlement(tenant) → checkAction() on EVERY tenant action
                         ┌────────────────────────── Workspace (tenant) = the existing app ─────────────────────────┐
                         │ StoreProvider(load, save, guard) → reducer → handlers → activity log (denials logged)    │
                         └──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Files
| File | What it does |
|---|---|
| `src/platform/plans.js` | Product identity (`PLATFORM`), plans & prices, feature matrix, limits, trial length, regions, brand colors, reserved URLs |
| `src/platform/entitlements.js` | `entitlement(tenant, today)` → status, writable, features, limits, banner · `checkAction()` gate · `usage(appState)` metering |
| `src/platform/workspace.js` | `buildWorkspace({ owner, company, profile })` → a complete tenant state (v6) in the right currency/taxes, catalog priced in local currency, invites, optional sample event created **through the real reducer** · `slugify`, `slugError` |
| `src/platform/platformReducer.js` | Platform actions (sign-up, onboarding, workspace enter/leave/update/delete, checkout, plan change with proration, card update, cancel/resume, billing run, operator actions), card validation, `tenantMrr`, demo platform seed |
| `src/platform/PlatformStore.jsx` | Provider + persistence, per-tenant storage (`eo-ws-<tenantId>`), lazy creation of demo/seeded workspaces, legacy migration, `WorkspaceCtx` |
| `src/platform/WorkspaceRoot.jsx` | Mounts one workspace: isolated store, guard, branding (CSS custom properties incl. dark mode), lazy-loaded app |
| `src/platform/SaasChrome.jsx` | Subscription banner, `UpgradeWall`, `useFeature`, Getting-started checklist |
| `src/platform/pages/*` | Landing (+pricing, FAQ), Sign-up, Onboarding wizard, Find workspace, Operator console, Plan & billing panel, shared site chrome |
| `src/Root.jsx` | Chooses the layer: public routes when no workspace is open, otherwise the workspace; guest pages `#/rsvp?w=<url>` and `#/inquiry?w=<url>` |

## Plans (USD, per workspace)
| | Starter $39 | Studio $99 | Agency $249 |
|---|---|---|---|
| Team seats (admin, sales, planner, production, finance) | 2 | 8 | ∞ |
| Active events (not archived / lost / cancelled) | 15 | ∞ | ∞ |
| Client portal · Vendor portal · Day-of (offline) · Workforce · Automations · Branding | — | ✓ | ✓ |
| QuickBooks/Xero · Audit export · SSO | — | — | ✓ |

Annual = 10 × monthly. Trials last 14 days on Studio, no card. Clients, vendors and day-of crew logins never use a seat.

## Subscription status machine
`trialing` → (card) `active` · (trial ends) `expired` · `active` → (renewal fails) `past_due` → (card updated) `active`
· `active` + cancel → `cancelAtPeriodEnd` → `canceled` · any → `suspended` (operator) → previous status.

| Status | Can enter | Writable | Notes |
|---|---|---|---|
| trialing | ✓ | ✓ | Studio features, countdown banner |
| active | ✓ | ✓ | |
| past_due | ✓ | ✓ for 7 days, then ✗ | banner asks to update the card |
| expired / canceled | ✓ | ✗ | read-only: sign-in, preferences and exports still work — data is never held hostage |
| suspended | ✗ | ✗ | operator action with a reason; demo workspace can't be suspended |

## Enforcement (what is checked where)
- **Every tenant action** goes through `checkAction(ent, type, payload, state)` *before* the reducer; a denial is logged as
  `REJECTED` in the workspace activity log with the reason and shown as a toast (`action.denied` in `reducer.js`).
- Read-only allowlist: `LOGIN, LOGOUT, SET_USER, THEME_SET, NOTIFICATIONS_READ, SET_ONLINE, DOCUMENT_GENERATED`.
  System automations in a read-only workspace are skipped silently.
- Seat limit on `USER_CREATE` / reactivation / role change; active-event limit on `LEAD_CREATE`.
- Feature gates: portal & crew roles can't be created or sign in without the feature; workforce, automation templates,
  accounting sync, branding, day-of overtime/arrivals are gated; routes/tabs show an `UpgradeWall`; nav shows a lock.
- `RESET_DEMO` is refused in every workspace except the demo — it would otherwise overwrite a customer's data.
- The password-less "switch demo account" menu only exists in the demo workspace.
- Downgrades are refused while usage exceeds the target plan's limits; upgrades are prorated, downgrades become credit.

## Tenant-awareness fixes made for SaaS
New leads used to default to `u_sales`, USD and New York tax; KPIs were hard-wired to USD; tax assumed US or EU/UK/CH;
the logo letter and demo tiles assumed Lumière. Now: `settings.defaults` (currency, jurisdiction, country) drive new
leads and forms; KPIs use the workspace base currency (`toBase`); Indonesia (PPN 11%), Singapore (GST 9%), Australia
(GST 10%) and IDR/SGD/AUD exist, with reverse charge limited to EU/UK/CH; payment rails per currency (QRIS / virtual
account for IDR, PayNow for SGD, PayID for AUD).

## What a real backend must do (the mock cannot)
1. **Tenant isolation in the database**: every row carries `tenant_id`; enforce with row-level security
   (e.g. Postgres RLS) — never trust the client. Workspace URL → `tenant_id` resolution at the edge (subdomains).
2. **Auth**: hashed passwords (argon2/bcrypt), email verification, invitations with signed one-time links, password
   reset, MFA, SSO (SAML/OIDC) on Agency, sessions scoped to one tenant; operator auth separate with audit and
   just-in-time access (no silent impersonation).
3. **Entitlements server-side**: the same `checkAction` logic in the API (the client copy only shapes the UI).
4. **Billing**: Stripe Billing (customers, subscriptions, proration, tax, invoices, dunning) and webhooks
   (`invoice.payment_failed` → `past_due`, `customer.subscription.deleted` → `canceled`, `charge.dispute.created`);
   the mock's `PLATFORM_TICK` is what those webhooks replace. Never store card numbers — use Stripe Elements.
5. **Client payments** (each workspace collecting from its clients): Stripe Connect / Xendit / Midtrans per region,
   replacing the mock `PAYMENTS_CONNECT`.
6. **Data lifecycle**: exports, deletion with grace period and backups, DPA/GDPR (EU), UU PDP (Indonesia).
7. **Email**: transactional email per tenant (verified sending domain), replacing the mock outbox.

## Demo accounts
- Platform operator: `#/operator` → `operator@eventos.app` / `demo1234`.
- Workspaces (find them on *Log in*): `lumiere` (demo, Studio, every role), `balibliss` (Indonesia, trial),
  `northwind` (UK, Agency annual), `petalandpine` (Australia, Starter, past due), `oldtown` (EU, canceled),
  `sunsetcoast` (US, trial expired → read-only). Every account's password is `demo1234`.
- Test cards: `4242 4242 4242 4242` succeeds · `4000 0000 0000 0002` declined · `4000 0000 0000 0341` succeeds, then fails at renewal.
