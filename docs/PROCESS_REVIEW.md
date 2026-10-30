# Process review — common cases and complex cases (#041)

Review date: 2026-10-30. Method: walk an agency's real week through the system, case by case, and check that each one has an owner, a rule, a record and a next step. Where the rules came from outside the codebase (hotel contracts, venue guarantees, allergen practice, local permits), the research and its sources are listed at the bottom. Earlier reviews: `FEATURE_REVIEW.md` (spec roast), `BUSINESS_REVIEW.md` (negative cases, #034–#035).

Legend: ✅ covered (rule + record + next step + test) · 🟡 partly (recorded, no rule) · ❌ not covered.

## 1. Common cases — the weekly path

| # | Case | Who | Where it lives | Status |
|---|---|---|---|---|
| C1 | Inquiry arrives (form, The Knot, email, marketplace) and gets a reply inside the SLA | Sales | Pipeline, `leadSla` next step | ✅ |
| C2 | Date availability check, first/second option hold, hold expiry & promotion | Sales | Availability, `HOLD_*`, automations | ✅ |
| C3 | Proposal versions with optional extras the client picks | Sales, client | Proposal tab, client portal | ✅ |
| C4 | Contract with every signer (payers, parents), deposit locks the date | Sales, finance | Contract tab, `dateStatus` | ✅ |
| C5 | Payment schedule, invoices, late fees, split payers | Finance | Finance tab, automations | ✅ |
| C6 | Vendors: RFQ → compare → book → COI/W-9 compliance → confirm | Planner | Vendors tab | ✅ |
| C7 | Guest list, RSVP per function, meals, plus-ones, seating | Planner, client | Guests, Seating, public RSVP | ✅ |
| C8 | Change orders after signing (scope, guest count) with client approval | Planner, client | Change orders | ✅ |
| C9 | Final headcount to venue and caterer | Planner | Guests → Final headcount | ✅ now with guarantee rules (§2.2) |
| C10 | Run of show, crew, call sheets, day-of offline mode | Production | Timeline, People, Day-of | ✅ |
| C11 | Post-event: returns, damage, gratuities, commissions, financial close | Finance | Post-event, closing checklist | ✅ |
| C12 | Client sees where they are, what to prepare, what to pay | Client | Client portal journey map | ✅ |
| C13 | Multi-function wedding (welcome dinner, ceremony, reception, brunch) | Planner | Functions | ✅ now with tradition templates (§2.6) |

## 2. Complex cases — what this round added

### 2.1 Hotel room block with attrition (destination weddings, conferences) — ✅ new
*The case.* The agency or couple holds 20 rooms × 2 nights at a group rate. Unbooked rooms return to the hotel at the cutoff (typically 3–6 weeks out). After the cutoff the hotel counts the rooms actually booked; below the attrition minimum (75–90% of the block) it invoices the shortfall. An audit clause credits guests who booked outside the block.

*What the system does now.*
- `ROOM_BLOCK_ADD` records hotel, rooms, nights, rate, cutoff, attrition % and audit clause; `ROOM_BLOCK_PICKUP` stores the hotel's pick-up report.
- `roomBlockStatus` computes minimum rooms, shortfall and money exposure. A warning appears 21 days before the cutoff, and a danger after it.
- `ROOM_BLOCK_RELEASE` gives rooms back for free, but only before the cutoff and never below what is already booked. This is the cheapest fix.
- `ROOM_BLOCK_SETTLE` is allowed only after the cutoff. It records the attrition charge and can pass it to the client as a draft change order (which needs a signed contract).
- *UI.* Vendors tab → **Hotel room blocks** shows a pick-up bar with a tick at the attrition minimum. The issue also appears in the event's next steps and on the dashboard.

### 2.2 Venue / caterer guarantee and the "count can only go up" rule — ✅ new
*The case.* The caterer bills the guarantee or the actual count, whichever is higher. After the guarantee date many venues allow at most a ~5% reduction, and the kitchen prepares a small overset.

*What the system does now.*
- **Below a vendor's minimum guarantee.** `FINAL_HEADCOUNT_SET` refuses the count until the planner acknowledges they will be billed for the minimum. The decision log records it.
- **After the guarantee date.** A drop beyond `guaranteeReductionPct` (5%) needs the venue's written agreement as the override reason.
- **Capacity.** The count can never exceed the venue's licensed capacity.
- **Overset.** The guests panel shows "Kitchen prepares N" (`oversetPct`, default 3%).

### 2.3 Severe allergies — ✅ new (backlog #4 from BUSINESS_REVIEW)
*The case.* Allergies belong to a named guest at a table, not to a headcount. The kitchen needs a per-table sheet and someone accountable for it.

*What the system does now.*
- **Severity.** Each guest has a severity (preference / intolerance / allergy / severe). The public RSVP page asks "Severe allergy (EpiPen / anaphylaxis)".
- **Sheet.** `allergySheet` lists severe cases first, by table, and flags severe cases that have no seat.
- **Sign-off.** `ALLERGY_SIGNOFF` records the caterer's sign-off as a fingerprint of the severe cases. Any later change makes it **stale**.
- **Blocker.** An unsigned or stale sheet **blocks Pre-Event**; the existing override with a reason still applies.
- **Print.** The printable sheet carries a signature line.

### 2.4 Permits and licensed capacity — ✅ new (backlog #7)
*The case.* Fire-code capacity per room, noise curfews outdoors, sparklers/fireworks, road use, and in Indonesia the police crowd permit (*izin keramaian*). Gatherings of roughly 300+ go to the Polsek, 1,000+ to the Polres, with a kelurahan letter and the organiser's KTP/KK.

*What the system does now.*
- **Suggested permits.** `permitPlan` suggests permits from the country, guest count, outdoor functions past 22:00, sparkler/firework mentions in change orders and the run of show, and road use. Each comes with authority, lead time and reason.
- **Approval.** `PERMIT_SET` requires a permit number before a permit counts as approved.
- **Capacity.** `CAPACITY_SET` stores licensed capacity per function and for the venue. A public RSVP cannot push a function past it; staff can still confirm, but a danger next step appears. Over-capacity and overdue permits **block Pre-Event**.
- *UI.* Plan → Functions & permits; Guests → Headcount per function → "Licensed for".

### 2.5 Postponement terms — ✅ new (backlog #3)
*The case.* Contracts typically allow one postponement with a fee. A second one, or a fee that isn't in the contract, causes disputes.

*What the system does now.*
- **Limit.** `postponementTerms` (`postponementFeePct` 10%, `postponementMax` 1). A further postponement needs an admin.
- **Fee.** The dialog pre-fills the fee from the terms and states them.

### 2.6 Cultural and multi-day weddings — ✅ new (backlog #8)
`FUNCTIONS_FROM_TEMPLATE` adds the functions of a tradition relative to the event date, with guest share per function and no duplicates. Available templates:
- Indonesian akad + resepsi (with pengajian/siraman)
- Indian mehndi / sangeet / ceremony / reception
- Chinese tea ceremony + banquet
- Destination weekend
- Two-day conference with gala

### 2.7 Already covered in earlier rounds (re-checked)
- **Vendor cancels or no-shows.** RFQ for a replacement, gap blocker, deposit recovery.
- **Payment.** Bounced or charged-back deposit (reverse + fee + date at risk); final balance unpaid at the cutoff.
- **On the night.** Overtime on the night with an approver; rain call; personal items in custody; vendor meals; lead SLA.
- **Commercial.** Split payers; parents as signers; change-order exceptions after the headcount deadline; cancellation tiers; multi-currency and regional tax (PPN / GST / VAT reverse charge).

## 3. Still open (honest backlog, ranked)

| # | Gap | Why it matters | Suggested approach |
|---|---|---|---|
| 1 | Venue cancels or double-books (relocation) | Rare, catastrophic | Treat the venue as a booking: cancel → replacement flow + "relocation" change order; carry room blocks and permits over |
| 2 | Room list / rooming manifest per guest | Planners reconcile the hotel's list against the guest list by hand | `guest.roomBlockId` + nights; pick-up computed from it instead of typed |
| 3 | Shuttle / transport manifest | Destination events move guests between hotel and venue | Transport legs per function with capacity, from the guest list |
| 4 | Ticketing / paid registration for corporate events | Conferences sell tickets and sponsorships | Ticket types, promo codes, refunds; badges exist already |
| 5 | Incident → insurance claim | Damage/injury follow-up | Severity + claim ref + photos (BUSINESS_REVIEW #5) |
| 6 | Gratuity envelopes in custody | Cash on the night | Extend custody items with amount + vendor (BUSINESS_REVIEW #6) |
| 7 | Permit rules per city | The rules here are a starting point | Rule packs per jurisdiction, maintained by the workspace |

## 4. Research notes and sources
- **Room blocks.**
  - The cutoff returns unbooked rooms to the hotel, typically 21–30 days or 3–6 weeks before.
  - Attrition sets a minimum fill of 75–90%; below it the hotel invoices the shortfall after the cutoff.
  - An audit clause credits rooms booked outside the block.
  - Sources: [Joy — attrition clause](https://withjoy.com/glossary/what-is-attrition-clause/), [Joy — wedding room block](https://withjoy.com/glossary/what-is-wedding-room-block/), [BeachBride — negotiating a destination room block](https://beachbride.com/destination-wedding-room-block-guide/), [Canary — hotel attrition](https://canarytechnologies.com/post/hotel-attrition).
- **Guarantees.**
  - The final count is due 3–30 days out, and some venues allow at most a 5% reduction.
  - Charges follow the guaranteed or final count, whichever is greater.
  - Kitchens prepare an overset above the count.
  - Sources: [Thirds BK FAQ](https://www.thirdsbk.com/faqs), [Four Seasons Atlanta wedding package](https://fourseasons.com/atlanta/weddings/packages/magnolia), [City of Mississauga terms](https://www.mississauga.ca/wp-content/uploads/sites/5/2026/01/29111003/TERMS-AND-CONDITIONS-FINAL.pdf), [catering contract template](https://www.business-in-a-box.com/template/catering-contract-D12731).
- **Postponement.**
  - Fees are usually fixed amounts or a contract percentage, and disputes arise when the fee is not written in the contract.
  - Force majeure applies only when the contract states it.
  - Sources: [WeddingWire forum — postponement fees](https://www.weddingwire.com/wedding-forums/postponement-fees-and-getting-an-attorney-involved/09e0b80b72a0353e.html), [Ellis Jones — COVID-19 and weddings](https://www.ellisjones.co.uk/?p=2078), [Progressive — postponing a wedding](https://lifelanes.progressive.com/postponing-wedding/).
- **Allergies.**
  - Record allergies per named guest and seat, mark the seating chart, keep a high-risk list for the kitchen, and plan for disclosures on arrival.
  - Sources: [Wristband.com](https://www.wristband.com/blogs/news/how-to-identify-guests-with-food-allergies-at-events), [Catersoft guests & dietaries](https://catersoft.co.uk/venue/features/guests.aspx), [Food Allergy Canada — tips for caterers](https://foodallergycanada.ca/professional-resources/foodservice/tips-for-caterers), [Brown University dining — event allergen form](https://dining.brown.edu/?p=9640).
- **Permits & capacity.**
  - Never exceed the licensed occupancy.
  - Noise variances are needed for late outdoor amplified music, and a permit matrix should name the authority, deadline and owner.
  - Sources: [BizBash site-inspection checklist](https://www.bizbash.com/catering-design/printing-graphics/article/13230883/site-inspection-checklist-11-things-event-planners-should-never-forget-to-ask), [TicketFairy — venue licensing & permits](https://branded.ticketfairy.com/blog/venue-licensing-permits-in-2026-navigating-the-regulatory-maze-for-live-events), [Lake Cuyamaca firehouse rules](https://www.lakecuyamaca.org/firehouse-rules).
- **Indonesia — izin keramaian.**
  - Polsek for one kecamatan, Polres when larger.
  - 300–500 people need a kelurahan letter and the organiser's KTP/KK; 1,000+ need an application, proposal and venue permit.
  - Sources: [Suara.com — surat izin keramaian](https://www.suara.com/news/2022/06/07/200042/surat-izin-keramaian-persyaratan-cara-mendapatkan-dan-jenisnya?page=all), [Kompas TV](https://www.kompas.tv/video/361562/begini-syarat-dan-cara-mengajukan-izin-keramaian-untuk-acara-besar), [Polresta Bengkulu](https://restabengkulukota.bengkulu.polri.go.id/?p=10495).

Most sources are vendor guides, venue policies and forums, not law. The defaults are configurable (`settings`), and the UI says the rules are a starting point to confirm with the venue and the local authority.
