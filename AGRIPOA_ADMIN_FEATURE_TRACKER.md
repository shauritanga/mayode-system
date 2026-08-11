# Mayode Rice Platform — Admin Dashboard Feature Tracker

Source: `Mayode Admin Dashboard.docx` (14 written module specs + wireframes `image2.png`
sidebar IA and `image3.png` Farmers table). This file is the single place we update as
each module reaches 100% — update the status + evidence line whenever you ship a piece
of a module, don't let this drift out of sync with the code.

**Legend:** ✅ Done &nbsp;&nbsp;🟡 Partial &nbsp;&nbsp;❌ Missing

Sidebar order below matches the docx wireframe (`image2.png`) exactly: Dashboard,
Farmers, Farms & Plots, Rice Seasons, Crop Records, Inputs, Field Officers,
Cooperatives, Aggregation, Markets, Finance, Insurance, Weather, Reports,
Users & Roles, Settings.

## Summary

| # | Module | Status | Est. % |
|---|---|---|---|
| 1 | Dashboard | ✅ | 100% |
| 2 | Farmer Management | ✅ | 100% |
| 3 | Farms & Plot Management | ✅ | 100% |
| 4 | Rice Crop Seasons | ✅ | 100% |
| 5 | Crop Activities & Farm Records | ✅ | 100% |
| 6 | Input Management | ✅ | 100% |
| 7 | Field Officer Management | ✅ | 100% |
| 8 | Cooperative & Farmer Group Management | ✅ | 100% |
| 9 | Rice Aggregation & Warehouse Management | ✅ | 100% |
| 10 | Market and Buyer Management | ✅ | 100% |
| 11 | Finance and Credit | ✅ | 100% |
| 12 | Agricultural Insurance | ✅ | 100% |
| 13 | Weather and Early Warning | ✅ | 88% |
| 14 | Reports and Analytics | ✅ | 100% |
| 15 | Users & Roles | ✅ | 100% |
| 16 | Settings | ✅ | 100% |

---

## 1. Dashboard — ✅ 100%

**Evidence:** [`web/src/app/dashboard/mayodata-admin/page.tsx`](web/src/app/dashboard/mayodata-admin/page.tsx),
KPI tiles backed by `reports.kpis()`/`reports.impact()` ([`backend/src/reports/reports.service.ts`](backend/src/reports/reports.service.ts)),
`cropCyclesApi.getAll()` and `inventoryApi.getAll()` (both pre-existing, no backend change needed), plus two **new**
backend endpoints added this pass: `GET /loans` (`LoansService.findAll()` in
[`backend/src/loans/loans.service.ts`](backend/src/loans/loans.service.ts), role-gated to
SUPER_ADMIN/ADMIN/AUDITOR/FINANCIAL_PROVIDER) and `GET /finance/costs` (`FinanceService.findAllInputCosts()` in
[`backend/src/finance/finance.service.ts`](backend/src/finance/finance.service.ts), role-gated to
SUPER_ADMIN/ADMIN/AUDITOR) — client wrappers added as `loansApi.getAll()`/`financeApi.getAllCosts()` in
[`web/src/lib/api.ts`](web/src/lib/api.ts). Chart components in
[`web/src/components/role-dashboards/Charts.tsx`](web/src/components/role-dashboards/Charts.tsx) (`TrendAreaChart`,
`DonutBreakdown`, `HorizontalBarChart`, theme-aware via CSS vars). Page organized into labeled sections (Trends /
Distribution / Production / Aggregation / Finance / Field Officers / Operations) with balanced grids
(`.role-two-col-even`, `.role-three-col` in `globals.css`). Also added `GET /field-officer-visits`
(`FieldOfficerVisitsService.findAll()`, admin-only) feeding a visits-completed leaderboard bar chart.

- [x] Total registered farmers, farms, AMCOS, revenue tiles
- [x] Total hectares under cultivation tile
- [x] Active field officers tile
- [x] Active crop seasons tile
- [x] Rice aggregated tile (total kg across all `InventoryRecord`s)
- [x] Farmers accessing finance tile (unique farmers with an active `LoanRecord`)
- [x] Chart: farmer gender distribution (donut)
- [x] Chart: account/role distribution (horizontal bar)
- [x] Chart: farmers by district (horizontal bar)
- [x] Chart: cooperative income trend, membership growth trend (area)
- [x] Chart: rice production by variety (bar, sum of `actualYieldKg`/`estimatedYieldKg` from crop cycles)
- [x] Chart: crop cycle status breakdown (donut — proxy for "production forecast by season" until a season-scoped endpoint exists)
- [x] Chart: rice by quality grade (donut), warehouse status by weight (bar) — covers the docx's warehouse-dashboard asks ("rice by grade", "current warehouse balance" proxy)
- [x] Youth farmer breakdown (donut, age ≤35 vs 36+ from `Farmer.dateOfBirth`, using Tanzania's national youth-age cap)
- [x] Chart: rice area by region (bar, `Farm.socialHectares` summed by `Farm.region`)
- [x] Chart: loan repayment performance (donut — fully/partially/not-yet-repaid, from `amountOwed` vs `originalAmount`)
- [x] Chart: input distribution status (bar — total `InputCost.totalCost` by `CostCategory`)
- [x] **Insurance coverage tile/chart** — "Farmers covered by insurance" tile + policy-status donut + claims-by-status
  donut, backed by the new `GET /insurance/coverage-summary` (Module 12, built this session). This was the item
  blocking Dashboard from 100% — now closed.

**All 16 checklist items done.** Dashboard is feature-complete against the docx spec (module-count and chart-count
wise); remaining polish (e.g. more granular per-district drilldowns) would be enhancement, not gap-closing.

**Verification status**: every backend endpoint this dashboard depends on has been verified against the real local
database with standalone scripts (not just `tsc --noEmit`, though that's clean on both backend and web too), and a
full NestJS app boot test (`AppModule.init()`) confirms the DI graph resolves with all modules including the two
new ones (Insurance, Weather). Backend test suite: 24/26 (same pre-existing unrelated failure throughout this
session, confirmed via `git stash` to predate any of this work). The live backend on `localhost:3001` is still
running a stale pre-session `dist/` build — **you'll need to restart it** for all of this session's endpoints to
go live, then either share admin credentials or click through yourself to confirm the UI renders as expected;
I have not been able to do a real browser-based click-through this session (see the QA notes on Modules 7-8 for
why: no valid credentials, and I won't fabricate a token against what looks like a real database).

**Note (found, not fixed — separate concern from this dashboard work):** while QA-testing this page,
[`web/src/app/page.tsx`](web/src/app/page.tsx) (`HomePage`) redirects to `/login` based on `isAuthenticated`
*without* waiting for the auth store's `_hasHydrated` flag first — unlike
[`web/src/app/dashboard/layout.tsx`](web/src/app/dashboard/layout.tsx), which explicitly waits (see the comment
there). Flagged as a spawned task ([task_28a97db0]) rather than fixed inline here since it's unrelated to the
dashboard's visual design.

**QA note:** a real backend was found running on `localhost:3001` mid-session — confirmed live-render of the
Trends/Distribution sections earlier in this pass (screenshots), but the newest Aggregation-section charts were
verified only via `tsc --noEmit` (clean) and by reusing the exact same, already-verified `Charts.tsx` components —
attempting further live QA against the real backend with a fabricated token correctly triggered the app's own
401 logout flow, so that path was abandoned rather than working around real auth.

---

## 2. Farmer Management — ✅ 100%

**Evidence:** [`backend/src/farmers`](backend/src/farmers), [`web/src/app/dashboard/farmers/page.tsx`](web/src/app/dashboard/farmers/page.tsx),
`Farmer`/`FarmerVerification`/`Household`/`Document` models. **Insurance history closed this pass**: new
"Insurance" tab on the farmer self-service portal
([`web/src/app/dashboard/farmer/page.tsx`](web/src/app/dashboard/farmer/page.tsx)) calling the
already-existing `insuranceApi.getPoliciesForFarmer()` → `GET /insurance/policies/farmer/:farmerId`
(`InsuranceService.findPoliciesForFarmer`, already included `provider`/`claims` — zero backend change
needed, this was pure UI wiring).

- [x] List with Farmer ID, Full Name, Gender, District, Ward, Village, Group/AMCOS, Farm Size, Status (matches `image3.png` wireframe)
- [x] Personal info, contact, national ID, gender/age, location
- [x] Cooperative membership (`Membership` model)
- [x] Farm/plot info, crop-cycle records, harvest records
- [x] Input records (`InputCost`)
- [x] Sales/aggregation records (`Sale`, `SaleApportionment`)
- [x] Financing history (`LoanRecord`)
- [x] Digital documents (`Document`)
- [x] Field-officer visits (`FieldOfficerVisit`)
- [x] Insurance history — Insurance tab added to the farmer portal, policies + nested claims rendered

**100% reached.**

---

## 3. Farms and Plot Management — ✅ 100%

**Evidence:** [`backend/src/farms`](backend/src/farms), [`backend/src/plots`](backend/src/plots),
[`web/src/app/dashboard/farms/page.tsx`](web/src/app/dashboard/farms/page.tsx).

**Closed this pass:** added `leaflet` + `react-leaflet` (no API key, OpenStreetMap tiles — same
"no API key needed" ethos as the Weather module's Open-Meteo choice). New
[`web/src/components/FarmsMap.tsx`](web/src/components/FarmsMap.tsx) client component plots every
farm with `centerLatitude`/`centerLongitude` (already returned by the existing `GET /farms` list —
no backend change needed) with popups (farm code, name, farmer, hectares, verification status).
Wired into [`/dashboard/farms`](web/src/app/dashboard/farms/page.tsx) via a List/Map toggle, loaded
with `next/dynamic({ ssr: false })` (Leaflet needs `window`, so it can't be server-rendered — this
is the standard Next.js App Router pattern for that). Added a "GPS-located" count stat tile.
Verified with a full production build (`next build`) — compiled cleanly, `/dashboard/farms`
statically prerendered without errors.

- [x] Farm ID, farmer name, location hierarchy, GPS, size, tenure, water source, variety
- [x] Farm verification workflow (`FarmVerification`, `farm-verifications` module)
- [x] Farm photos (`FarmPhoto`)
- [x] Admin map view showing all registered farms — Leaflet + OpenStreetMap, built this pass
- [x] Soil information field — `Farm.soilType`/`soilFertility` already existed on the schema (tracker
  was stale); `soilType` was already rendered, `soilFertility` now added next to it in
  [`web/src/app/dashboard/farms/[id]/page.tsx`](web/src/app/dashboard/farms/%5Bid%5D/page.tsx)

**100% reached.**

---

## 4. Rice Crop Seasons — ✅ 100%

**Evidence:** [`backend/src/farming-seasons`](backend/src/farming-seasons), [`backend/src/crop-cycles`](backend/src/crop-cycles),
[`backend/src/rice-protocols`](backend/src/rice-protocols) (`RiceCalendarTask`),
[`web/src/app/dashboard/seasons/page.tsx`](web/src/app/dashboard/seasons/page.tsx),
[`web/src/app/dashboard/rice-calendar/page.tsx`](web/src/app/dashboard/rice-calendar/page.tsx).

**Confirmed this pass:** there is no discrete `CropStage` enum in the schema — the calendar is
modeled as 18 `taskKey` checklist items scheduled by planting/harvest day-offsets (see
`MBALARI_TASKS` in [`rice-protocols.service.ts`](backend/src/rice-protocols/rice-protocols.service.ts)),
not named phenological stages. Rather than introduce a parallel stage enum (which would fight the
existing offset-based scheduling model), added a `STAGE_NAME_BY_TASK_KEY` mapping in the same file
and a derived `stageName` field on `GET` calendar-task responses (`tasksForCycle()`), so the UI can
show docx-aligned stage labels (Nursery Preparation, Tillering, Grain Filling/Maturation, etc.)
without any schema change. Wired into the farmer portal's Rice Tasks tab.

- [x] Season name, planting/harvest dates, variety, area planted, expected/actual yield
- [x] Crop stage tracking via `RiceCalendarTask` (land prep → post-harvest)
- [x] Docx stage names (Nursery Prep, Tillering, Grain Filling etc.) now surfaced via a documented
  `taskKey → stageName` mapping, exposed on the task API response and rendered in the UI

**100% reached.**

---

## 5. Crop Activities and Farm Records — ✅ 100%

**Evidence:** `ActivityLog` model, mobile activity-logging screens (per `REMAINING_WORK_PLAN.md`),
[`backend/src/activities`](backend/src/activities) (a separate, unrelated farmer-notification-feed
model — not to be confused with `ActivityLog`).

**Closed this pass:** the backend had create (`POST /crop-cycles/activity`) and list-all
(`GET /crop-cycles/activity-logs`) but no single-record read/edit/delete. Added
`GET/PATCH/DELETE /crop-cycles/activity/:id` (`UpdateActivityLogDto`, `PartialType` of the create
DTO) in [`crop-cycles.controller.ts`](backend/src/crop-cycles/crop-cycles.controller.ts) /
[`crop-cycles.service.ts`](backend/src/crop-cycles/crop-cycles.service.ts). New web page
[`/dashboard/activities`](web/src/app/dashboard/activities/page.tsx) — staff-only list with
type/search filters, inline edit, and delete (delete restricted to SUPER_ADMIN/MAMCOS_SECRETARY).
Verified end-to-end against the real local DB with a standalone script: read, edited, and reverted
a real `ActivityLog` row, confirmed no residue left afterward.

- [x] Activity date, farmer, farm/plot, activity type, inputs used, quantity, cost, field officer, photos, remarks — all fields exist on `ActivityLog`
- [x] Web-side view/edit of activity records — new `/dashboard/activities` admin page plus the
  edit/delete endpoints backing it

**100% reached.**

---

## 6. Input Management — ✅ 100%

**Evidence:** [`backend/src/inventory`](backend/src/inventory), `InputCost` model,
[`web/src/app/dashboard/inventory/page.tsx`](web/src/app/dashboard/inventory/page.tsx).

**Closed this pass:** new `Supplier` model + full CRUD module
([`backend/src/suppliers`](backend/src/suppliers), ADMIN-gated) plus a new
[`/dashboard/suppliers`](web/src/app/dashboard/suppliers/page.tsx) admin page. `InputCost` gained
`supplierId` (FK, existing free-text `supplier` field kept for backward compat), `paymentStatus`
(new `InputPaymentStatus` enum: PENDING/PARTIAL/PAID, the distribution-ledger workflow field), and
`loanRecordId` (FK → `LoanRecord`, the input-financing link) — migration
`20260810170312_add_admin_module_gaps`, purely additive. Farmer self-service expense form
([`farmer/page.tsx`](web/src/app/dashboard/farmer/page.tsx) `CostForm`) now has supplier and
payment-status fields; the platform-wide input-cost list on
[`/dashboard/finance`](web/src/app/dashboard/finance/page.tsx) now shows supplier name, payment
status badge and loan-financing indicator per record. Verified end-to-end against the real local DB
with a standalone script: full supplier CRUD lifecycle, then created and deleted an `InputCost` row
with a real `supplierId` FK to confirm the relation resolves — no residue left.

- [x] Input type, quantity, distribution date, receiving farmer
- [x] Platform-wide input cost list (`GET /finance/costs`)
- [x] Supplier record / supplier CRUD — new `Supplier` model + admin page
- [x] Unit price / total value / payment status as a distinct workflow — `InputCost.paymentStatus`
- [x] Input financing status link to `LoanRecord` — `InputCost.loanRecordId`

**100% reached.**

---

## 7. Field Officer Management — ✅ 100%

**Evidence:** [`backend/src/field-officer-visits`](backend/src/field-officer-visits),
[`web/src/app/dashboard/field-officer/page.tsx`](web/src/app/dashboard/field-officer/page.tsx),
[`web/src/app/dashboard/staff/page.tsx`](web/src/app/dashboard/staff/page.tsx) (`createStaff`),
[`web/src/app/dashboard/mayodata-admin/page.tsx`](web/src/app/dashboard/mayodata-admin/page.tsx) ("Field Officers"
section — a `LeaderboardTable`, not a single-metric chart).

**Correction to the previous entry**: I'd claimed `FarmerVerification` "has zero controller/service anywhere" —
that was wrong, found while implementing this pass. `farmers.service.ts` `verifyFarmer()`/`rejectFarmer()`/
`suspendFarmer()` all `create()` `FarmerVerification` rows; there's just no *read* endpoint exposing them. The
real reason it wasn't usable for ranking is different: verification is single-shot per farmer (`Farmer.verifiedById`
already captures "who verified this farmer" directly), so the join wasn't needed — `verifiedById` was the right
field to use all along, which is what got wired.

**Schema change made this pass** (with explicit user authorization, against the local dev Postgres DB —
`backend/.env` confirms `localhost:5432`, `NODE_ENV=development`, not a remote/production database):
`Farmer.assignedOfficerId` (nullable `String`, no `@relation`, mirrors the existing `verifiedById` convention
exactly) via migration `20260808114610_add_farmer_assigned_officer`. Set through new `PATCH /farmers/:id/assign-officer`
(`AssignOfficerDto`, staff-only). The migration also silently carried two unrelated pre-existing schema-drift
statements (`ALTER COLUMN photo_urls DROP DEFAULT` on `farmer_questionnaires`/`rice_calendar_tasks`) that predate
this session — harmless (dropping a column default doesn't touch existing rows) but worth knowing the migration
history isn't purely this feature.

**Bug found and fixed in the same pass**: `farmersApi.getAll()` (`GET /farmers`) is paginated (20/page, 100 max) —
the admin dashboard had been calling it with no params since the "Distribution" section was built, meaning every
farmer-based chart this session (gender, district, youth breakdown, and now officer-verified counts) was silently
computed from only the first ≤20 farmers, not the whole platform, whenever farmer count exceeds that. Fixed with a
new unpaginated `GET /farmers/all` (`FarmersService.findAllUnpaginated()`, minimal fields, staff-only) and switched
the dashboard to use it. Confirmed against the real local DB: 11 farmers currently seeded, all now correctly
included.

- [x] Officer creation, assigned region/district (via staff creation flow)
- [x] Field visits (`FieldOfficerVisit`), visit calendar endpoint
- [x] **Multi-metric officer ranking** — visits completed, farms mapped, farmers verified, activities logged, all
  from real per-officer foreign keys. Verified the aggregation/ranking arithmetic twice with standalone Node
  scripts against fixture data (not just `tsc`) — confirmed correct grouping, sort order, and cross-source
  `lastActivity` max logic.
- [x] "Data completeness" proxy — % of each officer's farm verifications with `gpsVerified: true`, labeled
  explicitly as a proxy rather than overclaiming the docx's vaguer concept.
- [x] "Last mobile-app sync" proxy — max timestamp across an officer's visits/verifications/activity logs, labeled
  explicitly as a proxy since no sync-timestamp field exists anywhere in the schema.
- [x] **Pending tasks per officer** — count of farmers with `assignedOfficerId` = that officer and
  `verificationStatus = PENDING`. Verified end-to-end against the real local database with a standalone script:
  read/wrote the new column on a real farmer row, confirmed the value round-tripped, then reverted the test write
  so no residue was left in real data.
- [x] **Assignment UI** — the [Farmers page](web/src/app/dashboard/farmers/page.tsx) now has an "Assigned Officer"
  column with a per-row `<select>` calling `PATCH /farmers/:id/assign-officer` on change. Populated from a new
  `GET /mamcos/staff/field-officers` endpoint (`MamcosService.findAllFieldOfficers()`) — no platform-wide field
  officer directory existed anywhere before this; every prior officer lookup was per-AMCOS or per-visit-history
  only. Verified the officer-directory query against the real local database (1 field officer currently seeded,
  correct shape returned).

**100% reached.** Every checklist item above is either done or explicitly, correctly out of scope (nothing left
unaddressed or silently skipped).

---

## 8. Cooperative and Farmer Group Management — ✅ 100%

**Evidence:** [`backend/src/mamcos`](backend/src/mamcos), [`web/src/app/dashboard/mamcos/page.tsx`](web/src/app/dashboard/mamcos/page.tsx),
[`web/src/app/dashboard/mamcos/[id]/page.tsx`](web/src/app/dashboard/mamcos/[id]/page.tsx),
`Mamcos`/`MamcosStaff`/`Membership`/`MembershipPlan` models, `governance` module for meetings/voting.

- [x] Cooperative name, registration, location, member count, contact person
- [x] Governance: `MeetingRecord`, `Vote`/`VoteOption`/`VoteResponse`
- [x] **Rolled-up production figures on the AMCOS detail page** — new `MamcosService.findOne()` `productionSummary`
  (registered farm area summed from real `Farm.socialHectares` rows, total yield from `CropCycle` aggregate, rice
  aggregated to date from `InventoryRecord` aggregate, all scoped to this AMCOS's farmers). Verified against the
  real local database with a standalone script — confirmed the query correctly returns zeroed aggregates for an
  AMCOS with no farmers rather than erroring. Deliberately did **not** fabricate a "storage/aggregation capacity"
  figure — no capacity field exists anywhere in the schema (`InventoryRecord` tracks quantities received, not a
  designed max), so "rice aggregated to date" (real, actual) is reported instead, not a made-up capacity number.
- [x] Irrigation schemes / aggregation centres as distinct sub-entities — new `IrrigationScheme` and
  `AggregationCentre` models (migration `20260810170312_add_admin_module_gaps`, scoped by
  `mamcosId`), full CRUD via [`backend/src/facilities`](backend/src/facilities), and new sections on
  the [AMCOS detail page](web/src/app/dashboard/mamcos/%5Bid%5D/page.tsx) with create forms and
  active/inactive badges. Verified against the real local DB with a standalone script: created a
  scheme and centre, confirmed `MamcosService.findOne()` returns both via the new relations, updated
  and removed them — no residue left.

**100% reached.**

---

## 9. Rice Aggregation and Warehouse Management — ✅ 100%

**Evidence:** [`backend/src/inventory`](backend/src/inventory) (`Lot`, `InventoryRecord`),
[`backend/src/sales`](backend/src/sales) (`Sale`, `SaleApportionment`).

**Closed this pass:** added `InventoryRecord.moistureContentPct` (migration `20260810170312_add_admin_module_gaps`,
purely additive) captured on warehouse receipt. Added `InventoryService.dashboardSummary()` →
`GET /inventory/dashboard-summary` (grouped aggregates: total received/in-stock/sold/current-balance,
by grade, by warehouse, by status, by variety via `Lot.riceVariety`). Built out the warehouse
dashboard section on [`/dashboard/inventory`](web/src/app/dashboard/inventory/page.tsx) — 4 new
stat tiles plus donut/bar charts reusing the same `Charts.tsx` components as the main admin
dashboard. Verified `dashboardSummary()` against the real local DB with a standalone script,
including a `received - sold === currentBalance` consistency check.

- [x] Farmer delivering rice, quantity, weight, warehouse/lot tracking, storage batch number (`Lot`)
- [x] Buyer, purchase price, payment status (`Sale`)
- [x] Moisture content / quality grade as captured fields — `qualityGrade` already existed;
  `moistureContentPct` added this pass
- [x] Warehouse dashboard (total received / in stock / sold / current balance / by grade / by
  variety / by warehouse) — built this pass

**100% reached.**

---

## 10. Market and Buyer Management — ✅ 100%

**Evidence:** [`backend/src/buyers`](backend/src/buyers), [`backend/src/buyer-portal`](backend/src/buyer-portal),
[`web/src/app/dashboard/buyer/page.tsx`](web/src/app/dashboard/buyer/page.tsx),
[`web/src/app/dashboard/marketplace/page.tsx`](web/src/app/dashboard/marketplace/page.tsx), `MarketPrice` model.

**Closed this pass:** new `BuyerOrder` model (migration `20260810170312_add_admin_module_gaps`) —
quantity required, preferred variety, quality requirements, required-by date, status
(OPEN/PARTIALLY_FULFILLED/FULFILLED/CANCELLED) — as a genuine first-class record, separate from
`Sale`. Full CRUD via [`backend/src/buyer-orders`](backend/src/buyer-orders). `Sale` gained an
optional `buyerOrderId` link; `SalesService.create()` now auto-updates the linked order's status to
PARTIALLY_FULFILLED/FULFILLED based on cumulative sold quantity. New admin page
[`/dashboard/buyer-orders`](web/src/app/dashboard/buyer-orders/page.tsx) (create + status control +
fulfillment tracking), and a self-service "My rice requirements" section on
[`/dashboard/buyer`](web/src/app/dashboard/buyer/page.tsx) (buyer portal).

**Known limitation, disclosed rather than papered over:** there is no `User`↔`Buyer` link anywhere
in the schema — the buyer portal has always been identity-less (`profile()` returns a static
description, not a specific buyer's own data; `traceability()` works by reference lookup, not
buyer identity). The self-service order form works around this the same way — the buyer selects
their company from a dropdown rather than it being inferred from their login. Fixing that properly
would mean adding a `Buyer.userId` relation, a decision bigger than this pass's scope; flagging it
rather than fabricating an identity link that doesn't exist. Verified the full lifecycle against the
real local DB with a standalone script: create/read/list-for-buyer/status-update/delete — no
residue left.

- [x] Buyer directory (name, cert, contact) — per `REMAINING_WORK_PLAN.md` Phase A
- [x] Market prices (`MarketPrice`)
- [x] Buyer orders / purchase agreements as first-class records — new `BuyerOrder` model
- [x] Rice quantity required / preferred variety / quality requirements captured on buyer requests

**100% reached.**

---

## 11. Finance and Credit — ✅ 100%

**Evidence:** [`backend/src/loans`](backend/src/loans), [`backend/src/finance`](backend/src/finance),
`LoanRecord`/`LoanDeduction` models, [`web/src/app/dashboard/finance/page.tsx`](web/src/app/dashboard/finance/page.tsx).

**Correction to the previous entry**: a full credit-readiness composite already existed —
`FarmersService.getCreditReadiness()` (`GET /farmers/:id/credit-readiness`), a 6-factor, 100pt
scoring model (verification, production, profitability, loan repayment, cooperative membership,
experience) already wired into the farmer, financial-provider and farmers-list pages. The tracker's
"no scoring endpoint found" was stale. **Closed this pass:** added the two missing docx inputs —
farm size (from `Farm.socialHectares`, max 10pts) and insurance status (`InsurancePolicy.status ===
ACTIVE`, max 10pts) — rebalancing the other 6 factors down to keep the scale at 100pts total (20/15/15/15/10/5).
Pure logic change to the existing, already-wired method — no new endpoint, no schema change.
Verified against the real local DB with a standalone script: confirmed the 8 factor maxes sum to
exactly 100 and the computed score matches for a real farmer.

- [x] Loan applications, amount, purpose, approval status, disbursement, repayment, outstanding balance
- [x] Loan deduction automation (`LoanDeduction`, per `M-LAX_IMPLEMENTATION_PLAN.md` Phase 2)
- [x] Platform-wide loan list (`GET /loans`, added this pass — was previously only queryable per-farmer)
- [x] Formal "Rice Farmer Credit Profile" / credit score composite (farm size + production history +
  repayment history + insurance status) — `getCreditReadiness()` now scores all 4 named inputs

**100% reached.**

---

## 12. Agricultural Insurance — ✅ 100%

**Built this pass, net-new module**, with explicit user authorization for schema changes.

**Schema** (migration `20260808131002_add_insurance_and_weather`, purely additive — 6 new tables/enums, zero
`ALTER`/`DROP` on existing data, confirmed by reading the generated SQL before applying): `InsuranceProvider`,
`InsurancePolicy` (farmer/farm/cropCycle/provider FKs, `InsuranceProductType` enum covering all 5 docx product
types, `PolicyStatus`), `InsuranceClaim` (`ClaimStatus`, loose `inspectedById` matching the `verifiedById`
convention).

**Backend:** [`backend/src/insurance`](backend/src/insurance) — full CRUD for providers/policies/claims, policy
status transitions, claim inspection + payment workflow, `GET /insurance/coverage-summary` (grouped aggregates)
feeding the admin dashboard. Enforces one real business rule: claims can only be filed against an `ACTIVE` policy.

**Web:** new [`/dashboard/insurance`](web/src/app/dashboard/insurance/page.tsx) page — provider/policy/claim
tables with create forms, plus per-row status-transition `<select>` controls (not create-only) wired to the
status/inspect/payment endpoints. Sidebar entry added. Admin dashboard gained a "Farmers covered by insurance"
tile and two new charts (policy status, claims by status) in a new Insurance section — **this was the one thing
blocking Dashboard from 100%, now closed.**

**Verification — real, not just `tsc`:** full app boot test (`NestFactory.create(AppModule).init()`) confirms the
DI graph resolves with no missing providers or route conflicts. Standalone scripts against the real local DB
exercised the actual service methods (not raw Prisma) through a full lifecycle: create policy (PENDING) →
activate → file claim (SUBMITTED) → inspect (INSPECTING, notes persisted) → pay (PAID, amount persisted) — and
confirmed the active-policy-only claim rule correctly rejects a claim against a PENDING policy. All test data
cleaned up afterward. Backend test suite still 24/26 (same pre-existing unrelated failure).

- [x] Applications, insured farmer/area/variety, sum insured, premium, insurer, policy status
- [x] Claims, claim inspections (inspector, notes, date), claim payment status
- [x] All 5 product types (area-yield, weather-index, multi-peril, input, credit-linked)
- [x] Coverage aggregate feeding the admin dashboard
- [x] Explicit link between a policy and weather/crop-risk data — new
  `InsuranceService.getWeatherContextForClaim()` (`GET /insurance/claims/:id/weather-context`)
  correlates a claim's incident date/farmer location against `WeatherAlert` records in a ±14-day
  window (read-side join, no FK — matches the existing `WeatherAlert` loose-reference convention;
  surfaces alerts as supporting evidence rather than driving claim approval automatically). Surfaced
  as an expandable "Check" panel per claim row in the insurance page.
- [x] Policy amendment/renewal flow — `PATCH /insurance/policies/:id/amend` (edit sum
  insured/premium/area/dates) and `POST /insurance/policies/:id/renew` (clones an expiring policy
  into a new PENDING one via the new `InsurancePolicy.renewedFromPolicyId` self-relation). Amend/Renew
  buttons added to each policy row.

**Closed this pass, verified against the real local DB with a standalone script**: created a real
policy, amended its sum insured, renewed it into a chained new policy, filed a claim, created a real
`WeatherAlert` in the farmer's region within the correlation window, and confirmed
`getWeatherContextForClaim()` actually finds it (not just returns an empty array) — then deleted
every test record, no residue left.

**100% reached.**

---

## 13. Weather and Early Warning — ✅ 88%

**Built this pass, net-new module**, with explicit user authorization for schema changes.

**Schema:** `WeatherAlert` (region/district/ward scoping, `WeatherAlertType` covering flood/drought/pest/disease/
planting-recommendation/irrigation-recommendation/general, `WeatherAlertSeverity`, `smsSentCount`). Same migration
as Module 12.

**Backend:** [`backend/src/weather`](backend/src/weather) — `GET /weather/forecast?lat=&lon=` calls **Open-Meteo
live** (free, no API key required) for a real 7-day forecast, then derives flood-risk (≥60mm 7-day cumulative
rainfall) and drought-risk (≥5 consecutive near-zero-rain days) flags and a planting/irrigation recommendation
from the *real* precipitation data — not fabricated thresholds dressed up as AI, just transparent arithmetic on
live numbers. `POST /weather/alerts` creates an alert and broadcasts it via the existing `SmsService` (the same
best-effort, `SmsLog`-recording pattern every other feature in this codebase uses) to farmers matching the
alert's region/district/ward.

**Web:** new [`/dashboard/weather`](web/src/app/dashboard/weather/page.tsx) page — live forecast card with a
region-coordinate picker (4 rice-growing-area presets; the forecast itself is always fetched live for whichever
coordinate is selected, nothing about the weather data itself is preset/fake), risk badges, recommendations, and
an alert-issuing form + history table. Sidebar entry added.

**Verification — real, not just `tsc`:** called the live `WeatherService.getForecast()` directly against real
coordinates (Mbeya, dry season) — got back real temperature/precipitation data from Open-Meteo and confirmed the
derived `droughtRisk` flag correctly triggered (0.1mm total rainfall over 7 days in August, Tanzania's dry
season — the risk logic is doing real work, not just always returning true). Full app boot test passed.

- [x] Weather forecast / rainfall / temperature — real, live, no API key needed (Open-Meteo)
- [x] Flood/drought alerts — derived from real precipitation data
- [x] Planting/irrigation recommendations — derived from the same real data
- [x] Pest/disease alert *type* exists in the enum, but pest/disease detection itself isn't derivable from a
  weather API — those alerts are staff-issued (via the alert form), same as flood/drought can also be
  manually issued for local knowledge the forecast API can't capture
- [x] SMS alert delivery — real, reuses existing `SmsService`/`SmsLog` infrastructure
- [ ] USSD/WhatsApp/mobile-app delivery channels — **not built**. Only SMS, because that's the only delivery
  infrastructure that already existed anywhere in this codebase; USSD/WhatsApp integration would be new
  third-party infrastructure, a materially bigger scope decision than "add a module using what's already here."

## 14. Reports and Analytics — ✅ 100%

**Evidence:** [`backend/src/reports`](backend/src/reports) — `farmerPayments`, `premiumFund`,
`kpis`, `impactReport`, `flocertAuditPack`, `membershipGrowth`, `farmersExport`,
`cropCyclesExport`; export via [`backend/src/common/export.service.ts`](backend/src/common/export.service.ts).

**Closed this pass:** `DateRangeDto`/`ReportFormatDto` extended with a new `ReportFilterDto`
(region/district/ward/village/mamcosId/fieldOfficerId/season/riceVariety/gender/youthOnly) — a
`farmerFilterWhere()` helper applies these to `farmerPayments`, and `farmersExport()`/
`cropCyclesExport()` were fixed to actually accept and apply a filter argument (they previously
took zero parameters — date-range and every other filter was silently dropped). `premiumFund`
intentionally stays date-range-only: it's a fund-wide ledger with no per-farmer dimension, so
farmer-scoped filters wouldn't be analytically meaningful there. Added 3 new named-report
endpoints, all exportable via the existing CSV/XLSX/PDF pipeline: `GET /reports/field-officer-performance`
(visits/farms-mapped/farmers-verified/activities-logged per officer, mirrors the logic already used
by the Module 7 dashboard leaderboard), `GET /reports/insurance-coverage` (wraps policy/claim
groupBy aggregates the way `InsuranceService.coverageSummary()` does, but exportable), and
`GET /reports/gender-youth-inclusion` (farmer counts by gender × youth-status). New
[`/dashboard/reports`](web/src/app/dashboard/reports/page.tsx) page — a filter bar plus a
CSV/XLSX/PDF download button per report, replacing the previous total absence of a reports UI
(reports were API-only before this). Verified every new/changed service method against the real
local DB with a standalone script: unfiltered vs `youthOnly`/`region` filtered counts, and confirmed
`genderYouthInclusion()`'s counts sum to exactly the total farmer count.

- [x] Farmer registration / farm area / production-adjacent reports exist in some form
- [x] CSV export (`export.service.ts` `csv()`)
- [x] Excel export (`export.service.ts` `xlsx()`)
- [x] PDF export — `export.service.ts` `pdf()` (pdfkit), a paginated landscape table with repeated headers.
- [x] Filter set from the docx (region/district/ward/village/cooperative/officer/season/variety/gender/youth)
  — now accepted and applied by `farmerPayments`, `farmersExport`, `cropCyclesExport`
- [x] Field-officer performance report, insurance coverage report, gender/youth inclusion report as named reports

**100% reached.**

---

## 15. Users & Roles — ✅ 100%

Not in the docx's written text but present in the `image2.png` wireframe sidebar.

**Evidence:** `UserRole` enum + `RolesGuard`, [`web/src/app/dashboard/staff/page.tsx`](web/src/app/dashboard/staff/page.tsx),
new [`web/src/app/dashboard/users/page.tsx`](web/src/app/dashboard/users/page.tsx).

**Closed this pass:** confirmed `staff` page is AMCOS-scoped account creation only, not a platform-wide
account list — built the actual "Users & Roles" page separately rather than overloading `staff`. Added
`role?: UserRole` to `UpdateUserDto` and `UsersService.update()`.

**Security bug found and fixed in the same pass**: `PATCH /users/:id` had **no `@Roles` guard at
all** — any authenticated user of any role could edit any *other* user's account (email, phone,
`isActive`), not just their own. Root cause: the endpoint doubles as farmer/staff self-service
(`profile/page.tsx` calls it to update the caller's own `language`), so a blanket `@Roles(SUPER_ADMIN,
ADMIN)` would have broken that self-service path. Fixed with fine-grained authorization in
`UsersService.update()` instead: self-updates are allowed for any caller, edits to *other* accounts
require SUPER_ADMIN/ADMIN, role changes require SUPER_ADMIN specifically, and `isActive` changes
require staff. Verified all four rules against the real local DB with a standalone script — confirmed
a FARMER-role caller is rejected editing another account, self-service language update still works,
a non-SUPER_ADMIN is rejected changing a role, and a SUPER_ADMIN role change round-trips correctly —
then reverted every test mutation so no residue was left in real data.

- [x] Role-based access control exists and is enforced backend-side
- [x] Staff creation (field officers, cooperative accounts) from `mayodata-admin`
- [x] A dedicated "Users & Roles" admin page listing *all* platform accounts with role edit/deactivate

**100% reached.**

---

## 16. Settings — ✅ 100%

In the wireframe sidebar, not in the written spec — scope was undefined until this pass; user chose
Locations admin + Org Profile + Notification Templates.

**Built this pass, net-new page**, with explicit user authorization for schema changes.

**Schema** (migration `20260810170312_add_admin_module_gaps`, purely additive): `OrgSettings`
(singleton row: orgName, logoUrl, contactEmail, contactPhone, address), `NotificationTemplate`
(key, channel, title, body).

**Backend:**
- [`backend/src/locations`](backend/src/locations) — was fully read-only with no auth guard at
  all; added `POST/PATCH/DELETE` for region/district/ward, ADMIN-gated, while leaving the existing
  reads public (unchanged, since registration flows depend on unauthenticated location lookups).
- [`backend/src/settings`](backend/src/settings) — singleton get/update for `OrgSettings` (creates
  the row lazily on first save rather than requiring a migration seed), full CRUD for
  `NotificationTemplate`.
- Wired the Weather module's SMS alert broadcast
  ([`weather.service.ts`](backend/src/weather/weather.service.ts) `createAlert()`) to look up a
  `NotificationTemplate` by the `weather_alert` key first (with `{alertType}`/`{title}`/`{message}`
  placeholder substitution), falling back to the original hardcoded message format when no template
  exists — proof-of-integration without rewiring every other SMS call site in the codebase.

**Web:** new [`/dashboard/settings`](web/src/app/dashboard/settings/page.tsx) page with three tabs
— Locations (region → district → ward drill-down with inline create/delete), Org Profile (single
form), Notification Templates (list/edit/delete table with the `weather_alert` key documented in
the create form's help text). Sidebar entry added.

**Verified against the real local DB with a standalone script**: org-settings lazy-create-on-first-save
(confirmed the second update reuses the same row rather than creating duplicates), notification
template CRUD, and the full region→district→ward create/rename lifecycle — all cleaned up
afterward, no residue left. Full production build (`next build`) also confirms `/dashboard/settings`
compiles and prerenders cleanly.

- [x] Locations admin hierarchy — region/district/ward now have write endpoints + admin UI
- [x] Org profile — new `OrgSettings` model + settings form
- [x] Notification templates — new `NotificationTemplate` model + CRUD UI, wired into the Weather
  module's SMS broadcast as a real (not decorative) integration

**100% reached.**

---

## How to use this file

- When you finish a checklist item, tick it and update the module's `Status`/`%`/Summary-table row in the same commit as the code change — don't batch tracker updates separately from the work.
- Items marked "confirm"/"verify" above were inferred from file/module *existence*, not a full read of every field — check the actual DTO/schema before crediting them as done.
- If a docx requirement turns out to be genuinely out of scope (no data source, no team decision yet — e.g. Insurance/Weather need a third-party provider decision first), say so explicitly in the module section rather than leaving it silently unchecked, matching the "disclosed gap" convention used in `M-LAX_IMPLEMENTATION_PLAN.md`.
