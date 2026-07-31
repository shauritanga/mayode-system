# M-LAX (MAYODE Land & Asset Exchange) — Production Build Plan

## Progress — "make it 100%" round (closing every gap from the PDF audit)

- [x] Blacklist enforcement — `createLandListing`/`depositEscrow`/`bookTractor` now reject any blacklisted farmer. Verified live.
- [x] Digital Lock enforcement — `createLandListing` now checks `farm.leaseLockedUntil` in addition to `isLeased`. Verified live.
- [x] Multi-year rent schedule (Step-Up/Rice-Linked) — `PricingService.buildRentSchedule`/`computeInstallmentAmount`; `paymentPlan` (PREPAID/ANNUAL), `rentScheduleJson`, `lastInstallmentYear` on `LandListing`; `installmentYear` on `EscrowPayment`; new `payAnnualInstallment`/`getRentSchedule` endpoints; `MultiYearRentSchedulerService` monthly reminder. Renter's Right to Improve (`LandListingImprovement` + `logLandImprovement`) deducts logged spend from the next installment. Verified live end-to-end on a real 3-year STEP_UP lease: schedule computed exactly 2.0M→2.2M→2.42M (doc's exact example), a bogus client-supplied deposit amount was correctly overridden server-side, year-2 installment settled without re-entering verification, a 300,000 improvement credit correctly reduced year-3 to 2,120,000, and a 4th installment on a 3-year lease was correctly rejected. Also verified rice_linked+PREPAID is rejected (future rice price unknown) while rice_linked+ANNUAL correctly freezes a sacks-equivalent (2.2M/100,000 = 22 sacks).
- [x] Make an Offer / bargaining — new `LandListingOffer` model; `submitOffer`/`respondToOffer` (accept/reject/counter)/`respondToCounterOffer`/`findOffersForListing` endpoints. Verified live: submit → owner counters → farmer accepts counter, with `offerAmount` correctly updated to the negotiated 1,900,000 at each step.
- [x] Reward for Honesty (in-app protection flag) — `LandListing.mayodeProtected` now flips true the moment escrow is secured (both manual and reconciled paths); `GET land/:id/protection` exposes it with an explicit disclosure that this is an **internal MAYODE guarantee/priority-dispute-handling marker, not third-party underwritten crop insurance** (no insurer or claims pipeline exists in this system). Verified live: false before deposit, true immediately after.
- [x] Input Credit Lock + Harvest Buy-Back eligibility — shared `checkMlaxActivityEligibility` (active/completed lease as renter, not blacklisted) backs both `GET farmers/:id/input-credit-eligibility` and `GET farmers/:id/buy-back-eligibility`; `POST farmers/:id/input-credit` wires into the **real pre-existing `LoanRecord` model** (not a new mock), gated on eligibility. Buy-back is disclosed as an eligibility signal only — no Processing/Milling purchase pipeline exists in this system to guarantee an actual off-take against. Verified live: a zero-history farmer was correctly denied both credit and buy-back eligibility; an M-LAX-active farmer was approved and a genuine `LoanRecord` row was created and persisted.
- [x] Stability tracking + officer mismatch flagging — `GET mamcos/:id/stability` (% of a cooperative's farms actually on M-LAX + secretary's stability bonus); `POST farms/:id/flag-unreported-activity` reuses the **pre-existing DisputesService/module** (new `DisputeType.UNREPORTED_MLAX_ACTIVITY` enum value) rather than inventing a parallel flagging system — this is the honest in-system proxy for the doc's drone/satellite "Data Hub Gap" detection, since no imagery pipeline exists anywhere in this codebase. Verified live: stability returned 100%/2 correctly for the test MAMCOS, and a flag created a real `Dispute` row with the new type.
- [x] Agent-assisted 3-click listing flow — new mobile screen `agent-list-farm.tsx` (staff-only, gated to SUPER_ADMIN/ADMIN/MAMCOS_SECRETARY): step 1 look up farmer by control number, step 2 pick their verified/unlocked farm, step 3 price + submit — reuses the existing `createLandListing` endpoint, no new backend surface needed. While testing, caught and fixed a client-side filter bug shared by this screen and `land-listing-new.tsx`: both only checked `isVerified && !isLeased`, missing the Digital Lock (`leaseLockedUntil`) — the backend correctly rejected a locked farm regardless (verified), but the filter was fixed in both screens for a cleaner UX. Verified live end-to-end: farmer lookup → farm list → listing creation all succeeded through the exact API calls the screen makes.

### Final verification (whole "make it 100%" round)
- Backend: `npx tsc --noEmit` clean, `npm run build` clean, `npm run test` — 10/10 passing (no regressions).
- Mobile: `npx tsc --noEmit` clean (strict mode) across all new/edited files.
- Web: `npm run build` clean, all 25 routes generated successfully.

### Mobile UI wiring — closed
`land-listing/[id].tsx` now surfaces: a MAYODE Protected badge (reflects `mayodeProtected` live), a Make-an-Offer form + owner accept/reject/counter + farmer counter-accept/decline for DRAFT listings, and for ACTIVE multi-year leases a rent-schedule display + Pay Next Installment button + Renter's Right to Improve logging form. `mobile/src/lib/api.ts`/`local/repositories.ts` gained matching methods for all of it (offers, rent schedule, installments, improvements, protection status, input-credit/buy-back eligibility, MAMCOS stability, unreported-activity flagging). Verified live through the exact call shapes the new UI makes: submit offer → owner counters → farmer accepts counter (each step confirmed); protection flag false→true across a real deposit; a 3-year STEP_UP ANNUAL lease's rent schedule displayed correctly and paying year 2 correctly deducted a logged 200,000 improvement credit (1,650,000 → 1,450,000). `npx tsc --noEmit` clean on mobile throughout (caught and fixed one real type mismatch: local-mode `respondToOffer`/`respondToCounter` stubs had a narrower signature than the remote API, which would have silently broken `USE_LOCAL_DATA` mode — fixed to match).

### Web admin UI — closed
`web/src/lib/api.ts` gained the same methods added to mobile (offers, rent schedule/installments, protection status, input-credit/buy-back eligibility, MAMCOS stability, flag-unreported). `marketplace/page.tsx` gained: a "Protected" column on the land listings table; a "View offers" button (DRAFT listings) opening an Offers modal with accept/reject/counter (admin types the owner's Farmer ID to confirm, matching the existing sub-lease/transfer pattern); a "Rent schedule" button (multi-year ACTIVE listings) opening a schedule modal with a "Pay next installment" action; and a new "🧰 Farmer Tools" tab with two panels — Input Credit & Buy-Back Eligibility (check + issue real `LoanRecord` credit) and MAMCOS Stability (stat-card breakdown). Verified live through the exact call shapes the new UI makes: offer submitted → listed via `GET .../offers` with farmer details attached → accepted via admin token; input-credit and buy-back eligibility both returned `true` for an M-LAX-active farmer; a multi-year rent schedule displayed correctly with `paid` flags; MAMCOS stability returned the correct 100%/farm counts and the accumulating secretary bonus. `npx tsc --noEmit` clean, full `next build` clean (25/25 routes), backend test suite still 10/10 — no regressions anywhere.

### Scope now fully closed
Every previously-disclosed gap (mobile UI wiring, then web UI wiring) has been built and verified live. No known open items remain from the PDF audit.
- Cross-department automation (Processing Dept auto-notified of new supply, Instant Credit Check at fertilizer purchase, the System Workflow Diagram's soil-test-triggered Prescription chain) remains genuinely out of scope — no Processing/Milling/Sales module exists anywhere in this codebase to automate against. Building it would mean creating a new department, not completing M-LAX.

## Progress

- [x] Phase 0 — Schema & dependencies (migration `20260728122357_mlax_production` applied, `tsc --noEmit` clean; dev DB was reset with explicit user consent to resolve pre-existing migration drift)
- [x] Phase 1 — Real escrow collection (ClickPesa USSD push wired into `depositEscrow`, webhook + manual `escrow-reconcile` endpoint added, `MarketplaceModule` made `@Global()` mirroring `MembershipsModule`; verified via `tsc --noEmit`, `nest build`, and a live boot with no DI errors and all routes mapped)
- [x] Phase 2 — Real farmer-to-farmer payouts (`ClickPesaService` gained `previewMobilePayout`/`initiateMobilePayout`/`queryPayoutStatus`/`getAccountBalance`; `releaseEscrow` now disburses the owner's share automatically, `PayoutSchedulerService` polls processing payouts every 10 min. **Caveat:** exact ClickPesa payout endpoint paths are best-effort — confirmed the capability exists via docs.clickpesa.com but not the literal path strings; verify against the live API reference or ClickPesa support before enabling in production. Verified end-to-end via live curl smoke test against a real Postgres dev DB: create listing → deposit (manual fallback) → release → payout bookkeeping fallback (`payout_status=PENDING`, correct recipient) all confirmed in the database)
- [x] Phase 3 — SMS notifications (listing live, escrow deposited, lease active, payout success/failure, tractor booking confirmed/completed all wired via `SmsService.send()`; sub-lease/ownership-transfer SMS will be added inline in Phase 4 when those endpoints are built. Verified via live smoke test — `sms_logs` table confirmed all 5 lifecycle messages fired with correct phone numbers and content)
- [x] Phase 4 — Sub-leasing + ownership transfer (new `LandListingSubLease`/`LandListingOwnershipTransfer` models + `request/approve` sub-lease and `transfer-ownership` endpoints; `depositEscrow` allows a new deposit on an ACTIVE listing only when an approved open sub-lease exists; `releaseEscrow` routes the payout to the original renter minus MAYODE's 5% re-listing fee for sub-leases, and deducts the fixed 10,000/- transfer fee from the new owner's next payout after an ownership transfer. New-owner phone matching uses last-9-digits since phones aren't stored in one canonical format. Verified end-to-end via live smoke tests: sub-lease request→approve→new-renter-deposit→release correctly paid the *original* renter, not the owner or new renter; ownership transfer correctly moved `ownerId` and deducted the 10,000/- fee from the very next payout)
- [x] Phase 4b — Preferred renter code enforcement (`depositEscrow` now validates the depositing renter's `Farmer.controlNumber` against `LandListing.preferredRenterCode` when the owner locked a RELATIONSHIP-deal listing to a specific renter — closes the "Closed Circle" feature from the doc, which was previously a dead/unenforced field. Verified live: a mismatched control number was rejected with a clear error, the matching control number succeeded)
- [x] Phase 4c — Server-enforced commission rate (found during a "is everything actually wired, not just written" audit: `commissionRate` was a client-supplied number in `CreateLandListingDto`, meaning the STANDARD=10%/FLASH_DEAL=14%/RELATIONSHIP=5% model existed only as a convention followed by the mobile/web UIs, not enforced by the backend — a bug could've undercut MAYODE's fee entirely. Fixed: `createLandListing`/`updateLandListing` now derive `commissionRate` from `dealType` server-side via a `DEAL_TYPE_COMMISSION_RATE` map; the DTO field is now optional/deprecated and silently ignored. Verified live: a listing created with a malicious `commissionRate: 0.001` was locked to 10% regardless; a FLASH_DEAL created with no `commissionRate` at all correctly derived 14%. **Known remaining gap:** tractor booking's `commissionRate` is still fully client-supplied — the confirmed "final simplified model" decision only specified land-rental rates, not tractor-booking ones, so this wasn't touched; flag if tractor commission should also be locked server-side)
- [x] Phase 10b — Web admin parity gap, closed. Also fixed a second bug found in the process: `findAllLandListings`/`findOneLandListing` never included `escrowPayments`/`subLeases`, so the web admin's "Escrow" column had been silently showing `—` for every row since Phase 10, and pending sub-leases were invisible — fixed by adding both to the Prisma include (`subLeases` filtered to `PENDING`). Wired into the UI: "Review sub-lease" + "Transfer ownership" buttons on ACTIVE listing rows (open modals requiring the owner's Farmer ID, mirroring the admin-acts-on-behalf-of-owner pattern already used elsewhere), "Manage bookings" button per tractor card (modal listing bookings with confirm/complete/cancel), and a live suggested-price/market-gauge preview in the create-listing modal. Verified live, all four pieces, each through the exact request shape its web modal sends (admin token + typed IDs): (1) sub-lease — a fresh pending request correctly appeared in `GET /marketplace/land` and `approveSubLease` succeeded; (2) ownership transfer — `ownerId` was confirmed to actually move in the database after the call; (3) tractor booking management — confirm→complete and a separate cancel both transitioned status correctly, and `getMyTractors` returned the final statuses; (4) suggested-price preview — returned the correct grade-adjusted price and market gauge for a live `askingPrice`. **Process note:** the escrow/subLeases fix initially appeared to fail because I ran `tsc --noEmit` (which only type-checks) without rebuilding `dist/` before boot-testing — a reminder that a clean type-check is not proof a running server reflects the latest code.
- [x] Phase 5 — Dynamic pricing engine + flash-deal auto-drop + loyalty pricing (new `PricingService` computes rice-linked suggested price + grade multipliers (A≈1.14/B=1.0/C≈0.82, matching the doc's 2.5M/2.2M/1.8M example exactly) + market gauge; `GET .../land/farm/:farmId/suggested-price` preview endpoint; `FlashDealSchedulerService` steps unrented Flash Deal listings 20% of the way toward `autoDropPrice` daily; loyalty pricing auto-applies the RELATIONSHIP 5% flat deal when a renter returns to a farm they previously completed a lease on. **Caveat:** the emergency-season (Jan–May) −5% suggested-price adjustment is a clearly-labeled placeholder, not a number from the business doc — confirm with the user before relying on it. Verified via live tests: suggested price for Grade A + 100,000/-/sack rice computed to exactly 2,500,000 matching the doc's example; loyalty pricing correctly detected a returning renter and applied 5%/55,000 commission; flash-deal drop correctly computed 1,900,000 (20% of the gap) and fired the SMS)
- [x] Phase 6 — Digital lease agreement PDF + QR (new `LeaseDocumentService` using `pdfkit`+`qrcode`, auto-triggered on `releaseEscrow` success, saved via the existing `StorageService` upload pattern; `POST land/:id/agreement/regenerate` admin endpoint added. Verified via live test: a real single-page PDF was generated on lease release, saved to `uploads/`, and `LandListing.agreementPdfUrl/agreementGeneratedAt` persisted correctly)
- [x] Phase 7 — Verification fee + remaining CRUD (MAMCOS secretary earns 2,000/- `stabilityBonus` credit when a verified farm goes live on M-LAX; `facilitatedByStaffId` desk officer earns a 5,000/- agent fee; added `PATCH land/:id` (edit DRAFT terms), `PATCH land/:id/cancel`, `GET tractors/owners/:ownerId/tractors` ("my tractors"), `PATCH tractors/bookings/:id/cancel`. Verified via live tests: secretary/agent stabilityBonus credited exactly 2000/5000, update recomputed commission correctly, cancel set TERMINATED, my-tractors returned tractor+bookings, cancel-booking set CANCELLED)
- [x] Phase 8 — Mobile API layer (`mobile/src/lib/api.ts` `marketplaceApi` expanded to cover every backend endpoint from Phases 1-7; matching stubs added to `mobile/src/local/repositories.ts` + new local collections in `store.ts` (tractorOwners/tractorBookings/escrowPayments/subLeases/ownershipTransfers) so `USE_LOCAL_DATA` mode doesn't throw. Verified via `npx tsc --noEmit` — clean)
- [x] Phase 9 — Mobile screens (extracted `LandListingCard`/`TractorCard` components; new `land-listing-new.tsx` (farm picker + live suggested-price/market-gauge preview + flash-deal fields), `land-listing/[id].tsx` (detail + escrow deposit/release + agreement link + sub-lease/transfer entry points), `tractor-register.tsx`, `my-tractors.tsx`, `sub-lease-request.tsx`, `ownership-transfer.tsx`; ~60 new bilingual i18n keys added to both `en`/Swahili blocks (typo-checked for free since `t()` is typed as `keyof typeof en` and `tsc` passed). **Caveat:** verified via `npx tsc --noEmit` (clean, strict mode) only — this is a native Expo app, not click-testable in a browser; a simulator/device run is recommended before shipping to confirm the actual UX)
- [x] Phase 10 — Web admin CRUD + approval (`web/src/lib/api.ts` `marketplaceApi` expanded to match mobile's full method set; `marketplace/page.tsx` rewritten from read-only to full CRUD mirroring `memberships/page.tsx`'s exact pattern — create-listing/tractor-owner+tractor/market-price modals, per-row release-escrow/cancel-listing actions with row-scoped busy state, agreement link, escrow+payout status column, stat-card summary. `Sidebar.tsx` unchanged per confirmed decision (Admin/Super-Admin only). Verified via `npx tsc --noEmit` (clean) and `npx eslint` — the only lint findings (`no-explicit-any`, `set-state-in-effect`) are confirmed pre-existing in the unmodified `memberships/page.tsx` reference pattern itself, not a regression)

## Context

MAYODE wants to turn its cooperative-management system into a zero-asset-ownership
marketplace: "Uber for tractors" + "Airbnb for farmland", layered on top of AMCOS/MAMCOS
trust structures. This is based on a 21-page internal proposal (read in full) that evolved
in real time — later sections revise/override earlier ones on pricing and fees. The
backend already has most of the *data model* for this (`LandListing`, `TractorBooking`,
`EscrowPayment`, `Farm.grade`, `FarmVerification`, `MarketPrice`, etc.) but almost none of
the *business logic* the proposal describes, and the mobile/web apps only expose a
read-only sliver of it. The goal of this plan is to close every gap so M-LAX is a complete,
production-ready module — real payments in AND out, dynamic pricing, sub-leasing,
ownership transfer, trust/verification fees, and full mobile + web UI.

**Confirmed product decisions (from user, do not re-litigate):**
- Commission model: use the existing `DealType` enum to encode the doc's final numbers —
  `STANDARD` = 10% total (5% renter / 5% owner), `FLASH_DEAL` = 14% total, `RELATIONSHIP`
  = 5% flat. Plus fixed fees: 5,000/- agent fee (when a desk officer facilitates a listing),
  2,000/- verification fee (credited to the MAMCOS secretary/field officer who verified the
  farm). Sub-lease re-listing fee 5%, ownership-transfer fee fixed 10,000/-.
- Grade-based suggested pricing multipliers: A ≈ 1.14x, B = 1.0x (baseline), C ≈ 0.82x of
  the rice-sack-linked reference price.
- Payouts: build **real farmer-to-farmer disbursement** via ClickPesa's Payout API
  (confirmed to exist: mobile-money payout preview/create/query + balance check, same
  auth-token pattern as the existing collection API). This is a genuinely new capability —
  today `ClickPesaService` only collects money in; it must gain payout methods.
- Field Officer web access: no change — marketplace admin stays Admin/Super Admin only on
  web (`Sidebar.tsx` untouched).

## Backend

### Phase 0 — Schema & dependencies (blocks everything)
`backend/prisma/schema.prisma`:
- `EscrowPayment`: add `orderReference String? @unique` (collection), `phoneNumber String?`,
  `payoutOrderReference String? @unique`, `payoutStatus PayoutStatus?`, `payoutRecipientId`
  (Farmer relation) — split "money in" from "money out" tracking.
- `LandListing`: add `lastPriceDropAt DateTime?` (flash-deal cron dedup), `previousRenterId`
  relation (loyalty lookup), `agreementPdfUrl String?`, `agreementGeneratedAt DateTime?`,
  `facilitatedByStaffId String?` (agent-fee trigger).
- New model `LandListingSubLease`: originalListingId, originalRenterId, status (new enum
  `SubLeaseStatus {PENDING APPROVED REJECTED}`), newRenterId?, newAskingPrice?, timestamps.
- New model `LandListingOwnershipTransfer`: listingId, fromOwnerId, toOwnerPhone,
  toOwnerId? (nullable — mirrors `FarmLease.renterFarmerId` nullable-with-phone-fallback
  precedent), transferredAt, reason?.
- New enum `PayoutStatus {PENDING PROCESSING SUCCESS FAILED}`.
- Run `npx prisma migrate dev --name mlax-production` (first real execution step).

`backend/package.json`: add `pdfkit`, `qrcode`, `@types/pdfkit`, `@types/qrcode` (confirmed
absent).

### Phase 1 — Real escrow collection (already-existing pattern, just apply it)
Mirror `memberships.service.ts` / `payments.controller.ts` exactly:
- `backend/src/marketplace/marketplace.service.ts`: `depositEscrow()` generates an
  `orderReference`, creates `EscrowPayment{status: PENDING}`, calls
  `clickPesa.initiateUssdPush(...)` when configured (else falls back to today's manual
  `mpesaRef` path, matching the memberships dev fallback). New `reconcileEscrowPayment()`
  called from the webhook — calls `queryPayment`, flips to `IN_ESCROW`, sets
  `LandListing.leaseStatus = PENDING_VERIFICATION`.
- `backend/src/payments/payments.controller.ts`: the webhook currently hard-calls only
  `MembershipsService.reconcilePayment`. Add a second attempt at
  `MarketplaceService.reconcileEscrowPayment`, each in its own try/catch keyed by whichever
  table has that `orderReference` — never let one failure block the other. Inject
  `MarketplaceService` alongside the existing `MembershipsService` (both already
  module-exported; wire via `AppModule`, avoid a circular import between
  `MarketplaceModule` ↔ `PaymentsModule`).
- Add `POST /marketplace/land/:id/escrow-reconcile` admin-triggered manual fallback
  (mirrors `POST /memberships/:id/reconcile`).

### Phase 2 — Real farmer-to-farmer payouts (net-new capability)
`backend/src/payments/clickpesa.service.ts`: add `previewMobilePayout()`,
`initiateMobilePayout({amount, orderReference, phoneNumber, recipientName})`,
`queryPayoutStatus(orderReference)`, `getAccountBalance()` — same auth-token/checksum
pattern as the existing collection methods. **Exact endpoint paths must be confirmed
against `docs.clickpesa.com/api-reference` at implementation time** (confirmed to exist —
mobile money payout preview/create/query + balance — but exact path strings weren't in the
fetched doc excerpt); may need a payout-scoped API credential enabled on the ClickPesa
account, not just the existing collection keys.
- `marketplace.service.ts`'s `releaseEscrow()`: after marking escrow `RELEASED`, call
  `initiateMobilePayout` to pay the owner their 95% share (MAYODE keeps its commission +
  fixed fees automatically since the full amount was already collected into MAYODE's
  ClickPesa balance at deposit time). Store `payoutOrderReference`, set
  `payoutStatus=PROCESSING`.
- New `backend/src/marketplace/payout-scheduler.service.ts` (`@Cron`, mirror
  `MembershipSchedulerService`): poll `queryPayoutStatus` for any `EscrowPayment` with
  `payoutStatus=PROCESSING`, update to `SUCCESS`/`FAILED`, SMS the recipient, and on
  `FAILED` flag for admin retry (never silently drop a failed payout).
- Sub-lease approval and ownership-transfer completion (Phase 4) reuse this same payout
  path for their respective settlement splits.

### Phase 3 — SMS notifications
`marketplace.service.ts`: inject `SmsService`, fire on: listing created/live, escrow
deposited (pending verification), escrow released (lease active) + payout success/failure,
tractor booking confirmed/completed, sub-lease approved, ownership transfer completed. Match
the existing `sms.send(phone, message, type)` call shape used in `farm-leases.service.ts`.

### Phase 4 — Sub-leasing + ownership transfer
New DTOs + service methods + controller routes:
- `POST land/:id/sub-lease/request` (renter-only, listing must be `ACTIVE`) → creates
  `LandListingSubLease PENDING`.
- `PATCH land/:id/sub-lease/:subLeaseId/approve` (original owner only) → on approve, new
  renter deposits escrow as normal (Phase 1 flow), and on release the payout splits 95% to
  the *original* renter, 5% to MAYODE (the re-listing fee) — implemented as two
  `initiateMobilePayout` calls (or one payout + fee retained, whichever the Phase 2 payout
  API supports for split settlement; if it doesn't support splits, do two sequential
  payouts from MAYODE's balance).
- `POST land/:id/transfer-ownership` (current owner only) → creates
  `LandListingOwnershipTransfer`, resolves `toOwnerId` by phone if that Farmer already
  exists (else leaves null, matching `FarmLease`'s nullable-renter precedent — future
  escrow payouts for this listing route to `toOwnerPhone` directly via payout API even
  before/without a full Farmer record), updates `LandListing.ownerId` once resolved,
  10,000/- fixed transfer fee deducted from the next payout.

### Phase 5 — Dynamic pricing engine + flash-deal auto-drop + loyalty pricing
New `backend/src/marketplace/pricing.service.ts`:
- `computeSuggestedPrice(farmId)`: latest `MarketPrice` for `rice_sack_100kg` → reference
  price (doc's stated formula: rice=100,000/- → reference 2.2M) → apply grade multiplier
  (A=1.14, B=1.0, C=0.82) → apply season multiplier (Jan–May "emergency season" per doc vs
  Jun–Dec standard) → return `{suggestedPrice, marketGauge, comparableCount}` (gauge = red
  if askingPrice notably above comparable recent listings in same region+grade, green if
  at/below).
- `GET /marketplace/land/:farmId/suggested-price` new public endpoint for the mobile
  create-form to preview live.
- `createLandListing()` calls this to populate `suggestedPrice` server-side (currently
  unused schema field with no computation).
- New `backend/src/marketplace/flash-deal-scheduler.service.ts` (`@Cron` daily): for
  `isFlashDeal` listings past `autoDropDays` unrented since `lastPriceDropAt`/`createdAt`,
  step `askingPrice` down toward `autoDropPrice`, update `lastPriceDropAt`, SMS the owner.
- Loyalty pricing: in `depositEscrow`, if `renterId === LandListing.previousRenterId` for
  that farm, set `dealType = RELATIONSHIP` (5% flat) before computing `commissionAmount`.

### Phase 6 — Digital lease agreement PDF + QR
New `backend/src/marketplace/lease-document.service.ts`: on `releaseEscrow` success,
generate a PDF (`pdfkit`) with listing/party/date/price terms plus a QR code (`qrcode`)
encoding a verification URL, save via the existing upload/storage pattern, set
`LandListing.agreementPdfUrl/agreementGeneratedAt`. Add `GET land/:id/agreement`
(admin-only regenerate/refetch).

### Phase 7 — Verification fee + remaining CRUD
- `marketplace.service.ts` `createLandListing()`: once `farm.isVerified` check passes,
  look up the most recent `FarmVerification.fieldOfficerId` for that farm and credit
  `MamcosStaff.stabilityBonus += 2000`, write an audit-log style note.
- `facilitatedByStaffId` present on create → credit that staff a flat 5,000 agent fee the
  same way.
- Add `updateLandListing`, `cancelLandListing` (DRAFT/no-active-escrow only),
  `findTractorsByOwner`, `cancelTractorBooking` (PENDING only) — matching routes on the
  controller, DTOs following the `PartialType` pattern used elsewhere.

### Backend verification
- `cd backend && npm run test` / `npm run test:e2e` after each phase.
- New `backend/src/marketplace/marketplace.service.spec.ts` covering escrow
  deposit→reconcile→release→payout happy path (mock `ClickPesaService`/`SmsService`, style
  from `backend/src/payments/clickpesa.service.spec.ts`), pricing multiplier math,
  flash-deal drop logic, sub-lease/transfer flows.
- Since ClickPesa payout credentials likely aren't configured in dev, explicitly verify the
  `isConfigured()` fallback (bookkeeping-only path) still works end to end.

## Mobile (`mobile/`)

### Phase 8 — API layer (must precede any new screens)
`mobile/src/lib/api.ts` (~line 409): expand `marketplaceApi` with one method per new/exposed
backend route — create/update/cancel land listing, get listing by id, deposit/reconcile
escrow, get suggested price, tractor-owner + tractor create, my-tractors, confirm/complete/
cancel tractor booking, sub-lease request/approve, transfer ownership, get agreement.
`mobile/src/local/repositories.ts` (~line 628): matching stub for every new method so
`USE_LOCAL_DATA` mode doesn't throw.

### Phase 9 — Screens
- Decompose `mobile/app/(tabs)/marketplace.tsx` into `mobile/src/components/marketplace/
  LandListingCard.tsx` and `TractorCard.tsx`; wire real navigation to detail screens;
  remove hardcoded booking placeholder values.
- New `mobile/app/land-listing-new.tsx` — reuse `farm-register.tsx`'s Section/Field/
  SearchableSelect for farm selection, branch into `boundary.tsx`'s GPS flow (add a third
  `landListingId` branch alongside its existing `plotId`/`id` branching) when the farm has
  no boundary yet; live market-gauge preview via `getSuggestedPrice`.
- New `mobile/app/land-listing/[id].tsx` — detail + escrow deposit/release + agreement PDF
  link + entry points to sub-lease/transfer screens.
- New `mobile/app/tractor-register.tsx` (net-new, no existing pattern — model on
  `leases.tsx` + `revenue-new.tsx`) and `mobile/app/my-tractors.tsx`.
- New `mobile/app/sub-lease-request.tsx` and `mobile/app/ownership-transfer.tsx` (reuse
  `lease-new.tsx`'s form/submit scaffold).
- `mobile/src/i18n.ts`: matching key sets in both `en` and Swahili blocks for every new
  string (prefix `mlax*`).
- `mobile/app/_layout.tsx`: register `Stack.Screen` entries for every new route (standard
  green header block, matching the `leases`/`lease-new` entries).

## Web (`web/`)

### Phase 10 — Admin CRUD + approval
- `web/src/lib/api.ts` (~line 107): expand `marketplaceApi` to match mobile's full method
  set (wire the already-defined-but-unused `createLandListing`/`bookTractor`, add the rest).
- `web/src/app/dashboard/marketplace/page.tsx`: rewrite from read-only to full CRUD,
  mirroring `memberships/page.tsx`'s exact pattern (`load()` re-called after mutations,
  `showForm/form/submitting/error` state, generic `set(k,v)`, `Modal` component, per-row
  `approving` state, stat-card summary row). New in-file modals: `EscrowActionModal`,
  `TractorOwnerFormModal`, `MarketPriceFormModal`, `SubLeaseReviewModal`,
  `OwnershipTransferModal` (matching `leases/page.tsx`'s in-file modal convention).
- Escrow disputes route to the existing `disputesApi` / `dashboard/disputes/page.tsx`
  rather than rebuilding — pre-fill `DisputeType.OWNERSHIP_TRANSFER_DISPUTE` (already
  exists in the schema) where relevant.
- `Sidebar.tsx`: no change (confirmed Admin/Super-Admin-only).

## Ordering
Phase 0 → 1 → 2 → 3 (parallel with 2) → 4 → 5 → 6 → 7, then 8 → 9 (mobile), 10 (web, can
start once Phase 8's backend contracts are stable — functionally independent of mobile
screens).

## Verification (end-to-end)
1. Backend: `npm run test`, `npm run test:e2e`, manual `curl`/Postman through the full
   deposit → webhook-reconcile → release → payout-poll cycle with ClickPesa unconfigured
   (fallback path) since sandbox payout credentials aren't available yet.
2. Mobile: `npx expo start` in `mobile/`, click through create-listing → GPS boundary →
   suggested-price preview → escrow deposit → (as admin) release → agreement link; verify
   `USE_LOCAL_DATA=true` mode doesn't throw on any new call.
3. Web: `npm run dev` in `web/`, click through create/edit/cancel listing, tractor owner
   registration, market price entry, escrow release, dispute hand-off; `npm run lint`.
