# MAYODE AI MVP

## Product choice (P15-I1)

**Primary live product:** Season **Field Advisory** (`FIELD_ADVISORY`)

- Schema: `mayode.field-advisory.v1`
- Engine: transparent rules on rice protocol tasks, soil/water signals, and logged activities
- Pulls latest `SOIL_TESTER` fertilizer guidance into season advisories when present
- Stored as `AiIntegrationRecord` for partner/export continuity

## Live intake products

| sourceType | Schema | Status |
|------------|--------|--------|
| `SOIL_TESTER` | `mayode.soil_tester.v1` | Live — pH/OM/N-P-K → fertilizer plan; syncs farm soil fields |
| `RICE_SORTER` | `mayode.rice_sorter.v1` | Live — grade/moisture → lot inventory + sales/traceability |
| `QR_TRACEABILITY` | `mayode.qr_traceability.v1` | Live — scan events; resolves tracking code → lot |
| `DRONE_REPORT` | — | Intake-ready (store payload) |
| `LOGISTICS_OPTIMIZER` | — | Planned |

## Workflows

### Field advisory (I2)
1. `POST /integrations/ai-records/field-advisory/:cropCycleId`
2. Appears on **AI Insights** and mobile crop-cycle advisory
3. Membership gates full findings/actions for farmers

### Soil → fertilizer (I3)
1. Staff posts `SOIL_TESTER` with pH / OM / N-P-K on **AI Insights**
2. Engine writes recommendation (`fertilizerPlan`, liming/N/P/K actions)
3. Farm `soilType` / `soilCondition` / `soilFertility` sync when a farm is linked
4. Next field advisory for that farm includes the soil guidance

### Sorter → lot / sales (I4)
1. Staff posts `RICE_SORTER` with `lotId` + moisture/broken/grade
2. Inventory rows on that lot get `qualityGrade` + `moistureContentPct`
3. Traceability (and buyer portal lot block) show `lot.sorterQuality`
4. Optional `modelProvider` / `modelVersion` on any payload → `payload.externalModel` hook

## Endpoints

- `GET /integrations/ai-catalog`
- `POST /integrations/ai-records/field-advisory/:cropCycleId`
- `POST /integrations/ai-records`
- `GET /integrations/ai-records` (staff)
- `GET /integrations/ai-records/mine` (farmer-scoped + membership gate)
- `GET /integrations/ai-records/lot/:lotId/quality`

## External model hook

Any intake may include `modelProvider` + `modelVersion`. They are stored under `payload.externalModel` so partner models can plug into the same record stream without a separate schema.
