# MAYOData — Remaining Work Plan

Status snapshot as of 2026-07-27. This picks up after the owner-comments hardening pass
(ownership/lease/verification/dispute workflow) and the crop-cycle/activities/finance
pass (farming activities, expenses, harvest revenue). Each phase below is independent
enough to tackle on its own; they're ordered by how much real user value they unlock
per unit of effort, not by dependency.

## What's already done (context, not to redo)

- **Ownership/lease/verification**: `FarmOwnership`, `FarmLease`, `SeasonalFarmAssignment`,
  `Dispute`, `OwnerConfirmationRequest`, `SuggestedFarmUpdate`, `FarmDataValue` — full
  backend + mobile + web, SMS/USSD included. Officer verification captures method,
  contact, evidence, and decision (not just a bare "verified" flag).
- **Field data collection**: `FarmFieldSurvey` — web (`/dashboard/field-surveys`) and
  mobile (`field-survey.tsx`, staff-only, GPS + offline draft) both wired to the same API.
- **Farming activities**: `CropCycle` + `ActivityLog` — mobile screens for starting a
  cycle, logging an activity (10 types, labor, photo, GPS), marking harvested. Every
  action writes to the farmer's `Activity` feed (the "Recent Activities" screen).
- **Expenses**: `InputCost` — farmer-facing mobile screen, category-tagged, auto-logged
  to the activity feed.
- **Harvest revenue**: `Revenue` — farmer-facing mobile screen (`revenue-new.tsx`),
  Fairtrade/conventional sale type, auto-computed totals, wired into the crop-cycle
  detail screen's "Sales" tab and the activity feed.
- **Identity verification**: `identity.tsx` already collects NIDA/Voter ID + face
  capture + profile photo and submits to `POST /farmers/:id/identity`.
- **Weather**: `weather.service.ts` already resolves OpenWeather vs Open-Meteo and
  returns which provider served the data — the *data* is real, only the *display* of
  "which provider" is missing from the UI (see Phase F).

Everything above was verified end-to-end: backend `tsc`/`nest build`/live boot with
routes mapped, mobile `tsc` clean, and — where a `USE_LOCAL_DATA` offline demo mode
exists — the local repository got matching logic so demo mode behaves the same as the
real API.

---

## Phase A — Buyer directory (blocks proper Fairtrade attribution)

**Status (2026-08):** Backend + web buyers CRUD exist. Mobile harvest sale now has an optional
buyer picker (`buyerId` on `POST /finance/revenue`); `GET /buyers` allows `FARMER`.

**Problem**: `Revenue.buyerId` and `Sale.buyerId` reference a `Buyer` model that has
**no controller, no service, no endpoint anywhere**. The revenue screen built in the
last pass deliberately omits buyer selection because there's nothing to select from.

**Backend**:
- New `BuyersModule` (`backend/src/buyers/`): CRUD for `Buyer` (name, Fairtrade cert
  number, contact person/email/phone, `isCertified`).
- `GET /buyers` (list/search), `POST /buyers` (staff: SUPER_ADMIN/ADMIN/MAMCOS_SECRETARY),
  `PATCH /buyers/:id`.
- Consider whether farmers should be able to *suggest* a new buyer (mirrors the
  `SuggestedFarmUpdate` pattern) vs. only picking from a staff-curated list — staff-curated
  is simpler and matches how Fairtrade certification actually works (someone has to
  verify the buyer is legitimately certified).

**Mobile**:
- `buyersApi.list()` in `src/lib/api.ts` + local-mode stub.
- Add an optional buyer picker (searchable chips or a simple modal list) to
  `revenue-new.tsx`, wiring `buyerId` into the `financeApi.addRevenue` call.

**Web**:
- `/dashboard/buyers` page: list + create/edit form, certification toggle.

---

## Phase B — Inventory module has zero mobile presence

**Status (2026-08):** Farmer mobile warehouse stock shipped — `GET/POST /inventory/records/mine`,
`GET /inventory/summary/mine`, drawer **Warehouse stock**, crop-cycle entry after harvest,
activity feed `inventory.received`. Official AMCOS weigh-in remains staff `POST /inventory/records`.

**Problem** (historical): `InventoryModule` existed on the backend with a full service, but
mobile had no `inventoryApi` and no screen. Web dashboard was staff-only.

**Decide first**: is inventory tracking meant to be farmer-facing (e.g. "how many bags
of paddy do I have in storage") or purely a MAMCOS/warehouse concern? `prompt.md` §2.1
lists it as a free farmer feature ("Record farm inputs" overlaps with `InputCost`, but
post-harvest storage tracking is a separate concept). Confirm scope before building.

**If farmer-facing**:
- `mobile/src/lib/api.ts`: add `inventoryApi` (list for farmer, receive stock).
- New screen `inventory.tsx` reachable from farm detail or crop-cycle detail after
  harvest — "I stored N bags in the warehouse."
- Wire into the activity feed (`inventory.received` type) like everything else.

---

## Phase C — Payments module has zero mobile presence outside membership

**Problem**: `PaymentsModule` exists (the generic `Payment` model covers
`RICE_PURCHASE`, `LAND_RENT`, `TRACTOR_SERVICE`, `INPUT_CREDIT`, `LOAN_REPAYMENT`), but
mobile only ever talks to `/memberships/*` for the membership payment flow. There's no
way for a farmer to see a payment history, or for a tractor-service payment
(`TractorBooking` already exists in marketplace) to actually charge anyone.

**Backend**: check whether `PaymentsService` already has the hooks tractor
bookings/land rentals need, or whether it's only wired for membership today.

**Mobile**:
- `paymentsApi.myPayments()` — a simple payment history screen (useful regardless of
  what triggers a payment: membership, tractor booking, land rent).
- If tractor booking is meant to actually charge (marketplace already has
  `bookTractor`), wire the booking flow to create a `Payment` record and surface its
  status.

---

## Phase D — Reconcile `FarmVerifications` with the new ownership/dispute system

**Problem**: `FarmVerificationsModule` (`POST /farm-verifications` — field officer
submits proof + neighbor details, `GET` history) predates the `FarmOwnership` /
`Dispute` / officer-verification-with-evidence work built in this session. It's not
connected to mobile at all, and it's unclear whether it's:
  (a) legacy and should be deprecated in favor of `FarmLease.officerVerify` +
      `Dispute`, or
  (b) a distinct concern (general farm-quality/grade verification vs.
      ownership/rental verification) that should stay and get its own mobile screen.

**Action**: read `farm-verifications.service.ts` and `FarmVerification` model fields
closely, compare against what `officerVerify` on `FarmLease` now captures, and decide:
merge or keep-and-connect. Don't build mobile UI for it until this is resolved — building
a screen for a model that's about to be deprecated is wasted work.

---

## Phase E — Weather provider indicator (small, high-visibility)

**Status (2026-08):** Mobile home already shows `Live weather from {provider}`. Web weather
page now shows a Live · provider badge from the forecast API (`provider: Open-Meteo`).

**Problem** (historical): owner asked to confirm real weather data; UI never named the provider.

**Mobile**: wherever weather is rendered (farm detail / dashboard weather card), add a
small caption using the `provider` field already returned by `weather.service.ts` —
e.g. "Live weather from Open-Meteo". This is a ~30-minute fix once located; low effort,
directly answers a question the owner asked by name.

---

## Phase F — Automated tests (prompt.md §29 / prompt2.md §25)

**Problem**: none of the work across this entire engagement — ownership, leases,
disputes, corrections, crop cycles, expenses, revenue — has automated test coverage.
Both source prompts explicitly list ~25 required test scenarios each. This is the
largest remaining gap by volume, and the one most likely to bite silently (e.g. a
future refactor reintroducing the `farmerId`-spoofing bug fixed in this session).

**Priority order** (highest-risk first, matches what's already had a real
authorization bug found in it):
1. Crop-cycle/finance ownership checks — a farmer cannot create/log/spend against
   another farmer's farm (regression test for the bug fixed in this session).
2. Lease lifecycle — create → renter confirm/reject → officer verify (all four
   decisions) → dispute creation on reject/dispute.
3. Ownership confirmation + `OwnerConfirmationRequest` expiry/resend rate limiting.
4. Membership gating — free vs. premium analytics responses never leak locked fields.
5. Suggested-update review — approval applies the whitelisted field, rejection doesn't
   touch the farm record, non-whitelisted fields are rejected outright.
6. Reward selection reproducibility (already implemented; just needs a test pinning
   the seeded-random output).

**Setup**: backend already has `jest`/`test` scripts (`npm run test`) — confirm a test
database strategy (likely a disposable schema or Prisma's test-database pattern) before
writing the first suite, since these are integration-style tests hitting Prisma.

---

## Phase G — Web admin gaps

- **AMCOS bulk import**: `prompt2.md` §3 asks for spreadsheet import of pre-registered
  farms. `farm-registry.service.ts` only supports one-at-a-time `preRegister`. A CSV/XLSX
  upload → bulk `preRegister` loop (with the same duplicate-detection logic) would match
  the "reduce AMCOS data-entry burden" goal directly.
- **Revenue/buyer entry from web**: staff (MAMCOS_SECRETARY) can already `addRevenue` via
  API but there's no web page for it — useful if AMCOS records sales on behalf of
  farmers without smartphones (mirrors the owner's stated feature-phone-parity goal).
- **Dispute assignment**: `Dispute.assignedOfficerId` exists and is settable on create,
  but there's no web affordance to *reassign* an open dispute to a different officer.

---

## Phase H — Visual polish (comments-from-owner.md §3, plan Phase 9)

Explicitly requested but explicitly low-priority relative to functionality: agricultural
illustrations/backgrounds on login, dashboard, farm registration, weather, and farm
detail screens. Keep assets bundled locally (no remote image loading — already a stated
constraint) and lightweight so it doesn't slow down registration. Do this last, after
the functional gaps above, since the owner's own notes treat it as "nice to have, not
blocking."

---

## Explicitly deferred (owner said "future version" / "not blocking initial implementation")

- **Farmland rental marketplace** (`comments-from-owner.md` §15) — browse/list
  available farmland, book, track request status. Owner's own note: "In a future
  version." Don't build until asked.
- **Satellite/remote-sensing data** (`prompt2.md` §17) — architecture should stay
  extensible (it already is: `FarmDataSource.SATELLITE` exists as an enum value and
  `FarmDataValue` can record it), but no integration work until a provider is chosen.
- **AI-assisted analytics / soil-validation-by-AI** (`comments-from-owner.md` §2.5) —
  same story: the report schema (`farm-reports.service.ts`) already has extension
  points (`FarmFieldSurvey`, `FarmDataValue`), no vendor chosen yet.

---

## Suggested order if picked up sequentially

1. Phase E (weather indicator) — fastest, directly answers an owner question.
2. Phase A (buyer directory) — completes the revenue feature just shipped.
3. Phase D (farm-verifications reconciliation) — a decision + likely deletion, not
   net-new work; clears confusion before more features pile on top of it.
4. Phase F (tests) — protects everything built so far; do this before scope grows further.
5. Phase B / C (inventory, payments) — need scope confirmation first (see notes above).
6. Phase G (web admin gaps) — staff-quality-of-life, not farmer-blocking.
7. Phase H (visual polish) — last, per the owner's own stated priority.
