-- Tools & Equipment: a one-off registration fee for tools owned by someone else, and a per-hectare contribution that applies
-- to every tool (AMCOS-owned or not). Rates default per AMCOS and a tool may carry its own. Existing tools are not charged retroactively.
ALTER TABLE "amcos_equipment" ADD COLUMN     "registration_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "registration_fee_paid_on" DATE,
ADD COLUMN     "registration_fee_status" "ActivityFeeStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

ALTER TABLE "mamcos" ADD COLUMN     "tool_fee_per_hectare" DECIMAL(12,2),
ADD COLUMN     "tool_registration_fee" DECIMAL(12,2);

ALTER TABLE "amcos_equipment" ADD CONSTRAINT "amcos_equipment_registration_fee_not_negative" CHECK ("registration_fee" >= 0);
ALTER TABLE "amcos_equipment" ADD CONSTRAINT "amcos_equipment_registration_fee_consistent" CHECK (
  ("registration_fee_status" = 'NOT_APPLICABLE' AND "registration_fee" = 0 AND "registration_fee_paid_on" IS NULL)
  OR ("registration_fee_status" = 'PENDING' AND "registration_fee" > 0 AND "registration_fee_paid_on" IS NULL)
  OR ("registration_fee_status" = 'PAID' AND "registration_fee" > 0 AND "registration_fee_paid_on" IS NOT NULL)
);
ALTER TABLE "mamcos" ADD CONSTRAINT "mamcos_tool_fees_not_negative" CHECK (COALESCE("tool_registration_fee", 0) >= 0 AND COALESCE("tool_fee_per_hectare", 0) >= 0);
