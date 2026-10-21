# Business review — the roast from a BA and a working wedding / EO planner

> Scope: the whole system as of CONTEXT #033, read against how weddings and events actually run and fail.
> Verdict first: **the happy path is strong** (lead → proposal → contract → deposit → planning → day-of → close,
> with audit, multi-payer, change orders, workforce, timelines and a client panel). **What was missing was the
> unhappy path** — the cases that cost real money and real reputations. This round adds the most expensive ones.

## How to read this

| Severity | Meaning |
|---|---|
| 🔴 Critical | Happens every season; costs money or the event if unhandled |
| 🟠 High | Common; causes disputes, leakage or client distrust |
| 🟡 Medium | Real but rarer, or a workaround exists |

Each item: **real case → what the system did before → what it does now (or why it is deferred).**

---

## 🔴 1. A vendor cancels (or no-shows) weeks before the date
**Real case.** The band's lead singer is injured three weeks out; a florist closes; a caterer loses its kitchen. The
planner has to (a) stop paying them, (b) get the deposit back, (c) find a replacement fast, (d) tell the couple calmly,
and (e) make sure nobody forgets the gap until it is filled.

**Before.** No cancel action at all. A booking could only be "requested" or "confirmed"; `BOOKING_UPDATE` could patch
any status, and a cancelled vendor would still count as booked.

**Now.**
- `BOOKING_CANCEL` (who cancelled + mandatory reason): stops unpaid installments, records the **deposit to recover**
  when the vendor walks away, and sends an **urgent replacement RFQ** to every other *compliant* vendor in the same
  category (quotes due in 3 days or the day before the event, whichever is first).
- The category is a **gap** until a live booking replaces it: a red next step, a **stage blocker** for Pre-Event /
  Event Day, and — for the client — "Replacement being booked" in their Team tab (never a silently shorter list).
- The client gets a **neutral notice** ("we are already securing a replacement at the agreed scope"); the reason stays
  internal.
- Deposit recovery is a **closing-checklist item**; a cancelled booking cannot be confirmed again, and status can no
  longer be patched around the rules.

## 🔴 2. The deposit bounces / is charged back
**Real case.** ACH returned for insufficient funds, a card chargeback after a family row, a bounced cheque. The date
was "locked" on that money — another couple may be waiting for it.

**Before.** Payments could only be added. Nothing could undo a payment, and the date stayed locked.

**Now.** `PAYMENT_REVERSE` (finance/admin only, once per payment, reason required): writes an **opposite ledger
entry** (never deletes), reopens the invoice and the schedule item, puts the **date back on HOLD** if it was the
deposit, can **re-bill the returned-payment fee**, notifies the team, and tells the client (only users who see money).
The client journey no longer claims "Date secured" while the deposit is unpaid.

## 🔴 3. The final balance is not paid before the event
**Real case.** "We'll bring a cheque on the day." Vendors are paid from that balance; once you are on site you have no
leverage.

**Before.** An overdue invoice was flagged, but nothing stopped the event from progressing.

**Now.** A **final-balance cutoff** (default T-14, configurable): at-risk warning 10 days before the cutoff, then a
**breach** that **blocks Pre-Event and Event Day**. The only way through is an **admin override with a written
reason**, stored on the event (`ev.overrides`) — previously any "force" was silent and unlogged-by-reason.

## 🟠 4. The party wants another hour
**Real case.** 23:15, the band is great, the father of the bride says "keep going". Next week he disputes the
$3,000 invoice: "I never agreed to that". Venue overtime, band overtime and crew overtime are all real costs.

**Before.** Not modeled. Pure leakage.

**Now.** Day-of → **Overtime**: pick +30/60/90/120 min, see the **price first** (venue rate, vendor overtime rates,
crew still on site at the OT multiplier + markup), choose the **authorized approver** (client users with cost
approval + the client's decision makers — "the best man" is refused), confirm → an **overtime invoice**, a decision
record and a client notice. Overtime revenue counts in event profit and balance.

## 🟠 5. Rain on the outdoor function
**Real case.** A rooftop welcome dinner, a lavender-field ceremony. The tent company needs the call 48–72 h before;
the couple needs to know there *is* a plan.

**Before.** Only a free-text decision in the log.

**Now.** A **weather plan** per event (function, Plan A, Plan B, call deadline). The call is a dated decision
(`WEATHER_CALL`), surfaced as a next step when due within 7 days and red when overdue, written to the decision log,
and shown to the client ("Your planner makes the call by … and lets you know here").

## 🟠 6. The card box disappears at midnight
**Real case.** Card boxes are stolen at weddings every year; heirloom cake knives and signed marriage licences get
left behind. The question afterwards is always "who had it last?".

**Before.** Not modeled.

**Now.** **Personal items in custody**: expected → received (from whom) → handed back (to whom), with names and
timestamps, on the event cockpit, Day-of (**Items**) and the post-event tab. Open items **block financial close**;
the client is told when an item is handed back.

## 🟠 7. Vendor meals missing from the caterer count
**Real case.** Photographer, band, florist and the planning team need to eat; caterers charge for them and need the
number with the final count. Forgetting it means 15 hungry crew at 21:00 or a surprise invoice.

**Now.** `meals` per vendor booking + our staff on shift → "17 meals to add to the caterer count", and the caterer
total once the final headcount is set.

## 🟠 8. Inquiries left unanswered
**Real case.** Couples send the same inquiry to 5 planners and book the first one who calls back. A 3-day silence is a
lost wedding.

**Before.** New leads sat in the pipeline with no clock.

**Now.** A **first-response SLA** (default 24 h, configurable): next step "Reply within 24h", red "Inquiry unanswered
for 52h" when breached; logging a call/email/meeting (not an internal note) stops the clock. Inbound vs outbound is now
recorded on interactions.

## 🟡 9. Vendors late on the day
**Now.** Day-of → **Vendors**: arrival check-in per vendor; a vendor past load-in + 15 min (configurable) without a
check-in is flagged red with a call button, and appears as a danger next step on the event day.

## 🟡 10. Overrides without accountability
**Now.** Overriding stage requirements is admin-only and needs a written reason (min. 5 characters), kept on the event
and in the activity log.

---

## Still open (honest backlog, ranked)

| # | Gap | Why it matters | Suggested approach |
|---|---|---|---|
| 1 | **Venue cancels / venue double-books** | Rare but catastrophic | Treat the venue as a booking with the same cancel → replacement flow; add a "relocation" change order |
| 2 | **Client wants to downgrade after signing** | Guest count drops below minimums → disputes | Minimum-spend clause per contract; CO validation against the guarantee (guarantee warnings exist, enforcement doesn't) |
| 3 | **Postponement fees & date-change terms** | Postpone exists, but fee rules don't | Postponement fee table in the contract template, auto-CO on postpone |
| 4 | **Allergy safety sheet for the caterer** | Severe allergies are a safety issue | Severe-allergy flag per guest → printable sheet per table for the caterer, signed off on the day |
| 5 | **Incident → insurance claim** | Damage/injury follow-up | Incident severity + claim reference + photos to the insurer |
| 6 | **Gratuity distribution on the night** | Cash envelopes go missing too | Extend custody to tip envelopes per vendor |
| 7 | **Local rules** (noise permits, sound curfew, fire capacity) | Fines or a shutdown at 22:00 | Permit checklist per venue/jurisdiction; capacity vs RSVP check |
| 8 | **Cultural / multi-day weddings** (e.g. akad + resepsi, mehndi + sangeet) | Different vendors and dress codes per function | Already supported as functions; templates per tradition would speed planning |
| 9 | **Real payments** | Card/ACH returns arrive as webhooks | Map `PAYMENT_REVERSE` to Stripe `charge.dispute.created` / ACH return codes |

## Where it lives

| Area | Files |
|---|---|
| Rules (pure) | `src/lib/risk.js` |
| Actions | `src/store/handlers/risk.js` (`BOOKING_CANCEL`, `VENDOR_REFUND_RECOVERED`, `VENDOR_ARRIVED`, `PAYMENT_REVERSE`, `WEATHER_PLAN_SET`, `WEATHER_CALL`, `OVERTIME_APPROVE`, `CUSTODY_ADD`, `CUSTODY_UPDATE`); override rules in `crm.js#STAGE_CHANGE`; guards in `vendors.js` |
| Blockers & checklist | `lib/lifecycle.js` (pre_event / event_day), `lib/derived.js` (`closingChecklist`, `eventContext`, overtime/fee revenue) |
| Next steps | `lib/eventGuide.js#riskActions` |
| UI | Event cockpit → *Risks & contingencies* (`pages/event/RiskPanel.jsx`); Vendors tab (Cancel…, meals, overtime rate, deposit recovered); Finance tab (Reverse…); Day-of → Vendors / Overtime / Items (`pages/dayof/DayOfRisk.jsx`); Post-event → Personal items; Settings → Risk rules; client portal notices, weather plan, "being replaced" |
| Tests | `tests/risk.test.js` (8 tests, each a negative case) |
