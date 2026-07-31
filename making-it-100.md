# MAYOData: Production-Readiness Roadmap (all 40 proposal features)

## Context

The MAYODE Youth Development Group commissioned a proposal PDF describing the full MAYOData platform (farmer/farm management, Fairtrade audit reporting, buyer traceability, loan integration, cooperative accounting, governance, and AI/IoT tooling). A code audit against that proposal found the current system (`backend/`, `mobile/`, `web/`) is strong on farmer/farm data capture but has three classes of gaps:

1. **Dead-code / schema-only features** — models exist (`Sale`, `Buyer`, `LoanRecord.autoDeductPercent`, `Payment.loanDeduction`) but nothing ever populates or acts on them. This is the highest priority because several proposal features (traceability reports, buyer portal, loan automation, Fairtrade compliance dashboard) all depend on the same broken link: **`Sale` is never created**.
2. **Missing subsystems** — accounting (GL/AR/AP/budgeting), governance/voting, grantor impact reporting, buyer-facing portal, consent management. These need new modules from scratch.
3. **Partial implementations** — offline sync (no queue, just a local/remote switch), date validation, cooperative-wide KPI dashboard, CSV export, labor cost detail.

Decision: build the **full 40-feature roadmap**, including **full loan automation** (deduction + automatic remittance to lender via ClickPesa payout) and a **natively built accounting layer** (GL/AR/AP/budgeting/ratios) rather than deferring to external accounting software.

Given the size, this plan is phased so each phase ships independently and later phases build on earlier data (e.g. accounting needs Sale/Payment data flowing correctly first). Each phase below is itself a large piece of work — this document defines scope, data model, and reuse points per phase; each phase should get its own focused implementation pass (likely its own PR/session) rather than being done in one sitting.

---

## Reuse patterns already in the codebase (apply consistently across all phases)

- **Ownership/access control**: `backend/src/common/ownership.service.ts` (`assertFarmAccess`, `assertFarmerAccess`) — every new service must gate access through this, following `finance.service.ts` and `inventory.service.ts`.
- **Sequential human-readable codes**: `generateTrackingCode()` in `inventory.service.ts:12-29` and `generateControlNumber()` in `farmers.service.ts:49-56` — same `PREFIX-YYYY-NNNN` pattern reused for invoice numbers, GL entry numbers, etc.
- **Money movement**: `backend/src/payments/clickpesa.service.ts` — `initiateUssdPush` (collect from buyer/farmer), `initiateMobilePayout` (disburse to farmer/lender), with `queryPayment`/`queryPayoutStatus` for authoritative status. All new payout flows (farmer rice payment, lender remittance) go through this, matching the pattern already used in `marketplace.service.ts`/`memberships.service.ts`.
- **SMS notifications**: `backend/src/messaging/sms.service.ts` + `SmsLog` model — reuse for every new farmer-facing notification (payment breakdown, loan deduction, meeting/vote announcements).
- **Activity feed**: `activities.service.ts` `.log(farmerId, type, title, subtitle, icon)` — call this from every new service so the farmer's personal timeline (`mobile/app/(tabs)/index.tsx`) stays complete.
- **Role gating**: `UserRole` enum + `RolesGuard`/`@Roles()` (`auth/guards/roles.guard.ts`) — already includes `FINANCIAL_PROVIDER`; extend with new roles as needed (e.g. `BUYER`) rather than inventing a parallel permission system.

---

## Phase 0 — Fix the core Sale/Buyer pipeline (unblocks Phases 1, 4)

**Why first**: `Sale`/`Buyer` are referenced by traceability reports, the compliance dashboard, buyer portal, and impact reporting. Nothing downstream works until this exists.

- New `backend/src/buyers` module: CRUD for `Buyer` (currently has zero controller). Reuse the `users`-module CRUD pattern for role-gated create/list/update.
- New `backend/src/sales` module (or extend `inventory` module): `createSale()` — takes `lotId`, `buyerId`, quantity/price/premium, generates `invoiceNumber` via the sequential-code pattern, creates `Sale`, and **apportions revenue back to each contributing farmer** by weight share of `InventoryRecord`s in the `Lot` (this apportionment logic is net-new — the proposal's calculation logic on p.10-12 is the spec). Apportioned amounts should create `Revenue` rows per farmer's `CropCycle` (reusing `finance.service.ts` `addRevenue` shape) so farmer financial summaries stay correct — this is also what closes the current gap where `Revenue` (per-cropCycle, direct-to-farmer) and `Sale`/`Lot` (buyer-facing) are disconnected concepts.
- Traceability report endpoint: given `lotId` or `invoiceNumber`, join `Sale → Lot → InventoryRecord → Farmer/Farm` and return the full chain (mirrors `inventory.service.ts` `findLotByNumber`, just extended with `Sale`).
- Wire `Payment.status`/`paymentReceived` on `Sale` to actually flip when ClickPesa confirms.

## Phase 1 — Fairtrade / audit reporting package

Depends on Phase 0 for real Sale/Lot data.

- **Farmer Payment Report**: aggregate `Payment`/`Revenue` by farmer + date range, dedicated endpoint (not just the existing per-farmer summary).
- **Fairtrade Premium Fund Report**: new `PremiumFundEntry` model (income from `Sale.fairtradePremium`, expenses logged separately) — currently premium is only summed into net profit, never tracked as its own ledger. Needs a simple income/expense table + running balance, not full GL (that's Phase 3).
- **Product Traceability Report**: built on Phase 0's join.
- **Compliance Dashboard** (web): a new `web/src/app/dashboard/compliance/page.tsx` pulling avg farmer income, membership growth %, premium-fund balance — data already computable from Phases 0-1 endpoints, this is presentation only.
- **CSV/Excel export**: the `xlsx` package is already a backend dependency, unused. Add a shared `exportToCsv()`/`exportToXlsx()` utility in `backend/src/common`, wire it as a `?format=csv` query option on the report endpoints above and on `farmers`/`crop-cycles` list endpoints.
- **Cooperative-wide KPI dashboard**: extend `web/src/app/dashboard/page.tsx` with total-hectares/avg-yield-per-hectare/total-revenue tiles, backed by a new aggregate endpoint (sum `Farm.socialHectares`, `CropCycle.actualYieldKg`, `Revenue.totalRevenue` cooperative-wide) — reuse `farmers.service.ts` `getProductionSummary` aggregation style.
- **Date validation**: add a class-validator cross-field check (or service-level check) in `crop-cycles.service.ts`/`dto/crop-cycles.dto.ts` rejecting `harvestDate < plantingDate`.
- **Labor detail**: extend `ActivityLog` with `familyLaborCount`/`hiredLaborCount`/`laborWageTotal` fields (currently only generic `laborWorkers`/`laborHours`).

## Phase 2 — Full loan integration automation

This is the most operationally sensitive phase (real money to third parties) — build and test against ClickPesa sandbox before going live, and add an admin approval step per disbursement even though the flow is automated end-to-end, as a safety net.

- Deduction calculation: when a farmer's rice payment is finalized (Phase 0's `Revenue`/`Sale` apportionment triggers payment), look up the farmer's active `LoanRecord`s, compute deduction (`autoDeductPercent` × payment, capped at `amountOwed`), decrement `LoanRecord.amountOwed`, and populate `Payment.loanDeduction`/`netAmount` (fields already exist, unused).
- Remittance: use `ClickPesaService.initiateMobilePayout()` to send the deducted amount to the lender's registered payout account, and a second payout of `netAmount` to the farmer — both logged via `queryPayoutStatus` polling (same pattern as `memberships.service.ts` `reconcilePayment`).
- Add lender contact/payout details to `LoanRecord` (currently has no payout destination field — needed migration).
- SMS breakdown: extend `sms.service.ts` with a `sendPaymentBreakdown(farmer, totalSale, loanDeduction, netAmount)` template, matching the proposal's example message (p.6, p.29).
- Use `PaymentType.LOAN_REPAYMENT`/`RICE_PURCHASE`/`FAIRTRADE_PREMIUM` enum values (already defined, never referenced) to tag these `Payment` rows correctly.

## Phase 3 — Native accounting layer (GL / AR / AP / budgeting / ratios)

Biggest net-new subsystem. Build as its own module, `backend/src/accounting`, backed by new models:

- `LedgerEntry` (double-entry: date, account, debit/credit, reference to source transaction) — every `Revenue`, `InputCost`, `Sale`, `Payment`, and loan disbursement from Phases 0-2 posts here automatically (a single `postToLedger()` hook called from those services, not manual re-entry).
- `Account` (chart of accounts: asset/liability/equity/income/expense categories).
- `Invoice` (buyer-facing A/R — extends `Sale` with due date/aging) and `Bill` (supplier A/P).
- `Budget`/`BudgetLine` (per season/year, forecast vs actual — actuals computed by querying `LedgerEntry` for the period, mirroring the `finance.service.ts` summary-aggregation pattern).
- Report endpoints: P&L and Balance Sheet (aggregate `LedgerEntry` by account type/date range), plus liquidity/profitability/solvency ratio calculations as pure functions over those aggregates.
- This phase depends on Phases 0-2 being complete and correct, since the ledger is only as trustworthy as the transactions feeding it.

## Phase 4 — Buyer portal & grantor/impact reporting

- **Buyer portal**: new `BUYER` role + `web` (or a lightweight public-ish) portal showing: supplier profile (static cooperative info), read-only production dashboard (aggregate, not farmer-identifying), and a traceability lookup by tracking code/invoice number (built on Phase 0/1's traceability report, scoped down to buyer-safe fields).
- **Grantor impact reporting**: new endpoint aggregating farmer-income-over-time, membership growth, and premium-fund-funded projects (needs Phase 1's premium fund + a small `CommunityProject` model for "what the premium paid for").
- **Project tracking**: `CommunityProject` model (name, funding source, budget, status, milestones) + simple CRUD + progress view, reusing the `farm-alerts`/`disputes` module's status-workflow pattern (open → in-progress → complete).

## Phase 5 — Governance, voting, and consent

- **Voting module**: new `Vote`/`VoteOption`/`VoteResponse` models, farmer-facing voting screen in mobile (reuse `mobile/app/(tabs)/index.tsx` navigation pattern), admin-side vote creation in web, results tallying endpoint. Ties into SMS for "voting is open" announcements.
- **Governance report**: log of meetings/decisions — simplest as a `MeetingRecord` model (date, agenda, decisions, attendee count) with manual entry by staff; votes conducted through the Voting module link into it as one type of decision.
- **Farmer consent**: add `dataShareConsent Boolean` (+ `consentedAt`) to `Farmer`, captured during registration (mirrors the paper consent form, p.24-25) and mobile onboarding flow (`mobile/app/identity.tsx` or wherever registration lives). Gate the credit-readiness endpoint (`farmers.controller.ts:76-80`, `FINANCIAL_PROVIDER` role) on this flag being true before returning data to a bank-role user — this is the actual enforcement point the proposal describes.

## Phase 6 — Mobile offline sync overhaul

Current state: `mobile/src/local/store.ts`/`repositories.ts` is a full local data layer, but `USE_LOCAL_DATA` in `mobile/src/lib/config.ts` is a build-time all-or-nothing switch, not a sync queue.

- Add a `SyncQueue` (AsyncStorage-backed list of pending mutations: create/update records made while offline).
- Add connectivity detection (`@react-native-community/netinfo`, not currently a dependency).
- On reconnect, replay queued mutations against the real backend API (`mobile/src/lib/api.ts`), handling conflicts with a simple last-write-wins + server-timestamp comparison (document this explicitly — it's a real design decision, not a detail to skip).
- This should be scoped to the highest-value offline flows first (crop cycle / activity logging / farm registration), not every screen at once.

## Phase 7 — External bank API for credit scoring

- Currently `GET /farmers/:id/credit-readiness` requires a `FINANCIAL_PROVIDER`-role Mayode user account — fine for a pilot bank partner, but not a scalable external integration.
- Add API-key-based auth (separate from the JWT user-session flow) for partner banks, scoped read-only to consented farmers' credit profiles (depends on Phase 5's consent flag), with request logging for audit purposes (reuse `AuditLog` model).

---

## Cross-cutting requirements (apply to every phase)

- **Migrations**: each phase's new models go through `prisma migrate dev` with a descriptive name, following the existing `20260728*` migration naming already in `backend/prisma/migrations/`.
- **Tests**: no test suite currently found for `finance`/`inventory`/`marketplace` services — as each phase lands, add at minimum service-level unit tests for the new business logic (especially Phase 0's apportionment math and Phase 2's deduction math, since money-correctness bugs there are the costliest kind).
- **Audit logging**: every new money-movement or data-sharing action should write to the existing `AuditLog` model, consistent with the proposal's "digital audit trail" requirement (p.15).

## Verification approach

- Backend: `cd backend && npm run build && npm test` after each phase; manually exercise new endpoints via the existing REST client patterns (check `backend/src` for an existing Postman/HTTP-file setup, or use `curl` against a local `npm run start:dev`).
- Web: `cd web && npm run build` plus manual click-through of new dashboard pages.
- Mobile (Phase 6 especially): use the `run` skill to launch the Expo app and manually test the offline→online transition (toggle airplane mode, create a record, reconnect, confirm sync).
- Money-flow phases (0, 2, 3): test against ClickPesa's sandbox credentials before any production key is used, and manually verify a full farmer-payment-with-loan-deduction cycle end-to-end before enabling for real farmers.
