# Scheme Management (irrigation)

AMCOS portal only (not the admin portal). Module for one AMCOS irrigation scheme: canals → blocks → hectare units, member allocation, transfers and leadership.
Backend: `backend/src/irrigation`. Frontend: `web/src/screens/dashboard/irrigation` (route `/dashboard/irrigation`).

## Applying the migration

```
cd backend
npx prisma migrate deploy      # applies 20261105090000_irrigation_scheme_management
npx prisma generate
```

The migration is additive. It extends the existing `irrigation_schemes` table (new nullable/defaulted columns; legacy rows keep
working and `is_active=false` rows become `status=INACTIVE`), creates seven new tables, adds the partial unique indexes,
check constraints and triggers described below, and registers three permission resources. No existing table is dropped.

Then, per AMCOS, create the ready-made roles (needs the `roles` CREATE permission):
`POST /api/v1/irrigation/setup/roles` → "Irrigation Scheme Manager", "Canal Leader", "Block Leader".

## Data rules enforced by PostgreSQL

| Rule | Mechanism |
| --- | --- |
| One open (pending/active) allocation per hectare | partial unique index `irrigation_hectare_allocations_one_open_per_hectare` |
| One pending transfer per hectare | partial unique index `irrigation_transfers_one_pending_per_hectare` |
| One active canal leader per canal / block leader per block | partial unique indexes on `irrigation_leaderships` |
| Hectare numbers unique per block and never beyond the block's size | unique `(block_id, hectare_number)` + trigger `irrigation_hectares_limit` |
| Allocation, transfer and leadership history is never deleted | `BEFORE DELETE` triggers; FKs are `RESTRICT` |
| Unique scheme code (case-insensitive) | unique index on `lower(code)` |
| Land measures | `DECIMAL(10,2)` / `DECIMAL(8,2)` with positive checks |

Scheme configuration (planned canals, min/max blocks per canal, hectares per block, hectares allowed per member,
approval required) lives on `irrigation_schemes`; nothing about 6 canals / 30 hectares is hard-coded.

## Permissions

Resources: `irrigation` (structure), `irrigation_allocations`, `irrigation_leadership`, each with VIEW/CREATE/EDIT/DELETE.
Every route declares its permission explicitly. In addition `IrrigationScopeService` confines data:

* Super Admin and holders of `irrigation` EDIT ("scheme managers") see their whole AMCOS (Super Admin: all AMCOS).
* A member who currently leads a canal or block and lacks `irrigation` EDIT is confined to that canal (all its blocks) or block.
  Out-of-scope records return 404 for reads and writes. They cannot change scheme structure or configuration.
* Everyone else is limited to their own AMCOS.

## Using it

1. **Scheme Registration** – register the scheme (code, location, water source, policy). 2. **Canal List** – add canals 1–6.
3. **Block List** – add blocks to each canal; the 30 hectare units are generated automatically. 4. **Leader Assignments** –
appoint canal and block leaders (replacing a leader asks for confirmation and keeps the old appointment).
5. **Hectare Allocation** – canal → block → free hectare → member → confirm. If the scheme requires approval, a different
person approves from the same page. 6. **Transfer History** – record transfers; the old allocation is closed, a new one opened.

## Tests

```
backend/scripts/irrigation-test-schema.sh                       # builds throw-away schema `irrigation_test`
IRRIGATION_TEST_DATABASE_URL="$DATABASE_URL" npx jest irrigation.integration --runInBand
```
