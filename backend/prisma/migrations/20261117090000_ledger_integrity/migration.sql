-- Ledger integrity: immutable entries, sequential numbers, period close, bank reconciliation, tax (VAT / withholding).
--
-- Posted ledger rows can no longer be changed or deleted. A correction is a new journal (an "adjustment" carrying only the
-- difference, or a reversal). The only way around the trigger is the session setting app.ledger_maintenance = 'on', which
-- application code never sets; it exists for migrations and for tests that fabricate legacy rows.

-- ───── Tax settings per cooperative ─────
ALTER TABLE "mamcos"
  ADD COLUMN "tin" TEXT,
  ADD COLUMN "vrn" TEXT,
  ADD COLUMN "vat_registered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 18;
ALTER TABLE "mamcos" ADD CONSTRAINT "mamcos_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);

-- ───── Invoices and bills: tax columns, numbering unique per cooperative ─────
ALTER TABLE "invoices"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "posted_to_ledger" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "subtotal" DOUBLE PRECISION,
  ADD COLUMN "vat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "withholding_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Invoices recorded before this migration never reached the ledger; keep them that way so paying one does not credit receivables twice.
UPDATE "invoices" SET "posted_to_ledger" = false;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_check" CHECK ("vat_amount" >= 0 AND "withholding_amount" >= 0);
ALTER TABLE "bills"
  ADD COLUMN "expense_account_code" TEXT,
  ADD COLUMN "subtotal" DOUBLE PRECISION,
  ADD COLUMN "vat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "withholding_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD CONSTRAINT "bills_tax_check" CHECK ("vat_amount" >= 0 AND "withholding_amount" >= 0);
DROP INDEX "invoices_invoice_number_key";
DROP INDEX "bills_bill_number_key";
CREATE UNIQUE INDEX "invoices_mamcos_id_invoice_number_key" ON "invoices"("mamcos_id", "invoice_number");
CREATE UNIQUE INDEX "bills_mamcos_id_bill_number_key" ON "bills"("mamcos_id", "bill_number");

-- ───── Ledger: journals, revisions, reversals ─────
ALTER TABLE "ledger_entries"
  ADD COLUMN "journal_id" TEXT,
  ADD COLUMN "posted_by_id" TEXT,
  ADD COLUMN "reverses_journal_id" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
-- Every existing (source type, source id) is one journal; the id is derived so re-running is harmless.
UPDATE "ledger_entries" SET "journal_id" = md5("source_type" || ':' || "source_id")::uuid::text WHERE "journal_id" IS NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "journal_id" SET NOT NULL;

-- ───── Counters ─────
CREATE TABLE "ledger_counters" (
    "scope_key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ledger_counters_pkey" PRIMARY KEY ("scope_key","year")
);

-- Renumber existing journals 1, 2, 3 … per cooperative and year (oldest first), then seed the counters.
WITH j AS (
  SELECT "journal_id",
         COALESCE("mamcos_id", 'platform') AS sk,
         EXTRACT(YEAR FROM MIN("entry_date") + interval '3 hours')::int AS yr,
         MIN("created_at") AS ts,
         BOOL_OR("source_type" = 'MANUAL_JOURNAL') AS manual
  FROM "ledger_entries" GROUP BY "journal_id", COALESCE("mamcos_id", 'platform')
), n AS (
  SELECT "journal_id", yr, manual,
         ROW_NUMBER() OVER (PARTITION BY sk, yr ORDER BY ts, "journal_id") AS rn
  FROM j
)
UPDATE "ledger_entries" le
SET "entry_number" = CASE WHEN n.manual THEN 'JE-' ELSE 'GL-' END || n.yr || '-' || lpad(n.rn::text, 6, '0')
FROM n WHERE le."journal_id" = n."journal_id";

INSERT INTO "ledger_counters" ("scope_key", "year", "last_value")
SELECT COALESCE("mamcos_id", 'platform'),
       EXTRACT(YEAR FROM "entry_date" + interval '3 hours')::int,
       COUNT(DISTINCT "journal_id")
FROM "ledger_entries" GROUP BY 1, 2
ON CONFLICT DO NOTHING;

DROP INDEX "ledger_entries_source_type_source_id_account_id_key";
CREATE UNIQUE INDEX "ledger_entries_source_type_source_id_account_id_revision_key" ON "ledger_entries"("source_type", "source_id", "account_id", "revision");
CREATE UNIQUE INDEX "ledger_entries_reverses_journal_id_account_id_key" ON "ledger_entries"("reverses_journal_id", "account_id");
CREATE INDEX "ledger_entries_journal_id_idx" ON "ledger_entries"("journal_id");

-- ───── Period close ─────
CREATE TABLE "accounting_locks" (
    "scope_key" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "closed_through" DATE NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,
    CONSTRAINT "accounting_locks_pkey" PRIMARY KEY ("scope_key"),
    CONSTRAINT "accounting_locks_scope_check" CHECK ("scope_key" = COALESCE("mamcos_id", 'platform'))
);
CREATE UNIQUE INDEX "accounting_locks_mamcos_id_key" ON "accounting_locks"("mamcos_id");
ALTER TABLE "accounting_locks" ADD CONSTRAINT "accounting_locks_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "accounting_lock_events" (
    "id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "action" TEXT NOT NULL,
    "from_date" DATE,
    "to_date" DATE,
    "reason" TEXT,
    "by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_lock_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_lock_events_action_check" CHECK ("action" IN ('CLOSE', 'REOPEN'))
);
CREATE INDEX "accounting_lock_events_scope_key_created_at_idx" ON "accounting_lock_events"("scope_key", "created_at");

-- ───── Bank / mobile-money reconciliation ─────
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'RECONCILED');

CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "account_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_statements_period_check" CHECK ("period_end" >= "period_start"),
    CONSTRAINT "bank_statements_kind_check" CHECK ("kind" IN ('BANK', 'MOBILE_MONEY', 'CASH'))
);
CREATE INDEX "bank_statements_mamcos_id_period_end_idx" ON "bank_statements"("mamcos_id", "period_end");
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "line_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "ledger_entry_id" TEXT,
    "matched_at" TIMESTAMP(3),
    "matched_by_id" TEXT,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_statement_lines_amount_check" CHECK ("amount" <> 0)
);
CREATE UNIQUE INDEX "bank_statement_lines_ledger_entry_id_key" ON "bank_statement_lines"("ledger_entry_id");
CREATE INDEX "bank_statement_lines_statement_id_idx" ON "bank_statement_lines"("statement_id");
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Guards (created last so the renumbering above is not blocked by them) ─────

-- 1. Posted entries never change.
CREATE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted ledger entries cannot be changed or deleted; post a reversing or adjusting journal instead' USING ERRCODE = '23514';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();

-- 2. Nothing is posted on or before the day the books are closed through (Africa/Dar_es_Salaam = UTC+3).
CREATE FUNCTION ledger_period_guard() RETURNS trigger AS $$
DECLARE closed date;
BEGIN
  IF current_setting('app.ledger_maintenance', true) = 'on' THEN RETURN NEW; END IF;
  SELECT "closed_through" INTO closed FROM "accounting_locks" WHERE "scope_key" = COALESCE(NEW."mamcos_id", 'platform');
  IF closed IS NOT NULL AND (NEW."entry_date" + interval '3 hours')::date <= closed THEN
    RAISE EXCEPTION 'The books are closed through %; nothing can be posted on or before that date', closed USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_period_guard BEFORE INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_period_guard();

-- 3. Every journal balances, checked when the transaction commits.
CREATE FUNCTION ledger_journal_balanced() RETURNS trigger AS $$
DECLARE diff double precision;
BEGIN
  SELECT COALESCE(SUM("debit"), 0) - COALESCE(SUM("credit"), 0) INTO diff FROM "ledger_entries" WHERE "journal_id" = NEW."journal_id";
  IF abs(diff) > 0.005 THEN
    RAISE EXCEPTION 'Journal % does not balance (difference %)', NEW."journal_id", diff USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();

-- 4. The close / reopen history is append-only.
CREATE FUNCTION accounting_lock_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The close / reopen history cannot be changed' USING ERRCODE = '23514';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER accounting_lock_events_append_only BEFORE UPDATE OR DELETE ON "accounting_lock_events"
  FOR EACH ROW EXECUTE FUNCTION accounting_lock_events_append_only();

-- 5. A reconciled statement is final (it can be reopened, which is audited by the service, but not edited).
CREATE FUNCTION bank_statements_final() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'RECONCILED' THEN RAISE EXCEPTION 'A reconciled statement cannot be deleted' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'RECONCILED' AND NEW."status" = 'RECONCILED' THEN
    RAISE EXCEPTION 'A reconciled statement cannot be edited; reopen it first' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER bank_statements_final BEFORE UPDATE OR DELETE ON "bank_statements"
  FOR EACH ROW EXECUTE FUNCTION bank_statements_final();

CREATE FUNCTION bank_statement_lines_final() RETURNS trigger AS $$
DECLARE st "StatementStatus";
BEGIN
  SELECT "status" INTO st FROM "bank_statements" WHERE "id" = COALESCE(NEW."statement_id", OLD."statement_id");
  IF st = 'RECONCILED' THEN
    RAISE EXCEPTION 'The statement is reconciled; reopen it before changing its lines' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER bank_statement_lines_final BEFORE INSERT OR UPDATE OR DELETE ON "bank_statement_lines"
  FOR EACH ROW EXECUTE FUNCTION bank_statement_lines_final();
