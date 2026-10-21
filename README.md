# EO Management System

Event Organizer management system (social & corporate events, US & Western Europe) built with **React + Vite**, **no backend**, **mock data** in `localStorage`, on an in-house **Atomic Design system**.

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

- 📘 **HANDOFF.md** — architecture, design system, file map, spec → code mapping, demo script, limits. Start here.
- 📒 **CONTEXT.md** — chronological log of every engineering action (must be continued).
- 🔥 **docs/FEATURE_REVIEW.md** — feature audit ("roast"): bugs found, gaps closed, deferred backlog.
- 🧾 In the app, every user action is recorded in the **Activity Log** and can be exported to `.md`.
- 🎨 Living style guide at `#/design-system` (admin).

**Sign in** with a demo account (password `demo1234`), e.g. `olivia@lumiere.events` (admin), `ava@lumiere.events` (planner), `hannah@lumiere.events` (finance). The login page lists every team and portal account. Light/dark theme and a demo account switcher are in the user menu. Public pages: `#/inquiry`, `#/rsvp`.

---

## 🚢 FreightPilot (branch `claude/peaceful-goodall-7o79lh`)

This branch also contains **`freight-erp/`** — a separate front-end ERP prototype (React + Ant Design, mock data) for
an AI platform for freight forwarders (RFQ → invoice, CargoWise eAdaptor). See [`freight-erp/README.md`](freight-erp/README.md).

```bash
cd freight-erp && npm install && npm run dev
```
