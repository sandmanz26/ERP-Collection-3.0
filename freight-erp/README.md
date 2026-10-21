# FreightPilot — AI platform for freight forwarders (front-end prototype)

RFQ → rate request → quotation → booking → documents → tracking → invoicing, for forwarders that run
**CargoWise One**. Front-end only: **React 18 + Vite + Ant Design 5**, no backend, realistic **mock data**
persisted in `localStorage`.

```bash
cd freight-erp
npm install
npm run dev      # http://localhost:5173
npm test         # 15 unit / integration tests on the business logic (node --test)
npm run build    # static build in dist/
```

## Demo in 3 minutes
1. **Top bar** — switch tenant (3 forwarders in 3 regions: 🇮🇩 Jakarta, 🇪🇺 Frankfurt, 🇺🇸 N. Virginia) and switch user/role
   (admin, manager, pricing, sales, ops, finance). Approve buttons respect the role.
2. **RFQ inbox → New RFQ** — simulate an email / PDF / Excel / WhatsApp RFQ (tick *make it messy* to force human review),
   or paste your own text. The extractor returns value + confidence + evidence per field.
3. In the RFQ: confirm the data → **Send rate requests** → **Simulate replies** → compare (cheapest / fastest / best value)
   → **Quote this**.
4. Quote: margin rule applied automatically, editable lines, live preview in the tenant's template →
   **Submit for approval** → approve each step → **Send** → **Customer accepted**.
5. Shipment: confirm the booking push (Universal Shipment XML to CargoWise eAdaptor) → **Receive document**
   (mismatches flagged) → **Receive next event** (Universal Event, customer update drafted) → **Invoicing** tab:
   receive a carrier invoice (AP variance check) and create the AR invoice (Universal Transaction).
6. Check **Approvals**, **AI audit log**, **Usage & billing**, **Connectors** (message log with XML, SDK) and
   **Tenant settings** (margin rules + tester, templates, approval workflows, automation, data residency).

Reset everything with the ↻ button in the top bar.

## Requirement → where it lives

| Requirement | Implementation |
|---|---|
| RFQ intake (email, PDF, Excel, WhatsApp) → standard format | `src/lib/extract.js`, `pages/Rfqs.jsx`, `pages/RfqDetail.jsx` |
| Rate requests, reply parsing, comparison | `ops.sendRateRequests/recordRateReply`, `lib/pricing.js#compareRates`, `RfqDetail.jsx` |
| Sell rate from margin rules, forwarder template, staff approval | `lib/pricing.js`, `components/QuotePreview.jsx`, `pages/QuoteDetail.jsx`, `lib/approvals.js` |
| Booking in CargoWise when the customer accepts | `ops.customerDecision → createShipment → pushBooking`, `lib/connectors/cargowise.js#universalShipment` |
| Documents (CI, PL, B/L) validated vs shipment, mismatches flagged | `lib/validation.js`, `components/ExecutionPanels.jsx#DocumentReview`, `pages/Documents.jsx` |
| Tracking milestones + customer status updates | `ops.recordMilestone`, Universal Event, `pages/Tracking.jsx` |
| AR invoice from quoted rates + actual costs; AP vs expected with variance | `lib/reconcile.js`, `pages/Invoicing.jsx`, Universal Transaction |
| Multi-tenant (separate data, users, settings) | every record has `tenantId`; `StoreProvider` exposes only tenant-scoped collections; tenant switcher |
| Configurable workflows (margin rules, templates, approval steps) | `pages/Settings.jsx`, per-tenant `settings` in `data/tenants.js` |
| Connector framework (new TMS/ERP without core changes) | `lib/connectors/registry.js` (capability routing + config schema → form), `pages/Connectors.jsx` |
| Human-in-the-loop at each critical step | `lib/inbox.js` + `pages/Approvals.jsx` (RFQ review, quote, booking, documents, AR, AP, customer messages) |
| Audit log for each AI action | `ops.audit()` — model, confidence, input/output, HITL outcome; `pages/AuditLog.jsx` (CSV export) |
| Usage metering per tenant (RFQs, documents, invoices) | `ops.meter()`, `pages/Usage.jsx` (plan, overage, estimated bill) |
| Regional data hosting | tenant `region`, residency panel + migration request, `pages/Platform.jsx` |
| CargoWise eAdaptor, Universal Shipment / Event / Transaction, per-tenant credentials | `lib/connectors/cargowise.js`, connector instances per tenant |

## Architecture

```
src/
  lib/                 pure business logic (no React) — unit-tested
    extract.js         RFQ extraction (stands in for the LLM service): value + confidence + evidence
    pricing.js         margin rules, sell-rate calculation, rate comparison
    approvals.js       configurable approval chains + role checks
    validation.js      document ↔ shipment validation
    reconcile.js       AP reconciliation, AR line building
    connectors/        registry (capabilities, config schema, dispatch) + CargoWise Universal XML adapter
    simulate.js        simulators for customers, carriers and document senders (no backend)
    inbox.js           cross-module human-in-the-loop queue
  store/
    ops.js             domain operations (mutate a draft, write audit + usage); used by UI and seed
    StoreProvider.jsx  React context, tenant scoping, localStorage persistence, simulated AI latency
  data/
    tenants.js         3 forwarders with different settings, users, customers, partners
    seed.js            replays ~90 days of real operations → consistent audit log, XML messages, usage
  components/          shared UI (status tags, approval chain, quote preview, execution panels)
  pages/               one file per screen
```

Everything that happens goes through `run(op, args)` in the store, so the audit log, usage meters and
integration message log are always consistent with what the UI shows. Replacing the mock layer with an API
means implementing the same operations server-side.

> Note: the mock "AI" is a deterministic heuristic extractor so the demo works offline; the confidence/evidence
> contract is what a real LLM extraction service would return.
