# EventOS — EO Management System (SaaS)

Event Organizer management system (social & corporate events) delivered as a **multi-tenant SaaS**: public site, sign-up, 6-step onboarding, workspaces, plans & billing, operator console — built with **React + Vite**, **no backend**, **mock data** in `localStorage`, on an in-house **Atomic Design system**. See **docs/SAAS.md**.

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

- 📘 **HANDOFF.md** — architecture, design system, file map, spec → code mapping, demo script, limits. Start here.
- 📒 **CONTEXT.md** — chronological log of every engineering action (must be continued).
- ☁️ **docs/SAAS.md** — platform layer: plans, entitlements, onboarding, billing, operator console, backend contract.
- 🔥 **docs/FEATURE_REVIEW.md** — feature audit ("roast"): bugs found, gaps closed, deferred backlog.
- 🧾 In the app, every user action is recorded in the **Activity Log** and can be exported to `.md`.
- 🎨 Living style guide at `#/design-system` (admin).

**Start** at `#/` (landing) → *Start free trial* to create your own workspace, *Explore the live demo* for the demo workspace, *Log in* to find a workspace (`lumiere`, `balibliss`, `northwind`, `petalandpine`, `sunsetcoast`), `#/operator` for the SaaS owner console (`operator@eventos.app`). In the demo workspace, sign in with a demo account (password `demo1234`), e.g. `olivia@lumiere.events` (admin), `ava@lumiere.events` (planner), `hannah@lumiere.events` (finance). The login page lists every team and portal account. Light/dark theme and a demo account switcher are in the user menu. Public pages: `#/inquiry`, `#/rsvp`.
