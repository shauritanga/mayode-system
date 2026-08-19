# Phase 1 gap backlog

Prioritized work to finish **Farm Management Phase 1**, then a **Phase 1.5** track for value-chain / partners / AI.

**Legend**
- **P0** — blocks “Phase 1 complete”
- **P1** — expected for Phase 1 complete but not blockers for farmer pilot
- **P2** — Phase 1.5 (or later polish)
- ✅ — shipped
- 🔄 — in progress

**Surfaces:** `mobile` · `web` · `api` · `all`

---

## Phase 1 complete — status

### A. Farmer experience
| ID | Status |
|----|--------|
| P1-A1 / A2 / F1 / B1 / C1 / C2 | ✅ prior sprint |
| P1-A3 | ✅ First-open ··· tip (`farmOverflowHint`) |
| P1-A4 | ✅ Upload retry + `resolveMediaUrl` on farm photos / profile docs |
| P1-A5 | ✅ Edit-profile completeness checklist (required fields + docs) |

### B–C
| ID | Status |
|----|--------|
| P1-B1 | ✅ |
| P1-B2 | ✅ Shared `isFarmBoundaryMapped` (polygon ≥3 pts) on web farms list/detail + workspace boundary queue |
| P1-B4 | ✅ Farm detail empty season copy + ··· self-operate / lease when ownership verified |
| P1-C1 / C2 | ✅ |

### D. Cooperative admin
| ID | Status |
|----|--------|
| P1-D1 | ✅ Secretary dashboard quick actions + memberships nav + farmers/farms/leases/reports |
| P1-D2 | ✅ Work queues (boundary + renter) from workspace API; Farms **Boundary queue** filter |

### E. MAYOData admin
| ID | Status |
|----|--------|
| P1-E1 | ✅ ADMIN added across core nav (farmers, farms, registry, cycles, activities, …) |
| P1-E2 | ✅ `POST /memberships/reconcile-pending` + per-row reconcile; Memberships UI button |
| P1-E3 | ✅ Reports **Check Phase 1 datasets** health run |

### F. Crop cycle
| ID | Status |
|----|--------|
| P1-F1 | ✅ |
| P1-F2 | ✅ Calendar includes `RICE_TASK` → task screen; rice section/task UI i18n |
| P1-F3 | ✅ Staff crop-cycles: status + season filters; farm detail links |

Phase 1 core is complete for the farmer / officer / co-op / admin loops.

---

## Phase 1.5 — value chain, partners, AI

Goal: warehouse → sale → partner visibility, FI/insurance usability, then AI analytics.

### F′. Inventory, warehouse, shipping, sales
| ID | Status |
|----|--------|
| P15-F1 | ✅ Guided warehouse intake + lot build on Inventory |
| P15-F2 | ✅ Sale → buyer order link + lot stock marked sold |
| P15-F3 | ✅ Staff Traceability page (invoice / lot / INV code) |

### G–I
| ID | Status |
|----|--------|
| P15-G2 | ✅ Partner API v1 docs + key admin + versioned credit-profile (`mayode.credit-profile.v1`) |
| P15-G1 | ✅ Buyer portal: company match by phone/email, scoped orders/sales, privacy-safe trace |
| P15-G3 | ✅ Suppliers → linked input-cost deliveries; mobile expense supplier picker; secretary nav |
| P15-G4 | ✅ Grantor Impact page + `mayode.grantor-impact.v1` (season KPIs, JSON/CSV export) |
| P15-H1 | ✅ FI Credit Dashboard: factors + JSON/CSV export |
| P15-H2 | ✅ Partner access audited (`PartnerApiRequest`) + rate limit 120/hr |
| P15-H3 | ✅ Insurance ops: filters, inspect, claim timeline, policy dates |
| P15-H4 | ✅ Farmer insurance on mobile (policies + claim file + timeline) |
| P15-I1 | ✅ Product choice: Field Advisory primary (`mayode.field-advisory.v1`); equipment intake catalog |
| P15-I2 | ✅ Generate advisory API + AI Insights web + mobile crop-cycle advisory (membership-gated detail) |
| P15-I3 | ✅ Soil tester → fertilizer plan (`mayode.soil_tester.v1`) + farm soil sync + advisory link |
| P15-I4 | ✅ Rice sorter → lot inventory grades + traceability `sorterQuality`; QR lot resolve; external model hook |

---

## How to verify (web)

1. Login as **MAMCOS_SECRETARY** → Dashboard shows work queues + quick actions (Farmers, Boundary queue, Renters, Memberships, Reports).
2. Farms → **Boundary queue** → only farms with a walked polygon (not center pin alone); open farm → Approve official boundary.
3. Crop Cycles → filter by status (tap cards) / season chips; farm code opens farm detail.
4. Inventory → guided intake (cycle → measures → confirm) → Create lot from receipts.
5. Sales → create sale with optional buyer order; Traceability → paste invoice / lot / INV code.
6. Settings → **Partner API** → create key; `GET /partner/v1/docs`; credit-profile with `X-API-Key`.
7. Login as **FINANCIAL_PROVIDER** → Credit Dashboard → load consented farmer → Export JSON/CSV.
8. Login as **ADMIN** → Memberships → **Reconcile pending payments**.
9. Reports → **Check Phase 1 datasets**.
10. Login as **BUYER** (phone/email matching a Buyer contact) → Buyer Portal shows company metrics + submit requirement; Trace by invoice.
11. Suppliers → open a row → linked input costs; mobile Add expense → pick supplier.
12. Grantor Impact → Export JSON/CSV (ADMIN / AUDITOR / BUYER).
13. **AI Insights** → Generate field advisory; soil intake (pH/N-P-K) → fertilizer plan; sorter intake on a lot → check Traceability.
14. Docs: `docs/ai-mvp.md`.

## How to verify (mobile)

1. Farm detail → first tap **···** shows tip; Season records still only from menu.
2. Ownership confirmed + no season → hint to use ··· for self-operate or lease.
3. Calendar → rice tasks open `/calendar-task`; empty month uses calendar empty copy (not visit copy).
4. Edit profile → completeness banner lists missing fields.
5. Drawer → Log activity / Add expense / Record sale.
6. Crop cycle → **Field advisory** → Generate; members see actions, free users see summary + membership CTA.

Phase 1.5 core track complete (F′ → G → H → I).

## Phase 2 polish (shipped)

| ID | Status |
|----|--------|
| P2-1 | ✅ Buyer portal shows sorter quality on trace |
| P2-2 | ✅ Mobile advisory soft refresh + membership CTA |
| P2-3 | ✅ AI Insights intake validation + Traceability deep-link |
| P2-4 | ✅ Mobile harvest sale buyer picker (`buyerId`) |
| P2-5 | ✅ Admin / secretary / officer quick links to AI & Traceability |
| P2-B | ✅ Farmer warehouse stock (mine list/summary + report delivery) |
| P2-E | ✅ Weather provider badge on web (mobile already had it) |
