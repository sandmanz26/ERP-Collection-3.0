# Competitive strategy (#043)

Research date: 2026-11. Sources are review sites, comparison blogs, vendor pages and press — directional, not audited.

## Market map
| Segment | Players | Their gap we attack |
|---|---|---|
| Business back-office | HoneyBook (~$29–109/mo), Dubsado | Industry-agnostic: no timeline, seating, RSVP; only US/CA/UK/AU; clients ignore the portal and use WhatsApp/email |
| Wedding planning tools | Aisle Planner (~$50–190/mo, per active project), Planning Pod | Weak payments (no auto-pay), weak accounting, basic RSVP, per-project pricing |
| Venue sales / enterprise | Tripleseat (quote, reportedly ~$375/venue), Perfect Venue ($99–339), Cvent, Social Tables | Built for one venue, expensive, not for agencies running many vendors |
| Indonesia / SEA | Bridestory (Tokopedia), Weddingku | Lead marketplaces, not operations; WOs run on WhatsApp + Excel |

Market: event-management software ≈ $7–18B (2025), 8–15% CAGR; wedding slice ≈ $1.7–2.6B. Indonesia ≈ 1.5M marriages/yr and falling → agencies need efficiency and margin.

**Positioning:** the operating system for event agencies — inquiry to last invoice — built for Southeast Asia. Wedge: mid-size Indonesian wedding organisers (10–60 events/yr).

## Implemented from the research (#043)
| Bet | What it does | Where |
|---|---|---|
| **Event Health (0–100)** | Every point lost is a real risk (readiness areas, danger/warning next steps), weighted heavier near the date; hover shows why. Goal: 100 before T-7 | Event header, Events list (`lib/growth.js#eventHealth`) |
| **Vendor reliability badges** | Earned only from recorded data: *On time* (load-ins or reviews), *Quick quotes* (RFQ answered ≤3 days), *Repeat partner* (3+ events), *Top rated* (4.7+ over 3+ reviews); a vendor who cancels on us loses them and gets *Cancelled on us* | Vendor directory (`vendorBadges`) |
| **WhatsApp** | wa.me links with the message prefilled: payment reminders to the client, "please confirm" to requested vendors | Finance → Remind; Event → Vendors |
| **Monthly recap** | Events delivered, new bookings, collected, on-time payment rate, average health — one-click "Copy summary" to share | Reports |
| **Client milestones** | The portal celebrates a step finished in the last 14 days (contract signed, deposit received…), dismissable | Client portal → Where we are |
| **Local lead sources** | Indonesian workspaces track WhatsApp, Instagram, Bridestory, Weddingku, TikTok, wedding fair | Workspace defaults |

Gamification rules we follow (evidence: progress indicators help in B2B; unredeemable points and streaks backfire for bursty work): no streaks, no staff leaderboards, no points. Measure by activation, events per account, on-time payment rate and retention — not by engagement with the mechanic.

## Next (not built yet)
1. Real WhatsApp Business API (inbound chats filed per event) and Midtrans/Xendit (QRIS, VA, auto-charge).
2. Bahasa Indonesia UI; e-Faktur PPN invoices.
3. Free vendor portal as a network: invited vendors join free; badges rank them when agencies pick vendors.
4. Lead inbox importing Bridestory/Weddingku/Instagram.
5. AI drafting: inquiry → proposal, contract → schedule, run of show → call sheets.
6. Flat IDR pricing per active event, unlimited users; referral month; Bridestory Market presence; WO association partnership.
