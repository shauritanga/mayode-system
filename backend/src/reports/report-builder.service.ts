import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RunBuilderDto } from './dto/reports.dto';

export type BuilderColumnType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'enum';

export type BuilderCategory =
  | 'people'
  | 'field'
  | 'leases'
  | 'commerce'
  | 'finance'
  | 'insurance'
  | 'marketplace'
  | 'membership'
  | 'governance'
  | 'alerts'
  | 'facilities'
  | 'compliance';

const CATEGORY_ORDER: BuilderCategory[] = [
  'people',
  'field',
  'leases',
  'commerce',
  'finance',
  'insurance',
  'marketplace',
  'membership',
  'governance',
  'alerts',
  'facilities',
  'compliance',
];

export interface BuilderColumn {
  key: string;
  label: string;
  type: BuilderColumnType;
}

export interface BuilderRelation {
  key: string;
  label: string;
  /** true = one-to-many: rows expand to one per related record. */
  many: boolean;
}

export interface BuilderEntity {
  key: string;
  label: string;
  noun: string;
  description: string;
  category: BuilderCategory;
  columns: BuilderColumn[];
  relations: BuilderRelation[];
}

export interface BuilderResult {
  entity: string;
  name: string;
  columns: BuilderColumn[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  grain: string;
}

type Row = Record<string, unknown>;

const PREVIEW_LIMIT = 200;
const EXPORT_LIMIT = 10_000;
const YOUTH_MAX_AGE = 35; // matches ReportsService youth breakdown

const col = (
  key: string,
  label: string,
  type: BuilderColumnType = 'string',
): BuilderColumn => ({ key, label, type });

const iso = (value: Date | null | undefined): string =>
  value ? value.toISOString() : '';

const person = (first?: string | null, last?: string | null): string =>
  [first, last].filter(Boolean).join(' ').trim();

function farmerWhere(dto: RunBuilderDto): Prisma.FarmerWhereInput {
  const where: Prisma.FarmerWhereInput = {};
  if (dto.region) where.region = dto.region;
  if (dto.district) where.district = dto.district;
  if (dto.ward) where.ward = dto.ward;
  if (dto.village) where.village = dto.village;
  if (dto.mamcosId) where.mamcosId = dto.mamcosId;
  if (dto.fieldOfficerId) where.assignedOfficerId = dto.fieldOfficerId;
  if (dto.gender) where.gender = dto.gender;
  if (dto.youthOnly) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - YOUTH_MAX_AGE);
    where.dateOfBirth = { gte: cutoff };
  }
  return where;
}

function hasFarmerFilters(dto: RunBuilderDto): boolean {
  return !!(
    dto.region ||
    dto.district ||
    dto.ward ||
    dto.village ||
    dto.mamcosId ||
    dto.fieldOfficerId ||
    dto.gender ||
    dto.youthOnly
  );
}

function farmGeoWhere(dto: RunBuilderDto): Prisma.FarmWhereInput {
  const where: Prisma.FarmWhereInput = {};
  if (dto.region) where.region = dto.region;
  if (dto.district) where.district = dto.district;
  if (dto.ward) where.ward = dto.ward;
  if (dto.village) where.village = dto.village;
  if (dto.mamcosId) where.mamcosId = dto.mamcosId;
  if (dto.gender || dto.youthOnly || dto.fieldOfficerId) {
    where.farmer = farmerWhere(dto);
  }
  return where;
}

function hasFarmGeoFilters(dto: RunBuilderDto): boolean {
  return !!(
    dto.region ||
    dto.district ||
    dto.ward ||
    dto.village ||
    dto.mamcosId ||
    dto.gender ||
    dto.youthOnly ||
    dto.fieldOfficerId
  );
}

function dateRange(dto: RunBuilderDto) {
  if (!dto.from && !dto.to) return undefined;
  return {
    ...(dto.from ? { gte: new Date(dto.from) } : {}),
    ...(dto.to ? { lte: new Date(dto.to) } : {}),
  };
}

/* ── Per-entity include trees + typed row mappers ──────────────────────────
 * The same include tree is used whether the entity is the primary data set
 * or joined onto another primary, so a column always resolves identically. */

const FARMER_INCLUDE = {
  user: { select: { phone: true } },
  mamcos: { select: { name: true } },
} satisfies Prisma.FarmerInclude;
type FarmerRec = Prisma.FarmerGetPayload<{ include: typeof FARMER_INCLUDE }>;

const FARM_INCLUDE = {
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
  mamcos: { select: { name: true } },
} satisfies Prisma.FarmInclude;
type FarmRec = Prisma.FarmGetPayload<{ include: typeof FARM_INCLUDE }>;

const CROP_CYCLE_INCLUDE = {
  farm: { select: { farmCode: true } },
  farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
} satisfies Prisma.CropCycleInclude;
type CropCycleRec = Prisma.CropCycleGetPayload<{
  include: typeof CROP_CYCLE_INCLUDE;
}>;

const SALE_INCLUDE = {
  buyer: { select: { name: true, isCertified: true } },
  lot: { select: { lotNumber: true } },
} satisfies Prisma.SaleInclude;
type SaleRec = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

const PAYMENT_INCLUDE = {
  farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
  sale: { select: { invoiceNumber: true } },
} satisfies Prisma.PaymentInclude;
type PaymentRec = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

const LOAN_INCLUDE = {
  farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
} satisfies Prisma.LoanRecordInclude;
type LoanRec = Prisma.LoanRecordGetPayload<{ include: typeof LOAN_INCLUDE }>;

const INVENTORY_INCLUDE = {
  farm: { select: { farmCode: true } },
  farmer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.InventoryRecordInclude;
type InventoryRec = Prisma.InventoryRecordGetPayload<{
  include: typeof INVENTORY_INCLUDE;
}>;

const MEMBERSHIP_INCLUDE = {
  farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
  user: { select: { phone: true } },
  plan: { select: { name: true } },
  farmingSeason: { select: { name: true } },
} satisfies Prisma.MembershipInclude;
type MembershipRec = Prisma.MembershipGetPayload<{
  include: typeof MEMBERSHIP_INCLUDE;
}>;

const PLOT_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
} satisfies Prisma.PlotInclude;
type PlotRec = Prisma.PlotGetPayload<{ include: typeof PLOT_INCLUDE }>;

const ACTIVITY_LOG_INCLUDE = {
  cropCycle: {
    select: {
      season: true,
      farm: { select: { farmCode: true } },
      farmer: {
        select: { firstName: true, lastName: true, controlNumber: true },
      },
    },
  },
  fieldOfficer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ActivityLogInclude;
type ActivityLogRec = Prisma.ActivityLogGetPayload<{
  include: typeof ACTIVITY_LOG_INCLUDE;
}>;

const FIELD_VISIT_INCLUDE = {
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
  farm: { select: { farmCode: true } },
  fieldOfficer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FieldOfficerVisitInclude;
type FieldVisitRec = Prisma.FieldOfficerVisitGetPayload<{
  include: typeof FIELD_VISIT_INCLUDE;
}>;

const RICE_TASK_INCLUDE = {
  cropCycle: {
    select: {
      season: true,
      farm: { select: { farmCode: true } },
      farmer: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.RiceCalendarTaskInclude;
type RiceTaskRec = Prisma.RiceCalendarTaskGetPayload<{
  include: typeof RICE_TASK_INCLUDE;
}>;

const FARM_VERIFICATION_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
  fieldOfficer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FarmVerificationInclude;
type FarmVerificationRec = Prisma.FarmVerificationGetPayload<{
  include: typeof FARM_VERIFICATION_INCLUDE;
}>;

const FIELD_SURVEY_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
} satisfies Prisma.FarmFieldSurveyInclude;
type FieldSurveyRec = Prisma.FarmFieldSurveyGetPayload<{
  include: typeof FIELD_SURVEY_INCLUDE;
}>;

const FARMING_SEASON_INCLUDE = {
  mamcos: { select: { name: true } },
} satisfies Prisma.FarmingSeasonInclude;
type FarmingSeasonRec = Prisma.FarmingSeasonGetPayload<{
  include: typeof FARMING_SEASON_INCLUDE;
}>;

const FARM_LEASE_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
  farmingSeason: { select: { name: true } },
  ownerFarmer: {
    select: { firstName: true, lastName: true, controlNumber: true },
  },
  renterFarmer: {
    select: { firstName: true, lastName: true, controlNumber: true },
  },
} satisfies Prisma.FarmLeaseInclude;
type FarmLeaseRec = Prisma.FarmLeaseGetPayload<{
  include: typeof FARM_LEASE_INCLUDE;
}>;

const SEASONAL_ASSIGNMENT_INCLUDE = {
  farm: { select: { farmCode: true } },
  farmingSeason: { select: { name: true } },
  activeFarmer: {
    select: { firstName: true, lastName: true, controlNumber: true },
  },
} satisfies Prisma.SeasonalFarmAssignmentInclude;
type SeasonalAssignmentRec = Prisma.SeasonalFarmAssignmentGetPayload<{
  include: typeof SEASONAL_ASSIGNMENT_INCLUDE;
}>;

const DISPUTE_INCLUDE = {
  farm: { select: { farmCode: true } },
  farmingSeason: { select: { name: true } },
} satisfies Prisma.DisputeInclude;
type DisputeRec = Prisma.DisputeGetPayload<{ include: typeof DISPUTE_INCLUDE }>;

const BUYER_INCLUDE = {} satisfies Prisma.BuyerInclude;
type BuyerRec = Prisma.BuyerGetPayload<{ include: typeof BUYER_INCLUDE }>;

const BUYER_ORDER_INCLUDE = {
  buyer: { select: { name: true } },
} satisfies Prisma.BuyerOrderInclude;
type BuyerOrderRec = Prisma.BuyerOrderGetPayload<{
  include: typeof BUYER_ORDER_INCLUDE;
}>;

const LOT_INCLUDE = {} satisfies Prisma.LotInclude;
type LotRec = Prisma.LotGetPayload<{ include: typeof LOT_INCLUDE }>;

const INVOICE_INCLUDE = {
  buyer: { select: { name: true } },
  sale: { select: { invoiceNumber: true } },
} satisfies Prisma.InvoiceInclude;
type InvoiceRec = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

const SUPPLIER_INCLUDE = {} satisfies Prisma.SupplierInclude;
type SupplierRec = Prisma.SupplierGetPayload<{
  include: typeof SUPPLIER_INCLUDE;
}>;

const ACCOUNT_INCLUDE = {} satisfies Prisma.AccountInclude;
type AccountRec = Prisma.AccountGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;

const LEDGER_ENTRY_INCLUDE = {
  account: { select: { code: true, name: true } },
} satisfies Prisma.LedgerEntryInclude;
type LedgerEntryRec = Prisma.LedgerEntryGetPayload<{
  include: typeof LEDGER_ENTRY_INCLUDE;
}>;

const PREMIUM_FUND_INCLUDE = {
  sale: { select: { invoiceNumber: true } },
} satisfies Prisma.PremiumFundEntryInclude;
type PremiumFundRec = Prisma.PremiumFundEntryGetPayload<{
  include: typeof PREMIUM_FUND_INCLUDE;
}>;

const INSURANCE_POLICY_INCLUDE = {
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
  farm: { select: { farmCode: true } },
  provider: { select: { name: true } },
} satisfies Prisma.InsurancePolicyInclude;
type InsurancePolicyRec = Prisma.InsurancePolicyGetPayload<{
  include: typeof INSURANCE_POLICY_INCLUDE;
}>;

const INSURANCE_CLAIM_INCLUDE = {
  policy: {
    select: {
      productType: true,
      farmer: {
        select: { firstName: true, lastName: true, controlNumber: true },
      },
    },
  },
} satisfies Prisma.InsuranceClaimInclude;
type InsuranceClaimRec = Prisma.InsuranceClaimGetPayload<{
  include: typeof INSURANCE_CLAIM_INCLUDE;
}>;

const LAND_LISTING_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
  owner: { select: { firstName: true, lastName: true, controlNumber: true } },
  renter: { select: { firstName: true, lastName: true, controlNumber: true } },
} satisfies Prisma.LandListingInclude;
type LandListingRec = Prisma.LandListingGetPayload<{
  include: typeof LAND_LISTING_INCLUDE;
}>;

const TRACTOR_INCLUDE = {
  owner: { select: { name: true, phone: true } },
} satisfies Prisma.TractorInclude;
type TractorRec = Prisma.TractorGetPayload<{ include: typeof TRACTOR_INCLUDE }>;

const TRACTOR_OWNER_INCLUDE = {} satisfies Prisma.TractorOwnerInclude;
type TractorOwnerRec = Prisma.TractorOwnerGetPayload<{
  include: typeof TRACTOR_OWNER_INCLUDE;
}>;

const TRACTOR_BOOKING_INCLUDE = {
  tractor: { select: { registrationNo: true } },
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
} satisfies Prisma.TractorBookingInclude;
type TractorBookingRec = Prisma.TractorBookingGetPayload<{
  include: typeof TRACTOR_BOOKING_INCLUDE;
}>;

const MARKET_PRICE_INCLUDE: Record<string, unknown> = {};
type MarketPriceRec = Prisma.MarketPriceGetPayload<object>;

const STAFF_INCLUDE = {
  user: { select: { phone: true } },
  mamcos: { select: { name: true } },
} satisfies Prisma.MamcosStaffInclude;
type StaffRec = Prisma.MamcosStaffGetPayload<{ include: typeof STAFF_INCLUDE }>;

const USER_INCLUDE = {} satisfies Prisma.UserInclude;
type UserRec = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

const AMCOS_INCLUDE = {} satisfies Prisma.MamcosInclude;
type AmcosRec = Prisma.MamcosGetPayload<{ include: typeof AMCOS_INCLUDE }>;

const VOTE_INCLUDE = {
  meeting: { select: { meetingDate: true, agenda: true } },
} satisfies Prisma.VoteInclude;
type VoteRec = Prisma.VoteGetPayload<{ include: typeof VOTE_INCLUDE }>;

const COMMUNITY_PROJECT_INCLUDE: Record<string, unknown> = {};
type CommunityProjectRec = Prisma.CommunityProjectGetPayload<object>;

const MEETING_INCLUDE = {} satisfies Prisma.MeetingRecordInclude;
type MeetingRec = Prisma.MeetingRecordGetPayload<{
  include: typeof MEETING_INCLUDE;
}>;

const REWARD_CAMPAIGN_INCLUDE = {
  farmingSeason: { select: { name: true } },
} satisfies Prisma.RewardCampaignInclude;
type RewardCampaignRec = Prisma.RewardCampaignGetPayload<{
  include: typeof REWARD_CAMPAIGN_INCLUDE;
}>;

const REWARD_WINNER_INCLUDE = {
  campaign: { select: { name: true } },
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
} satisfies Prisma.RewardWinnerInclude;
type RewardWinnerRec = Prisma.RewardWinnerGetPayload<{
  include: typeof REWARD_WINNER_INCLUDE;
}>;

const FARM_ALERT_INCLUDE = {
  farm: { select: { farmCode: true, name: true } },
} satisfies Prisma.FarmAlertInclude;
type FarmAlertRec = Prisma.FarmAlertGetPayload<{
  include: typeof FARM_ALERT_INCLUDE;
}>;

const WEATHER_ALERT_INCLUDE: Record<string, unknown> = {};
type WeatherAlertRec = Prisma.WeatherAlertGetPayload<object>;

const IRRIGATION_SCHEME_INCLUDE = {
  mamcos: { select: { name: true } },
} satisfies Prisma.IrrigationSchemeInclude;
type IrrigationSchemeRec = Prisma.IrrigationSchemeGetPayload<{
  include: typeof IRRIGATION_SCHEME_INCLUDE;
}>;

const AGGREGATION_CENTRE_INCLUDE = {
  mamcos: { select: { name: true } },
} satisfies Prisma.AggregationCentreInclude;
type AggregationCentreRec = Prisma.AggregationCentreGetPayload<{
  include: typeof AGGREGATION_CENTRE_INCLUDE;
}>;

const CONSENT_INCLUDE = {
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
} satisfies Prisma.ConsentRecordInclude;
type ConsentRec = Prisma.ConsentRecordGetPayload<{
  include: typeof CONSENT_INCLUDE;
}>;

const DOCUMENT_INCLUDE = {
  farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
  farm: { select: { farmCode: true } },
} satisfies Prisma.DocumentInclude;
type DocumentRec = Prisma.DocumentGetPayload<{
  include: typeof DOCUMENT_INCLUDE;
}>;

type DelegateKey =
  | 'farmer'
  | 'farm'
  | 'cropCycle'
  | 'sale'
  | 'payment'
  | 'loanRecord'
  | 'inventoryRecord'
  | 'membership'
  | 'plot'
  | 'activityLog'
  | 'fieldOfficerVisit'
  | 'riceCalendarTask'
  | 'farmVerification'
  | 'farmFieldSurvey'
  | 'farmingSeason'
  | 'farmLease'
  | 'seasonalFarmAssignment'
  | 'dispute'
  | 'buyer'
  | 'buyerOrder'
  | 'lot'
  | 'invoice'
  | 'supplier'
  | 'account'
  | 'ledgerEntry'
  | 'premiumFundEntry'
  | 'insurancePolicy'
  | 'insuranceClaim'
  | 'landListing'
  | 'tractor'
  | 'tractorOwner'
  | 'tractorBooking'
  | 'marketPrice'
  | 'mamcosStaff'
  | 'user'
  | 'mamcos'
  | 'vote'
  | 'communityProject'
  | 'meetingRecord'
  | 'rewardCampaign'
  | 'rewardWinner'
  | 'farmAlert'
  | 'weatherAlert'
  | 'irrigationScheme'
  | 'aggregationCentre'
  | 'consentRecord'
  | 'document';

interface EntityDef {
  key: string;
  label: string;
  /** Singular noun for grain text ("one row per farm"). */
  noun: string;
  description: string;
  category: BuilderCategory;
  delegate: DelegateKey;
  columns: BuilderColumn[];
  include: Record<string, unknown>;
  orderBy: Record<string, 'asc' | 'desc'>;
  buildWhere: (dto: RunBuilderDto) => Record<string, unknown>;
  map: (rec: unknown) => Row;
}

/* ── Join graph ────────────────────────────────────────────────────────────
 * Only pairs with a real foreign-key relation. `relation` is the Prisma
 * relation field on the PRIMARY model; `many` joins expand the row grain. */
interface JoinEdge {
  entity: string;
  relation: string;
  many: boolean;
}

const JOINS: Record<string, JoinEdge[]> = {
  farmers: [
    { entity: 'farms', relation: 'farms', many: true },
    { entity: 'crop-cycles', relation: 'cropCycles', many: true },
    { entity: 'payments', relation: 'payments', many: true },
    { entity: 'loans', relation: 'loanRecords', many: true },
    { entity: 'inventory', relation: 'inventoryRecords', many: true },
    { entity: 'memberships', relation: 'memberships', many: true },
    { entity: 'insurance-policies', relation: 'insurancePolicies', many: true },
    { entity: 'land-listings', relation: 'landListings', many: true },
    { entity: 'tractor-bookings', relation: 'tractorBookings', many: true },
    { entity: 'field-visits', relation: 'officerVisits', many: true },
    { entity: 'reward-winners', relation: 'rewardWins', many: true },
    { entity: 'consents', relation: 'consentRecords', many: true },
    { entity: 'documents', relation: 'documents', many: true },
  ],
  farms: [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'crop-cycles', relation: 'cropCycles', many: true },
    { entity: 'inventory', relation: 'inventoryRecords', many: true },
    { entity: 'plots', relation: 'plots', many: true },
    { entity: 'farm-verifications', relation: 'verifications', many: true },
    { entity: 'field-surveys', relation: 'fieldSurveys', many: true },
    { entity: 'farm-leases', relation: 'leases', many: true },
    {
      entity: 'seasonal-assignments',
      relation: 'seasonalAssignments',
      many: true,
    },
    { entity: 'land-listings', relation: 'landListings', many: true },
    { entity: 'farm-alerts', relation: 'alerts', many: true },
    { entity: 'disputes', relation: 'disputes', many: true },
    { entity: 'documents', relation: 'documents', many: true },
    { entity: 'insurance-policies', relation: 'insurancePolicies', many: true },
  ],
  'crop-cycles': [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'inventory', relation: 'inventoryRecords', many: true },
    { entity: 'activity-logs', relation: 'activities', many: true },
    { entity: 'rice-tasks', relation: 'calendarTasks', many: true },
    { entity: 'plots', relation: 'plot', many: false },
    { entity: 'insurance-policies', relation: 'insurancePolicies', many: true },
  ],
  sales: [
    { entity: 'payments', relation: 'payments', many: true },
    { entity: 'buyers', relation: 'buyer', many: false },
    { entity: 'lots', relation: 'lot', many: false },
    { entity: 'invoices', relation: 'invoice', many: false },
    { entity: 'premium-fund', relation: 'premiumFundEntries', many: true },
    { entity: 'buyer-orders', relation: 'fulfillsOrder', many: false },
  ],
  payments: [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'sales', relation: 'sale', many: false },
    { entity: 'memberships', relation: 'membership', many: false },
  ],
  loans: [{ entity: 'farmers', relation: 'farmer', many: false }],
  inventory: [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'crop-cycles', relation: 'cropCycle', many: false },
    { entity: 'lots', relation: 'lot', many: false },
  ],
  memberships: [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'payments', relation: 'payments', many: true },
    { entity: 'farming-seasons', relation: 'farmingSeason', many: false },
  ],
  plots: [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'crop-cycles', relation: 'cropCycles', many: true },
  ],
  'activity-logs': [
    { entity: 'crop-cycles', relation: 'cropCycle', many: false },
    { entity: 'staff', relation: 'fieldOfficer', many: false },
  ],
  'field-visits': [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'crop-cycles', relation: 'cropCycle', many: false },
    { entity: 'staff', relation: 'fieldOfficer', many: false },
  ],
  'rice-tasks': [{ entity: 'crop-cycles', relation: 'cropCycle', many: false }],
  'farm-verifications': [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'staff', relation: 'fieldOfficer', many: false },
  ],
  'field-surveys': [{ entity: 'farms', relation: 'farm', many: false }],
  'farming-seasons': [
    { entity: 'amcos', relation: 'mamcos', many: false },
    { entity: 'farm-leases', relation: 'leases', many: true },
    { entity: 'seasonal-assignments', relation: 'assignments', many: true },
    { entity: 'memberships', relation: 'memberships', many: true },
    { entity: 'reward-campaigns', relation: 'rewardCampaigns', many: true },
    { entity: 'disputes', relation: 'disputes', many: true },
  ],
  'farm-leases': [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farming-seasons', relation: 'farmingSeason', many: false },
    { entity: 'seasonal-assignments', relation: 'assignments', many: true },
    { entity: 'disputes', relation: 'disputes', many: true },
  ],
  'seasonal-assignments': [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farming-seasons', relation: 'farmingSeason', many: false },
    { entity: 'farmers', relation: 'activeFarmer', many: false },
    { entity: 'farm-leases', relation: 'lease', many: false },
  ],
  disputes: [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farm-leases', relation: 'lease', many: false },
    { entity: 'farming-seasons', relation: 'farmingSeason', many: false },
  ],
  buyers: [
    { entity: 'sales', relation: 'sales', many: true },
    { entity: 'buyer-orders', relation: 'orders', many: true },
    { entity: 'invoices', relation: 'invoices', many: true },
  ],
  'buyer-orders': [
    { entity: 'buyers', relation: 'buyer', many: false },
    { entity: 'sales', relation: 'sales', many: true },
  ],
  lots: [
    { entity: 'sales', relation: 'sales', many: true },
    { entity: 'inventory', relation: 'inventoryRecords', many: true },
  ],
  invoices: [
    { entity: 'buyers', relation: 'buyer', many: false },
    { entity: 'sales', relation: 'sale', many: false },
  ],
  suppliers: [],
  accounts: [{ entity: 'ledger-entries', relation: 'entries', many: true }],
  'ledger-entries': [{ entity: 'accounts', relation: 'account', many: false }],
  'premium-fund': [{ entity: 'sales', relation: 'sale', many: false }],
  'insurance-policies': [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'crop-cycles', relation: 'cropCycle', many: false },
    { entity: 'insurance-claims', relation: 'claims', many: true },
  ],
  'insurance-claims': [
    { entity: 'insurance-policies', relation: 'policy', many: false },
  ],
  'land-listings': [
    { entity: 'farms', relation: 'farm', many: false },
    { entity: 'farmers', relation: 'owner', many: false },
  ],
  tractors: [
    { entity: 'tractor-owners', relation: 'owner', many: false },
    { entity: 'tractor-bookings', relation: 'bookings', many: true },
  ],
  'tractor-owners': [{ entity: 'tractors', relation: 'tractors', many: true }],
  'tractor-bookings': [
    { entity: 'tractors', relation: 'tractor', many: false },
    { entity: 'farmers', relation: 'farmer', many: false },
  ],
  'market-prices': [],
  staff: [
    { entity: 'amcos', relation: 'mamcos', many: false },
    { entity: 'users', relation: 'user', many: false },
    { entity: 'farm-verifications', relation: 'farmVerifications', many: true },
    { entity: 'field-visits', relation: 'visits', many: true },
    { entity: 'activity-logs', relation: 'activityLogs', many: true },
  ],
  users: [{ entity: 'farmers', relation: 'farmer', many: false }],
  amcos: [
    { entity: 'farmers', relation: 'farmers', many: true },
    { entity: 'farms', relation: 'farms', many: true },
    { entity: 'staff', relation: 'staff', many: true },
    { entity: 'irrigation-schemes', relation: 'irrigationSchemes', many: true },
    {
      entity: 'aggregation-centres',
      relation: 'aggregationCentres',
      many: true,
    },
    { entity: 'farming-seasons', relation: 'farmingSeasons', many: true },
  ],
  votes: [{ entity: 'meetings', relation: 'meeting', many: false }],
  'community-projects': [],
  meetings: [{ entity: 'votes', relation: 'votes', many: true }],
  'reward-campaigns': [
    { entity: 'farming-seasons', relation: 'farmingSeason', many: false },
    { entity: 'reward-winners', relation: 'winners', many: true },
  ],
  'reward-winners': [
    { entity: 'reward-campaigns', relation: 'campaign', many: false },
    { entity: 'farmers', relation: 'farmer', many: false },
  ],
  'farm-alerts': [{ entity: 'farms', relation: 'farm', many: false }],
  'weather-alerts': [],
  'irrigation-schemes': [{ entity: 'amcos', relation: 'mamcos', many: false }],
  'aggregation-centres': [{ entity: 'amcos', relation: 'mamcos', many: false }],
  consents: [{ entity: 'farmers', relation: 'farmer', many: false }],
  documents: [
    { entity: 'farmers', relation: 'farmer', many: false },
    { entity: 'farms', relation: 'farm', many: false },
  ],
};

const DEFS: Record<string, EntityDef> = {
  farmers: {
    key: 'farmers',
    label: 'Farmers',
    noun: 'farmer',
    description:
      'Registered farmer directory — identity, location, cooperative and verification.',
    category: 'people',
    delegate: 'farmer',
    include: FARMER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmerWhereInput = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.membershipDate = range;
      return where;
    },
    map: (rec) => {
      const f = rec as FarmerRec;
      return {
        controlNumber: f.controlNumber,
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.user.phone,
        gender: f.gender ?? '',
        dateOfBirth: iso(f.dateOfBirth),
        village: f.village ?? '',
        ward: f.ward ?? '',
        district: f.district ?? '',
        region: f.region ?? '',
        cooperative: f.mamcos?.name ?? '',
        verificationStatus: f.verificationStatus,
        creditScore: f.creditScore,
        isBlacklisted: f.isBlacklisted,
        membershipDate: iso(f.membershipDate),
      };
    },
    columns: [
      col('controlNumber', 'Control number'),
      col('firstName', 'First name'),
      col('lastName', 'Last name'),
      col('phone', 'Phone'),
      col('gender', 'Gender', 'enum'),
      col('dateOfBirth', 'Date of birth', 'date'),
      col('village', 'Village'),
      col('ward', 'Ward'),
      col('district', 'District'),
      col('region', 'Region'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('verificationStatus', 'Verification', 'enum'),
      col('creditScore', 'Credit score', 'number'),
      col('isBlacklisted', 'Blacklisted', 'boolean'),
      col('membershipDate', 'Member since', 'date'),
    ],
  },
  farms: {
    key: 'farms',
    label: 'Farms',
    noun: 'farm',
    description:
      'Mapped farms — size, grade, irrigation and verification status.',
    category: 'field',
    delegate: 'farm',
    include: FARM_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmWhereInput = farmGeoWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const f = rec as FarmRec;
      return {
        farmCode: f.farmCode,
        name: f.name,
        owner: f.farmer
          ? person(f.farmer.firstName, f.farmer.lastName)
          : (f.ownerName ?? ''),
        ownerControlNumber: f.farmer?.controlNumber ?? '',
        village: f.village ?? '',
        ward: f.ward ?? '',
        district: f.district ?? '',
        region: f.region ?? '',
        socialHectares: f.socialHectares,
        actualAcres: f.actualAcres ?? '',
        grade: f.grade,
        hasIrrigation: f.hasIrrigation,
        isVerified: f.isVerified,
        isAvailableForRent: f.isAvailableForRent,
        cooperative: f.mamcos?.name ?? '',
        createdAt: iso(f.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('name', 'Farm name'),
      col('owner', 'Owner / registered farmer'),
      col('ownerControlNumber', 'Owner control no.'),
      col('village', 'Village'),
      col('ward', 'Ward'),
      col('district', 'District'),
      col('region', 'Region'),
      col('socialHectares', 'Hectares (social)', 'number'),
      col('actualAcres', 'Acres (GPS)', 'number'),
      col('grade', 'Grade', 'enum'),
      col('hasIrrigation', 'Irrigated', 'boolean'),
      col('isVerified', 'Verified', 'boolean'),
      col('isAvailableForRent', 'Available for rent', 'boolean'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  'crop-cycles': {
    key: 'crop-cycles',
    label: 'Crop cycles',
    noun: 'crop cycle',
    description:
      'Seasonal production records — varieties, dates, yields and status.',
    category: 'field',
    delegate: 'cropCycle',
    include: CROP_CYCLE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.CropCycleWhereInput = {};
      if (dto.season) where.season = dto.season;
      if (dto.riceVariety) where.riceVariety = dto.riceVariety;
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const c = rec as CropCycleRec;
      return {
        farmCode: c.farm.farmCode,
        farmer: person(c.farmer.firstName, c.farmer.lastName),
        farmerControlNumber: c.farmer.controlNumber,
        season: c.season,
        riceVariety: c.riceVariety ?? '',
        plantingDate: iso(c.plantingDate),
        expectedHarvest: iso(c.expectedHarvest),
        harvestDate: iso(c.harvestDate),
        estimatedYieldKg: c.estimatedYieldKg ?? '',
        actualYieldKg: c.actualYieldKg ?? '',
        status: c.status,
        createdAt: iso(c.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('season', 'Season'),
      col('riceVariety', 'Rice variety'),
      col('plantingDate', 'Planting date', 'date'),
      col('expectedHarvest', 'Expected harvest', 'date'),
      col('harvestDate', 'Harvest date', 'date'),
      col('estimatedYieldKg', 'Estimated yield (kg)', 'number'),
      col('actualYieldKg', 'Actual yield (kg)', 'number'),
      col('status', 'Status', 'enum'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  sales: {
    key: 'sales',
    label: 'Sales',
    noun: 'sale',
    description:
      'Cooperative sales register — invoices, buyers, quantities and revenue.',
    category: 'commerce',
    delegate: 'sale',
    include: SALE_INCLUDE,
    orderBy: { saleDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.SaleWhereInput = {};
      if (dto.riceVariety) where.riceVariety = dto.riceVariety;
      const range = dateRange(dto);
      if (range) where.saleDate = range;
      return where;
    },
    map: (rec) => {
      const s = rec as SaleRec;
      return {
        invoiceNumber: s.invoiceNumber,
        saleDate: iso(s.saleDate),
        buyer: s.buyer.name,
        buyerCertified: s.buyer.isCertified,
        lotNumber: s.lot.lotNumber,
        riceVariety: s.riceVariety ?? '',
        quantityKg: s.quantityKg,
        pricePerKg: s.pricePerKg,
        totalRevenue: s.totalRevenue,
        fairtradePremium: s.fairtradePremium ?? 0,
        paymentReceived: s.paymentReceived,
        paymentDate: iso(s.paymentDate),
      };
    },
    columns: [
      col('invoiceNumber', 'Invoice no.'),
      col('saleDate', 'Sale date', 'date'),
      col('buyer', 'Buyer'),
      col('buyerCertified', 'Buyer certified', 'boolean'),
      col('lotNumber', 'Lot'),
      col('riceVariety', 'Rice variety'),
      col('quantityKg', 'Quantity (kg)', 'number'),
      col('pricePerKg', 'Price / kg (TZS)', 'number'),
      col('totalRevenue', 'Total revenue (TZS)', 'number'),
      col('fairtradePremium', 'Fairtrade premium (TZS)', 'number'),
      col('paymentReceived', 'Payment received', 'boolean'),
      col('paymentDate', 'Payment date', 'date'),
    ],
  },
  payments: {
    key: 'payments',
    label: 'Payments',
    noun: 'payment',
    description:
      'Farmer payments — gross amounts, loan deductions and net payouts.',
    category: 'commerce',
    delegate: 'payment',
    include: PAYMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.PaymentWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const p = rec as PaymentRec;
      return {
        farmer: person(p.farmer.firstName, p.farmer.lastName),
        farmerControlNumber: p.farmer.controlNumber,
        invoiceNumber: p.sale?.invoiceNumber ?? '',
        amount: p.amount,
        loanDeduction: p.loanDeduction ?? 0,
        netAmount: p.netAmount ?? p.amount,
        paymentType: p.paymentType,
        status: p.status,
        orderReference: p.orderReference ?? '',
        paidAt: iso(p.paidAt),
        createdAt: iso(p.createdAt),
        description: p.description ?? '',
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('invoiceNumber', 'Sale invoice'),
      col('amount', 'Amount (TZS)', 'number'),
      col('loanDeduction', 'Loan deduction (TZS)', 'number'),
      col('netAmount', 'Net paid (TZS)', 'number'),
      col('paymentType', 'Type', 'enum'),
      col('status', 'Status', 'enum'),
      col('orderReference', 'Order reference'),
      col('paidAt', 'Paid at', 'date'),
      col('createdAt', 'Recorded on', 'date'),
      col('description', 'Description'),
    ],
  },
  loans: {
    key: 'loans',
    label: 'Loans',
    noun: 'loan',
    description:
      'Loan records — lenders, principal, outstanding balance and auto-deduction.',
    category: 'commerce',
    delegate: 'loanRecord',
    include: LOAN_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.LoanRecordWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const l = rec as LoanRec;
      return {
        farmer: person(l.farmer.firstName, l.farmer.lastName),
        farmerControlNumber: l.farmer.controlNumber,
        lenderName: l.lenderName,
        originalAmount: l.originalAmount,
        amountOwed: l.amountOwed,
        autoDeductPercent: l.autoDeductPercent ?? '',
        isActive: l.isActive,
        createdAt: iso(l.createdAt),
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('lenderName', 'Lender'),
      col('originalAmount', 'Principal (TZS)', 'number'),
      col('amountOwed', 'Outstanding (TZS)', 'number'),
      col('autoDeductPercent', 'Auto-deduct %', 'number'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Issued on', 'date'),
    ],
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory',
    noun: 'intake record',
    description:
      'Warehouse intake records — weights, grades, moisture and traceability codes.',
    category: 'commerce',
    delegate: 'inventoryRecord',
    include: INVENTORY_INCLUDE,
    orderBy: { receivedDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.InventoryRecordWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.receivedDate = range;
      return where;
    },
    map: (rec) => {
      const r = rec as InventoryRec;
      return {
        trackingCode: r.trackingCode,
        lotNumber: r.lotNumber ?? '',
        farmCode: r.farm.farmCode,
        farmer: person(r.farmer.firstName, r.farmer.lastName),
        weightKg: r.weightKg,
        qualityGrade: r.qualityGrade ?? '',
        moistureContentPct: r.moistureContentPct ?? '',
        warehouseLocation: r.warehouseLocation ?? '',
        receivedDate: iso(r.receivedDate),
        status: r.status,
      };
    },
    columns: [
      col('trackingCode', 'Tracking code'),
      col('lotNumber', 'Lot'),
      col('farmCode', 'Farm code'),
      col('farmer', 'Farmer'),
      col('weightKg', 'Weight (kg)', 'number'),
      col('qualityGrade', 'Quality grade'),
      col('moistureContentPct', 'Moisture %', 'number'),
      col('warehouseLocation', 'Warehouse'),
      col('receivedDate', 'Received on', 'date'),
      col('status', 'Status', 'enum'),
    ],
  },
  memberships: {
    key: 'memberships',
    label: 'Memberships',
    noun: 'membership',
    description:
      'Membership roster — plans, seasons, payment and activation status.',
    category: 'membership',
    delegate: 'membership',
    include: MEMBERSHIP_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.MembershipWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = { is: farmerWhere(dto) };
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const m = rec as MembershipRec;
      return {
        farmer: m.farmer ? person(m.farmer.firstName, m.farmer.lastName) : '',
        farmerControlNumber: m.farmer?.controlNumber ?? '',
        phone: m.user.phone,
        plan: m.plan.name,
        season: m.farmingSeason?.name ?? '',
        status: m.status,
        paymentStatus: m.paymentStatus,
        amountTzs: m.amountTzs ?? '',
        startDate: iso(m.startDate),
        endDate: iso(m.endDate),
        createdAt: iso(m.createdAt),
      };
    },
    columns: [
      col('farmer', 'Member'),
      col('farmerControlNumber', 'Member control no.'),
      col('phone', 'Phone'),
      col('plan', 'Plan'),
      col('season', 'Season'),
      col('status', 'Status', 'enum'),
      col('paymentStatus', 'Payment', 'enum'),
      col('amountTzs', 'Amount (TZS)', 'number'),
      col('startDate', 'Starts', 'date'),
      col('endDate', 'Ends', 'date'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },

  /* ── Field ─────────────────────────────────────────────────────────────── */
  plots: {
    key: 'plots',
    label: 'Plots',
    noun: 'plot',
    description: 'Farm plots — codes, size, soil and irrigation status.',
    category: 'field',
    delegate: 'plot',
    include: PLOT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.PlotWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const p = rec as PlotRec;
      return {
        plotCode: p.plotCode,
        name: p.name ?? '',
        farmCode: p.farm.farmCode,
        farmName: p.farm.name,
        sizeAcres: p.sizeAcres ?? '',
        soilCondition: p.soilCondition ?? '',
        irrigationStatus: p.irrigationStatus ?? '',
        currentStage: p.currentStage ?? '',
        createdAt: iso(p.createdAt),
      };
    },
    columns: [
      col('plotCode', 'Plot code'),
      col('name', 'Plot name'),
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('sizeAcres', 'Size (acres)', 'number'),
      col('soilCondition', 'Soil condition'),
      col('irrigationStatus', 'Irrigation'),
      col('currentStage', 'Current stage'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'activity-logs': {
    key: 'activity-logs',
    label: 'Activity logs',
    noun: 'activity',
    description:
      'Field activity records — type, labour, inputs and GPS evidence.',
    category: 'field',
    delegate: 'activityLog',
    include: ACTIVITY_LOG_INCLUDE,
    orderBy: { activityDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.ActivityLogWhereInput = {};
      if (hasFarmerFilters(dto) || dto.season || dto.riceVariety) {
        where.cropCycle = {
          ...(dto.season ? { season: dto.season } : {}),
          ...(dto.riceVariety ? { riceVariety: dto.riceVariety } : {}),
          ...(hasFarmerFilters(dto) ? { farmer: farmerWhere(dto) } : {}),
        };
      }
      const range = dateRange(dto);
      if (range) where.activityDate = range;
      return where;
    },
    map: (rec) => {
      const a = rec as ActivityLogRec;
      return {
        farmCode: a.cropCycle.farm.farmCode,
        farmer: person(
          a.cropCycle.farmer.firstName,
          a.cropCycle.farmer.lastName,
        ),
        farmerControlNumber: a.cropCycle.farmer.controlNumber,
        season: a.cropCycle.season,
        activityType: a.activityType,
        activityDate: iso(a.activityDate),
        description: a.description ?? '',
        laborWorkers: a.laborWorkers ?? '',
        laborHours: a.laborHours ?? '',
        officer: a.fieldOfficer
          ? person(a.fieldOfficer.firstName, a.fieldOfficer.lastName)
          : '',
        createdAt: iso(a.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('season', 'Season'),
      col('activityType', 'Activity', 'enum'),
      col('activityDate', 'Activity date', 'date'),
      col('description', 'Description'),
      col('laborWorkers', 'Labourers', 'number'),
      col('laborHours', 'Labour hours', 'number'),
      col('officer', 'Field officer'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  'field-visits': {
    key: 'field-visits',
    label: 'Field visits',
    noun: 'field visit',
    description: 'Officer farm visits — purpose, notes and visit timestamps.',
    category: 'field',
    delegate: 'fieldOfficerVisit',
    include: FIELD_VISIT_INCLUDE,
    orderBy: { visitedAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FieldOfficerVisitWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      if (dto.fieldOfficerId) where.fieldOfficerId = dto.fieldOfficerId;
      const range = dateRange(dto);
      if (range) where.visitedAt = range;
      return where;
    },
    map: (rec) => {
      const v = rec as FieldVisitRec;
      return {
        farmer: person(v.farmer.firstName, v.farmer.lastName),
        farmerControlNumber: v.farmer.controlNumber,
        farmCode: v.farm?.farmCode ?? '',
        officer: person(v.fieldOfficer.firstName, v.fieldOfficer.lastName),
        purpose: v.purpose,
        notes: v.notes ?? '',
        visitedAt: iso(v.visitedAt),
        createdAt: iso(v.createdAt),
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('farmCode', 'Farm code'),
      col('officer', 'Field officer'),
      col('purpose', 'Purpose', 'enum'),
      col('notes', 'Notes'),
      col('visitedAt', 'Visited at', 'date'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  'rice-tasks': {
    key: 'rice-tasks',
    label: 'Rice calendar tasks',
    noun: 'calendar task',
    description:
      'Protocol tasks on crop cycles — due dates, status and completion.',
    category: 'field',
    delegate: 'riceCalendarTask',
    include: RICE_TASK_INCLUDE,
    orderBy: { dueDate: 'asc' },
    buildWhere: (dto) => {
      const where: Prisma.RiceCalendarTaskWhereInput = {};
      if (hasFarmerFilters(dto) || dto.season || dto.riceVariety) {
        where.cropCycle = {
          ...(dto.season ? { season: dto.season } : {}),
          ...(dto.riceVariety ? { riceVariety: dto.riceVariety } : {}),
          ...(hasFarmerFilters(dto) ? { farmer: farmerWhere(dto) } : {}),
        };
      }
      const range = dateRange(dto);
      if (range) where.dueDate = range;
      return where;
    },
    map: (rec) => {
      const t = rec as RiceTaskRec;
      return {
        farmCode: t.cropCycle.farm.farmCode,
        farmer: person(
          t.cropCycle.farmer.firstName,
          t.cropCycle.farmer.lastName,
        ),
        season: t.cropCycle.season,
        taskKey: t.taskKey,
        title: t.title,
        activityType: t.activityType ?? '',
        dueDate: iso(t.dueDate),
        status: t.status,
        evidenceRequired: t.evidenceRequired,
        completedAt: iso(t.completedAt),
        createdAt: iso(t.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmer', 'Farmer'),
      col('season', 'Season'),
      col('taskKey', 'Task key'),
      col('title', 'Title'),
      col('activityType', 'Activity type', 'enum'),
      col('dueDate', 'Due date', 'date'),
      col('status', 'Status', 'enum'),
      col('evidenceRequired', 'Evidence required', 'boolean'),
      col('completedAt', 'Completed at', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'farm-verifications': {
    key: 'farm-verifications',
    label: 'Farm verifications',
    noun: 'farm verification',
    description:
      'Officer farm verification visits — GPS, neighbours and approval.',
    category: 'field',
    delegate: 'farmVerification',
    include: FARM_VERIFICATION_INCLUDE,
    orderBy: { verifiedAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmVerificationWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      if (dto.fieldOfficerId) where.fieldOfficerId = dto.fieldOfficerId;
      const range = dateRange(dto);
      if (range) where.verifiedAt = range;
      return where;
    },
    map: (rec) => {
      const v = rec as FarmVerificationRec;
      return {
        farmCode: v.farm.farmCode,
        farmName: v.farm.name,
        officer: person(v.fieldOfficer.firstName, v.fieldOfficer.lastName),
        verifiedAt: iso(v.verifiedAt),
        gpsVerified: v.gpsVerified,
        neighborLeft: v.neighborLeft ?? '',
        neighborRight: v.neighborRight ?? '',
        mamcosApproved: v.mamcosApproved,
        notes: v.notes ?? '',
        createdAt: iso(v.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('officer', 'Field officer'),
      col('verifiedAt', 'Verified at', 'date'),
      col('gpsVerified', 'GPS verified', 'boolean'),
      col('neighborLeft', 'Neighbour left'),
      col('neighborRight', 'Neighbour right'),
      col('mamcosApproved', 'AMCOS approved', 'boolean'),
      col('notes', 'Notes'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  'field-surveys': {
    key: 'field-surveys',
    label: 'Field surveys',
    noun: 'field survey',
    description:
      'Physical farm surveys — soil, road access, water and flood risk.',
    category: 'field',
    delegate: 'farmFieldSurvey',
    include: FIELD_SURVEY_INCLUDE,
    orderBy: { surveyDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmFieldSurveyWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      const range = dateRange(dto);
      if (range) where.surveyDate = range;
      return where;
    },
    map: (rec) => {
      const s = rec as FieldSurveyRec;
      return {
        farmCode: s.farm.farmCode,
        farmName: s.farm.name,
        surveyDate: iso(s.surveyDate),
        source: s.source,
        soilPh: s.soilPh ?? '',
        soilTexture: s.soilTexture ?? '',
        roadAccessQuality: s.roadAccessQuality ?? '',
        waterSource: s.waterSource ?? '',
        floodRisk: s.floodRisk ?? '',
        slope: s.slope ?? '',
        observations: s.observations ?? '',
        createdAt: iso(s.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('surveyDate', 'Survey date', 'date'),
      col('source', 'Source', 'enum'),
      col('soilPh', 'Soil pH', 'number'),
      col('soilTexture', 'Soil texture'),
      col('roadAccessQuality', 'Road access'),
      col('waterSource', 'Water source'),
      col('floodRisk', 'Flood risk'),
      col('slope', 'Slope'),
      col('observations', 'Observations'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },

  /* ── Leases ────────────────────────────────────────────────────────────── */
  'farming-seasons': {
    key: 'farming-seasons',
    label: 'Farming seasons',
    noun: 'farming season',
    description: 'Season calendar — registration windows, crop and status.',
    category: 'leases',
    delegate: 'farmingSeason',
    include: FARMING_SEASON_INCLUDE,
    orderBy: { startDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmingSeasonWhereInput = {};
      if (dto.region) where.region = dto.region;
      if (dto.mamcosId) where.mamcosId = dto.mamcosId;
      if (dto.season) where.name = dto.season;
      const range = dateRange(dto);
      if (range) where.startDate = range;
      return where;
    },
    map: (rec) => {
      const s = rec as FarmingSeasonRec;
      return {
        name: s.name,
        cooperative: s.mamcos?.name ?? '',
        region: s.region ?? '',
        crop: s.crop ?? '',
        startDate: iso(s.startDate),
        endDate: iso(s.endDate),
        registrationOpenDate: iso(s.registrationOpenDate),
        registrationCloseDate: iso(s.registrationCloseDate),
        status: s.status,
        createdAt: iso(s.createdAt),
      };
    },
    columns: [
      col('name', 'Season'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('region', 'Region'),
      col('crop', 'Crop'),
      col('startDate', 'Starts', 'date'),
      col('endDate', 'Ends', 'date'),
      col('registrationOpenDate', 'Registration opens', 'date'),
      col('registrationCloseDate', 'Registration closes', 'date'),
      col('status', 'Status', 'enum'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'farm-leases': {
    key: 'farm-leases',
    label: 'Farm leases',
    noun: 'farm lease',
    description:
      'Seasonal farm leases — owner, renter and confirmation status.',
    category: 'leases',
    delegate: 'farmLease',
    include: FARM_LEASE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmLeaseWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      if (dto.season) where.farmingSeason = { name: dto.season };
      const range = dateRange(dto);
      if (range) where.leaseStartDate = range;
      return where;
    },
    map: (rec) => {
      const l = rec as FarmLeaseRec;
      return {
        farmCode: l.farm.farmCode,
        farmName: l.farm.name,
        season: l.farmingSeason.name,
        owner: l.ownerFarmer
          ? person(l.ownerFarmer.firstName, l.ownerFarmer.lastName)
          : '',
        ownerControlNumber: l.ownerFarmer?.controlNumber ?? '',
        renter: l.renterFarmer
          ? person(l.renterFarmer.firstName, l.renterFarmer.lastName)
          : (l.renterName ?? ''),
        renterPhone: l.renterPhone,
        leaseStartDate: iso(l.leaseStartDate),
        leaseEndDate: iso(l.leaseEndDate),
        status: l.status,
        ownerConfirmation: l.ownerConfirmationStatus,
        renterConfirmation: l.renterConfirmationStatus,
        officerConfirmation: l.officerConfirmationStatus,
        createdAt: iso(l.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('season', 'Season'),
      col('owner', 'Owner'),
      col('ownerControlNumber', 'Owner control no.'),
      col('renter', 'Renter'),
      col('renterPhone', 'Renter phone'),
      col('leaseStartDate', 'Lease starts', 'date'),
      col('leaseEndDate', 'Lease ends', 'date'),
      col('status', 'Status', 'enum'),
      col('ownerConfirmation', 'Owner confirmation', 'enum'),
      col('renterConfirmation', 'Renter confirmation', 'enum'),
      col('officerConfirmation', 'Officer confirmation', 'enum'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'seasonal-assignments': {
    key: 'seasonal-assignments',
    label: 'Seasonal assignments',
    noun: 'seasonal assignment',
    description: 'Who farms each plot in a season — owner-operated or rented.',
    category: 'leases',
    delegate: 'seasonalFarmAssignment',
    include: SEASONAL_ASSIGNMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.SeasonalFarmAssignmentWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      if (hasFarmerFilters(dto)) where.activeFarmer = farmerWhere(dto);
      if (dto.season) where.farmingSeason = { name: dto.season };
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const a = rec as SeasonalAssignmentRec;
      return {
        farmCode: a.farm.farmCode,
        season: a.farmingSeason.name,
        farmer: person(a.activeFarmer.firstName, a.activeFarmer.lastName),
        farmerControlNumber: a.activeFarmer.controlNumber,
        assignmentType: a.assignmentType,
        status: a.status,
        createdAt: iso(a.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('season', 'Season'),
      col('farmer', 'Active farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('assignmentType', 'Assignment type', 'enum'),
      col('status', 'Status', 'enum'),
      col('createdAt', 'Assigned on', 'date'),
    ],
  },
  disputes: {
    key: 'disputes',
    label: 'Disputes',
    noun: 'dispute',
    description: 'Ownership and rental disputes — type, status and resolution.',
    category: 'leases',
    delegate: 'dispute',
    include: DISPUTE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.DisputeWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      if (dto.season) where.farmingSeason = { name: dto.season };
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const d = rec as DisputeRec;
      return {
        farmCode: d.farm?.farmCode ?? '',
        season: d.farmingSeason?.name ?? '',
        type: d.type,
        description: d.description,
        status: d.status,
        resolution: d.resolution ?? '',
        resolvedAt: iso(d.resolvedAt),
        createdAt: iso(d.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('season', 'Season'),
      col('type', 'Type', 'enum'),
      col('description', 'Description'),
      col('status', 'Status', 'enum'),
      col('resolution', 'Resolution'),
      col('resolvedAt', 'Resolved at', 'date'),
      col('createdAt', 'Raised on', 'date'),
    ],
  },

  /* ── Commerce ──────────────────────────────────────────────────────────── */
  buyers: {
    key: 'buyers',
    label: 'Buyers',
    noun: 'buyer',
    description: 'Buyer directory — contacts and Fairtrade certification.',
    category: 'commerce',
    delegate: 'buyer',
    include: BUYER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.BuyerWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const b = rec as BuyerRec;
      return {
        name: b.name,
        contactPerson: b.contactPerson ?? '',
        contactPhone: b.contactPhone ?? '',
        contactEmail: b.contactEmail ?? '',
        fairtradeCertNumber: b.fairtradeCertNumber ?? '',
        isCertified: b.isCertified,
        createdAt: iso(b.createdAt),
      };
    },
    columns: [
      col('name', 'Buyer'),
      col('contactPerson', 'Contact person'),
      col('contactPhone', 'Phone'),
      col('contactEmail', 'Email'),
      col('fairtradeCertNumber', 'Fairtrade cert no.'),
      col('isCertified', 'Certified', 'boolean'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  'buyer-orders': {
    key: 'buyer-orders',
    label: 'Buyer orders',
    noun: 'buyer order',
    description:
      'Buyer demand orders — variety, quantity and fulfilment status.',
    category: 'commerce',
    delegate: 'buyerOrder',
    include: BUYER_ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.BuyerOrderWhereInput = {};
      if (dto.riceVariety) where.riceVariety = dto.riceVariety;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const o = rec as BuyerOrderRec;
      return {
        buyer: o.buyer.name,
        riceVariety: o.riceVariety ?? '',
        quantityRequiredKg: o.quantityRequiredKg,
        qualityRequirements: o.qualityRequirements ?? '',
        status: o.status,
        requiredByDate: iso(o.requiredByDate),
        notes: o.notes ?? '',
        createdAt: iso(o.createdAt),
      };
    },
    columns: [
      col('buyer', 'Buyer'),
      col('riceVariety', 'Rice variety'),
      col('quantityRequiredKg', 'Quantity required (kg)', 'number'),
      col('qualityRequirements', 'Quality requirements'),
      col('status', 'Status', 'enum'),
      col('requiredByDate', 'Required by', 'date'),
      col('notes', 'Notes'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  lots: {
    key: 'lots',
    label: 'Lots',
    noun: 'lot',
    description: 'Warehouse lots — lot number, weight and variety.',
    category: 'commerce',
    delegate: 'lot',
    include: LOT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.LotWhereInput = {};
      if (dto.riceVariety) where.riceVariety = dto.riceVariety;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const l = rec as LotRec;
      return {
        lotNumber: l.lotNumber,
        totalWeightKg: l.totalWeightKg,
        riceVariety: l.riceVariety ?? '',
        createdAt: iso(l.createdAt),
      };
    },
    columns: [
      col('lotNumber', 'Lot number'),
      col('totalWeightKg', 'Total weight (kg)', 'number'),
      col('riceVariety', 'Rice variety'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  invoices: {
    key: 'invoices',
    label: 'Invoices',
    noun: 'invoice',
    description: 'Buyer invoices — amounts, due dates and payment status.',
    category: 'commerce',
    delegate: 'invoice',
    include: INVOICE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.InvoiceWhereInput = {};
      const range = dateRange(dto);
      if (range) where.dueDate = range;
      return where;
    },
    map: (rec) => {
      const i = rec as InvoiceRec;
      return {
        invoiceNumber: i.invoiceNumber,
        saleInvoice: i.sale?.invoiceNumber ?? '',
        buyer: i.buyer?.name ?? '',
        amount: i.amount,
        dueDate: iso(i.dueDate),
        status: i.status,
        paidAt: iso(i.paidAt),
        createdAt: iso(i.createdAt),
      };
    },
    columns: [
      col('invoiceNumber', 'Invoice no.'),
      col('saleInvoice', 'Sale invoice'),
      col('buyer', 'Buyer'),
      col('amount', 'Amount (TZS)', 'number'),
      col('dueDate', 'Due date', 'date'),
      col('status', 'Status', 'enum'),
      col('paidAt', 'Paid at', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  suppliers: {
    key: 'suppliers',
    label: 'Suppliers',
    noun: 'supplier',
    description: 'Input suppliers — contacts and items supplied.',
    category: 'commerce',
    delegate: 'supplier',
    include: SUPPLIER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.SupplierWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const s = rec as SupplierRec;
      return {
        name: s.name,
        contactPerson: s.contactPerson ?? '',
        contactPhone: s.contactPhone ?? '',
        contactEmail: s.contactEmail ?? '',
        itemsSupplied: (s.itemsSupplied ?? []).join(', '),
        isActive: s.isActive,
        createdAt: iso(s.createdAt),
      };
    },
    columns: [
      col('name', 'Supplier'),
      col('contactPerson', 'Contact person'),
      col('contactPhone', 'Phone'),
      col('contactEmail', 'Email'),
      col('itemsSupplied', 'Items supplied'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },

  /* ── Finance ───────────────────────────────────────────────────────────── */
  accounts: {
    key: 'accounts',
    label: 'Accounts',
    noun: 'account',
    description: 'Chart of accounts — codes, types and active status.',
    category: 'finance',
    delegate: 'account',
    include: ACCOUNT_INCLUDE,
    orderBy: { code: 'asc' },
    buildWhere: (dto) => {
      const where: Prisma.AccountWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const a = rec as AccountRec;
      return {
        code: a.code,
        name: a.name,
        type: a.type,
        isActive: a.isActive,
        createdAt: iso(a.createdAt),
      };
    },
    columns: [
      col('code', 'Account code'),
      col('name', 'Account name'),
      col('type', 'Type', 'enum'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'ledger-entries': {
    key: 'ledger-entries',
    label: 'Ledger entries',
    noun: 'ledger entry',
    description: 'General ledger postings — debits, credits and sources.',
    category: 'finance',
    delegate: 'ledgerEntry',
    include: LEDGER_ENTRY_INCLUDE,
    orderBy: { entryDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.LedgerEntryWhereInput = {};
      const range = dateRange(dto);
      if (range) where.entryDate = range;
      return where;
    },
    map: (rec) => {
      const e = rec as LedgerEntryRec;
      return {
        entryNumber: e.entryNumber,
        accountCode: e.account.code,
        accountName: e.account.name,
        debit: e.debit,
        credit: e.credit,
        entryDate: iso(e.entryDate),
        sourceType: e.sourceType,
        description: e.description ?? '',
        createdAt: iso(e.createdAt),
      };
    },
    columns: [
      col('entryNumber', 'Entry no.'),
      col('accountCode', 'Account code'),
      col('accountName', 'Account name'),
      col('debit', 'Debit (TZS)', 'number'),
      col('credit', 'Credit (TZS)', 'number'),
      col('entryDate', 'Entry date', 'date'),
      col('sourceType', 'Source type'),
      col('description', 'Description'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  'premium-fund': {
    key: 'premium-fund',
    label: 'Premium fund',
    noun: 'premium fund entry',
    description: 'Fairtrade premium fund — income and expenditure entries.',
    category: 'finance',
    delegate: 'premiumFundEntry',
    include: PREMIUM_FUND_INCLUDE,
    orderBy: { entryDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.PremiumFundEntryWhereInput = {};
      const range = dateRange(dto);
      if (range) where.entryDate = range;
      return where;
    },
    map: (rec) => {
      const e = rec as PremiumFundRec;
      return {
        entryType: e.entryType,
        amount: e.amount,
        description: e.description,
        saleInvoice: e.sale?.invoiceNumber ?? '',
        entryDate: iso(e.entryDate),
        createdAt: iso(e.createdAt),
      };
    },
    columns: [
      col('entryType', 'Entry type', 'enum'),
      col('amount', 'Amount (TZS)', 'number'),
      col('description', 'Description'),
      col('saleInvoice', 'Sale invoice'),
      col('entryDate', 'Entry date', 'date'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },

  /* ── Insurance ─────────────────────────────────────────────────────────── */
  'insurance-policies': {
    key: 'insurance-policies',
    label: 'Insurance policies',
    noun: 'insurance policy',
    description:
      'Crop insurance policies — product, cover and premium amounts.',
    category: 'insurance',
    delegate: 'insurancePolicy',
    include: INSURANCE_POLICY_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.InsurancePolicyWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      if (dto.riceVariety) where.riceVariety = dto.riceVariety;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const p = rec as InsurancePolicyRec;
      return {
        farmer: person(p.farmer.firstName, p.farmer.lastName),
        farmerControlNumber: p.farmer.controlNumber,
        farmCode: p.farm?.farmCode ?? '',
        provider: p.provider.name,
        productType: p.productType,
        riceVariety: p.riceVariety ?? '',
        insuredAreaHectares: p.insuredAreaHectares,
        sumInsured: p.sumInsured,
        premiumAmount: p.premiumAmount,
        status: p.status,
        startDate: iso(p.startDate),
        endDate: iso(p.endDate),
        createdAt: iso(p.createdAt),
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('farmCode', 'Farm code'),
      col('provider', 'Provider'),
      col('productType', 'Product', 'enum'),
      col('riceVariety', 'Rice variety'),
      col('insuredAreaHectares', 'Insured area (ha)', 'number'),
      col('sumInsured', 'Sum insured (TZS)', 'number'),
      col('premiumAmount', 'Premium (TZS)', 'number'),
      col('status', 'Status', 'enum'),
      col('startDate', 'Starts', 'date'),
      col('endDate', 'Ends', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'insurance-claims': {
    key: 'insurance-claims',
    label: 'Insurance claims',
    noun: 'insurance claim',
    description: 'Insurance claims — incident type, claimed and paid amounts.',
    category: 'insurance',
    delegate: 'insuranceClaim',
    include: INSURANCE_CLAIM_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.InsuranceClaimWhereInput = {};
      if (hasFarmerFilters(dto)) {
        where.policy = { farmer: farmerWhere(dto) };
      }
      const range = dateRange(dto);
      if (range) where.incidentDate = range;
      return where;
    },
    map: (rec) => {
      const c = rec as InsuranceClaimRec;
      return {
        farmer: person(c.policy.farmer.firstName, c.policy.farmer.lastName),
        farmerControlNumber: c.policy.farmer.controlNumber,
        productType: c.policy.productType,
        incidentDate: iso(c.incidentDate),
        incidentType: c.incidentType,
        description: c.description ?? '',
        claimedAmount: c.claimedAmount,
        status: c.status,
        paidAmount: c.paidAmount ?? '',
        paidAt: iso(c.paidAt),
        createdAt: iso(c.createdAt),
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('productType', 'Product', 'enum'),
      col('incidentDate', 'Incident date', 'date'),
      col('incidentType', 'Incident type'),
      col('description', 'Description'),
      col('claimedAmount', 'Claimed (TZS)', 'number'),
      col('status', 'Status', 'enum'),
      col('paidAmount', 'Paid (TZS)', 'number'),
      col('paidAt', 'Paid at', 'date'),
      col('createdAt', 'Submitted on', 'date'),
    ],
  },

  /* ── Marketplace ───────────────────────────────────────────────────────── */
  'land-listings': {
    key: 'land-listings',
    label: 'Land listings',
    noun: 'land listing',
    description: 'M-LAX land listings — asking price, lease terms and status.',
    category: 'marketplace',
    delegate: 'landListing',
    include: LAND_LISTING_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.LandListingWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      if (hasFarmerFilters(dto)) where.owner = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const l = rec as LandListingRec;
      return {
        farmCode: l.farm.farmCode,
        farmName: l.farm.name,
        owner: person(l.owner.firstName, l.owner.lastName),
        ownerControlNumber: l.owner.controlNumber,
        renter: l.renter ? person(l.renter.firstName, l.renter.lastName) : '',
        askingPrice: l.askingPrice,
        finalPrice: l.finalPrice ?? '',
        dealType: l.dealType,
        leaseStatus: l.leaseStatus,
        leaseDurationMonths: l.leaseDurationMonths,
        leaseStartDate: iso(l.leaseStartDate),
        leaseEndDate: iso(l.leaseEndDate),
        isFlashDeal: l.isFlashDeal,
        mayodeProtected: l.mayodeProtected,
        createdAt: iso(l.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('owner', 'Owner'),
      col('ownerControlNumber', 'Owner control no.'),
      col('renter', 'Renter'),
      col('askingPrice', 'Asking price (TZS)', 'number'),
      col('finalPrice', 'Final price (TZS)', 'number'),
      col('dealType', 'Deal type', 'enum'),
      col('leaseStatus', 'Lease status', 'enum'),
      col('leaseDurationMonths', 'Duration (months)', 'number'),
      col('leaseStartDate', 'Lease starts', 'date'),
      col('leaseEndDate', 'Lease ends', 'date'),
      col('isFlashDeal', 'Flash deal', 'boolean'),
      col('mayodeProtected', 'MAYODE protected', 'boolean'),
      col('createdAt', 'Listed on', 'date'),
    ],
  },
  tractors: {
    key: 'tractors',
    label: 'Tractors',
    noun: 'tractor',
    description: 'Tractor fleet — registration, power and hire rates.',
    category: 'marketplace',
    delegate: 'tractor',
    include: TRACTOR_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.TractorWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const t = rec as TractorRec;
      return {
        registrationNo: t.registrationNo,
        model: t.model ?? '',
        horsePower: t.horsePower ?? '',
        owner: t.owner.name,
        ownerPhone: t.owner.phone,
        location: t.location ?? '',
        pricePerHectare: t.pricePerHectare ?? '',
        isAvailable: t.isAvailable,
        createdAt: iso(t.createdAt),
      };
    },
    columns: [
      col('registrationNo', 'Registration'),
      col('model', 'Model'),
      col('horsePower', 'Horsepower', 'number'),
      col('owner', 'Owner'),
      col('ownerPhone', 'Owner phone'),
      col('location', 'Location'),
      col('pricePerHectare', 'Price / ha (TZS)', 'number'),
      col('isAvailable', 'Available', 'boolean'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  'tractor-owners': {
    key: 'tractor-owners',
    label: 'Tractor owners',
    noun: 'tractor owner',
    description: 'Tractor owner directory — name, phone and location.',
    category: 'marketplace',
    delegate: 'tractorOwner',
    include: TRACTOR_OWNER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.TractorOwnerWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const o = rec as TractorOwnerRec;
      return {
        name: o.name,
        phone: o.phone,
        location: o.location ?? '',
        createdAt: iso(o.createdAt),
      };
    },
    columns: [
      col('name', 'Owner'),
      col('phone', 'Phone'),
      col('location', 'Location'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  'tractor-bookings': {
    key: 'tractor-bookings',
    label: 'Tractor bookings',
    noun: 'tractor booking',
    description: 'Tractor hire bookings — hectares, price and schedule.',
    category: 'marketplace',
    delegate: 'tractorBooking',
    include: TRACTOR_BOOKING_INCLUDE,
    orderBy: { scheduledDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.TractorBookingWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.scheduledDate = range;
      return where;
    },
    map: (rec) => {
      const b = rec as TractorBookingRec;
      return {
        tractor: b.tractor.registrationNo,
        farmer: person(b.farmer.firstName, b.farmer.lastName),
        farmerControlNumber: b.farmer.controlNumber,
        hectares: b.hectares,
        terrainGrade: b.terrainGrade,
        totalPrice: b.totalPrice,
        commissionAmount: b.commissionAmount,
        status: b.status,
        scheduledDate: iso(b.scheduledDate),
        completedAt: iso(b.completedAt),
        farmerConfirmed: b.farmerConfirmed,
        createdAt: iso(b.createdAt),
      };
    },
    columns: [
      col('tractor', 'Tractor'),
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('hectares', 'Hectares', 'number'),
      col('terrainGrade', 'Terrain grade', 'enum'),
      col('totalPrice', 'Total price (TZS)', 'number'),
      col('commissionAmount', 'Commission (TZS)', 'number'),
      col('status', 'Status', 'enum'),
      col('scheduledDate', 'Scheduled', 'date'),
      col('completedAt', 'Completed at', 'date'),
      col('farmerConfirmed', 'Farmer confirmed', 'boolean'),
      col('createdAt', 'Booked on', 'date'),
    ],
  },
  'market-prices': {
    key: 'market-prices',
    label: 'Market prices',
    noun: 'market price',
    description: 'Commodity market prices — market, source and date.',
    category: 'marketplace',
    delegate: 'marketPrice',
    include: MARKET_PRICE_INCLUDE,
    orderBy: { recordedAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.MarketPriceWhereInput = {};
      const range = dateRange(dto);
      if (range) where.recordedAt = range;
      return where;
    },
    map: (rec) => {
      const p = rec as MarketPriceRec;
      return {
        commodity: p.commodity,
        price: p.price,
        market: p.market ?? '',
        source: p.source ?? '',
        recordedAt: iso(p.recordedAt),
        createdAt: iso(p.createdAt),
      };
    },
    columns: [
      col('commodity', 'Commodity'),
      col('price', 'Price (TZS)', 'number'),
      col('market', 'Market'),
      col('source', 'Source'),
      col('recordedAt', 'Recorded at', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },

  /* ── People ────────────────────────────────────────────────────────────── */
  staff: {
    key: 'staff',
    label: 'Staff',
    noun: 'staff member',
    description: 'AMCOS staff — field officers and secretaries.',
    category: 'people',
    delegate: 'mamcosStaff',
    include: STAFF_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.MamcosStaffWhereInput = {};
      if (dto.mamcosId) where.mamcosId = dto.mamcosId;
      if (dto.fieldOfficerId) where.id = dto.fieldOfficerId;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const s = rec as StaffRec;
      return {
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.user.phone,
        role: s.role,
        employeeCode: s.employeeCode ?? '',
        assignedArea: s.assignedArea ?? '',
        cooperative: s.mamcos?.name ?? '',
        createdAt: iso(s.createdAt),
      };
    },
    columns: [
      col('firstName', 'First name'),
      col('lastName', 'Last name'),
      col('phone', 'Phone'),
      col('role', 'Role', 'enum'),
      col('employeeCode', 'Employee code'),
      col('assignedArea', 'Assigned area'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  users: {
    key: 'users',
    label: 'Users',
    noun: 'user',
    description: 'System users — phone, role and activity (no credentials).',
    category: 'people',
    delegate: 'user',
    include: USER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.UserWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const u = rec as UserRec;
      return {
        phone: u.phone,
        email: u.email ?? '',
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        role: u.role,
        isActive: u.isActive,
        language: u.language,
        lastLoginAt: iso(u.lastLoginAt),
        createdAt: iso(u.createdAt),
      };
    },
    columns: [
      col('phone', 'Phone'),
      col('email', 'Email'),
      col('firstName', 'First name'),
      col('lastName', 'Last name'),
      col('role', 'Role', 'enum'),
      col('isActive', 'Active', 'boolean'),
      col('language', 'Language'),
      col('lastLoginAt', 'Last login', 'date'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },
  amcos: {
    key: 'amcos',
    label: 'AMCOS',
    noun: 'cooperative',
    description: 'Cooperative schemes — location, hectares and leadership.',
    category: 'people',
    delegate: 'mamcos',
    include: AMCOS_INCLUDE,
    orderBy: { name: 'asc' },
    buildWhere: (dto) => {
      const where: Prisma.MamcosWhereInput = {};
      if (dto.district) where.district = dto.district;
      if (dto.mamcosId) where.id = dto.mamcosId;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const m = rec as AmcosRec;
      return {
        name: m.name,
        location: m.location ?? '',
        district: m.district ?? '',
        totalHectares: m.totalHectares ?? '',
        chairmanName: m.chairmanName ?? '',
        chairmanPhone: m.chairmanPhone ?? '',
        isActive: m.isActive,
        createdAt: iso(m.createdAt),
      };
    },
    columns: [
      col('name', 'Name'),
      col('location', 'Location'),
      col('district', 'District'),
      col('totalHectares', 'Total hectares', 'number'),
      col('chairmanName', 'Chairman'),
      col('chairmanPhone', 'Chairman phone'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Registered on', 'date'),
    ],
  },

  /* ── Governance ────────────────────────────────────────────────────────── */
  votes: {
    key: 'votes',
    label: 'Votes',
    noun: 'vote',
    description: 'Member votes — title, window and status.',
    category: 'governance',
    delegate: 'vote',
    include: VOTE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.VoteWhereInput = {};
      const range = dateRange(dto);
      if (range) where.opensAt = range;
      return where;
    },
    map: (rec) => {
      const v = rec as VoteRec;
      return {
        title: v.title,
        description: v.description ?? '',
        opensAt: iso(v.opensAt),
        closesAt: iso(v.closesAt),
        status: v.status,
        meetingAgenda: v.meeting?.agenda ?? '',
        meetingDate: iso(v.meeting?.meetingDate),
        createdAt: iso(v.createdAt),
      };
    },
    columns: [
      col('title', 'Title'),
      col('description', 'Description'),
      col('opensAt', 'Opens', 'date'),
      col('closesAt', 'Closes', 'date'),
      col('status', 'Status', 'enum'),
      col('meetingAgenda', 'Meeting agenda'),
      col('meetingDate', 'Meeting date', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'community-projects': {
    key: 'community-projects',
    label: 'Community projects',
    noun: 'community project',
    description:
      'Community projects funded by the cooperative — budget and spend.',
    category: 'governance',
    delegate: 'communityProject',
    include: COMMUNITY_PROJECT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.CommunityProjectWhereInput = {};
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const p = rec as CommunityProjectRec;
      return {
        name: p.name,
        fundingSource: p.fundingSource,
        budget: p.budget,
        spentAmount: p.spentAmount,
        status: p.status,
        createdAt: iso(p.createdAt),
      };
    },
    columns: [
      col('name', 'Project'),
      col('fundingSource', 'Funding source'),
      col('budget', 'Budget (TZS)', 'number'),
      col('spentAmount', 'Spent (TZS)', 'number'),
      col('status', 'Status', 'enum'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  meetings: {
    key: 'meetings',
    label: 'Meeting records',
    noun: 'meeting',
    description: 'Meeting minutes — agenda, decisions and attendance.',
    category: 'governance',
    delegate: 'meetingRecord',
    include: MEETING_INCLUDE,
    orderBy: { meetingDate: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.MeetingRecordWhereInput = {};
      const range = dateRange(dto);
      if (range) where.meetingDate = range;
      return where;
    },
    map: (rec) => {
      const m = rec as MeetingRec;
      return {
        meetingDate: iso(m.meetingDate),
        agenda: m.agenda,
        decisions: m.decisions,
        attendeeCount: m.attendeeCount,
        createdAt: iso(m.createdAt),
      };
    },
    columns: [
      col('meetingDate', 'Meeting date', 'date'),
      col('agenda', 'Agenda'),
      col('decisions', 'Decisions'),
      col('attendeeCount', 'Attendees', 'number'),
      col('createdAt', 'Recorded on', 'date'),
    ],
  },
  'reward-campaigns': {
    key: 'reward-campaigns',
    label: 'Reward campaigns',
    noun: 'reward campaign',
    description: 'Incentive campaigns — reward type, winners count and status.',
    category: 'governance',
    delegate: 'rewardCampaign',
    include: REWARD_CAMPAIGN_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.RewardCampaignWhereInput = {};
      if (dto.season) where.farmingSeason = { name: dto.season };
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const c = rec as RewardCampaignRec;
      return {
        name: c.name,
        description: c.description ?? '',
        sponsor: c.sponsor ?? '',
        rewardType: c.rewardType,
        rewardQuantity: c.rewardQuantity,
        numberOfWinners: c.numberOfWinners,
        season: c.farmingSeason?.name ?? '',
        selectionMethod: c.selectionMethod,
        status: c.status,
        selectedAt: iso(c.selectedAt),
        createdAt: iso(c.createdAt),
      };
    },
    columns: [
      col('name', 'Campaign'),
      col('description', 'Description'),
      col('sponsor', 'Sponsor'),
      col('rewardType', 'Reward type', 'enum'),
      col('rewardQuantity', 'Qty per winner', 'number'),
      col('numberOfWinners', 'Winners', 'number'),
      col('season', 'Season'),
      col('selectionMethod', 'Selection method', 'enum'),
      col('status', 'Status', 'enum'),
      col('selectedAt', 'Selected at', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'reward-winners': {
    key: 'reward-winners',
    label: 'Reward winners',
    noun: 'reward winner',
    description: 'Selected reward winners — campaign, farmer and status.',
    category: 'governance',
    delegate: 'rewardWinner',
    include: REWARD_WINNER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.RewardWinnerWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const w = rec as RewardWinnerRec;
      return {
        campaign: w.campaign.name,
        farmer: person(w.farmer.firstName, w.farmer.lastName),
        farmerControlNumber: w.farmer.controlNumber,
        rewardType: w.rewardType,
        quantity: w.quantity,
        status: w.status,
        notifiedAt: iso(w.notifiedAt),
        confirmedAt: iso(w.confirmedAt),
        createdAt: iso(w.createdAt),
      };
    },
    columns: [
      col('campaign', 'Campaign'),
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('rewardType', 'Reward type', 'enum'),
      col('quantity', 'Quantity', 'number'),
      col('status', 'Status', 'enum'),
      col('notifiedAt', 'Notified at', 'date'),
      col('confirmedAt', 'Confirmed at', 'date'),
      col('createdAt', 'Selected on', 'date'),
    ],
  },

  /* ── Alerts ────────────────────────────────────────────────────────────── */
  'farm-alerts': {
    key: 'farm-alerts',
    label: 'Farm alerts',
    noun: 'farm alert',
    description: 'Action alerts on farms — category, urgency and status.',
    category: 'alerts',
    delegate: 'farmAlert',
    include: FARM_ALERT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.FarmAlertWhereInput = {};
      if (hasFarmGeoFilters(dto)) where.farm = farmGeoWhere(dto);
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const a = rec as FarmAlertRec;
      return {
        farmCode: a.farm.farmCode,
        farmName: a.farm.name,
        category: a.category,
        urgency: a.urgency,
        title: a.title,
        previewMessage: a.previewMessage,
        status: a.status,
        expectedActionDate: iso(a.expectedActionDate),
        completedAt: iso(a.completedAt),
        createdAt: iso(a.createdAt),
      };
    },
    columns: [
      col('farmCode', 'Farm code'),
      col('farmName', 'Farm name'),
      col('category', 'Category', 'enum'),
      col('urgency', 'Urgency', 'enum'),
      col('title', 'Title'),
      col('previewMessage', 'Preview'),
      col('status', 'Status', 'enum'),
      col('expectedActionDate', 'Expected action', 'date'),
      col('completedAt', 'Completed at', 'date'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'weather-alerts': {
    key: 'weather-alerts',
    label: 'Weather alerts',
    noun: 'weather alert',
    description: 'Early-warning weather alerts — type, severity and coverage.',
    category: 'alerts',
    delegate: 'weatherAlert',
    include: WEATHER_ALERT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.WeatherAlertWhereInput = {};
      if (dto.region) where.region = dto.region;
      if (dto.district) where.district = dto.district;
      if (dto.ward) where.ward = dto.ward;
      const range = dateRange(dto);
      if (range) where.validFrom = range;
      return where;
    },
    map: (rec) => {
      const a = rec as WeatherAlertRec;
      return {
        region: a.region ?? '',
        district: a.district ?? '',
        ward: a.ward ?? '',
        alertType: a.alertType,
        severity: a.severity,
        title: a.title,
        message: a.message,
        validFrom: iso(a.validFrom),
        validUntil: iso(a.validUntil),
        smsSentCount: a.smsSentCount,
        createdAt: iso(a.createdAt),
      };
    },
    columns: [
      col('region', 'Region'),
      col('district', 'District'),
      col('ward', 'Ward'),
      col('alertType', 'Alert type', 'enum'),
      col('severity', 'Severity', 'enum'),
      col('title', 'Title'),
      col('message', 'Message'),
      col('validFrom', 'Valid from', 'date'),
      col('validUntil', 'Valid until', 'date'),
      col('smsSentCount', 'SMS sent', 'number'),
      col('createdAt', 'Issued on', 'date'),
    ],
  },

  /* ── Facilities ────────────────────────────────────────────────────────── */
  'irrigation-schemes': {
    key: 'irrigation-schemes',
    label: 'Irrigation schemes',
    noun: 'irrigation scheme',
    description: 'Irrigation schemes — type, coverage and water source.',
    category: 'facilities',
    delegate: 'irrigationScheme',
    include: IRRIGATION_SCHEME_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.IrrigationSchemeWhereInput = {};
      if (dto.mamcosId) where.mamcosId = dto.mamcosId;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const s = rec as IrrigationSchemeRec;
      return {
        name: s.name,
        cooperative: s.mamcos?.name ?? '',
        schemeType: s.schemeType ?? '',
        coverageHectares: s.coverageHectares ?? '',
        waterSource: s.waterSource ?? '',
        isActive: s.isActive,
        createdAt: iso(s.createdAt),
      };
    },
    columns: [
      col('name', 'Scheme'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('schemeType', 'Type'),
      col('coverageHectares', 'Coverage (ha)', 'number'),
      col('waterSource', 'Water source'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Created on', 'date'),
    ],
  },
  'aggregation-centres': {
    key: 'aggregation-centres',
    label: 'Aggregation centres',
    noun: 'aggregation centre',
    description: 'Aggregation centres — capacity, location and contacts.',
    category: 'facilities',
    delegate: 'aggregationCentre',
    include: AGGREGATION_CENTRE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.AggregationCentreWhereInput = {};
      if (dto.mamcosId) where.mamcosId = dto.mamcosId;
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const c = rec as AggregationCentreRec;
      return {
        name: c.name,
        cooperative: c.mamcos?.name ?? '',
        location: c.location ?? '',
        capacityKg: c.capacityKg ?? '',
        contactPerson: c.contactPerson ?? '',
        contactPhone: c.contactPhone ?? '',
        isActive: c.isActive,
        createdAt: iso(c.createdAt),
      };
    },
    columns: [
      col('name', 'Centre'),
      col('cooperative', 'Cooperative (AMCOS)'),
      col('location', 'Location'),
      col('capacityKg', 'Capacity (kg)', 'number'),
      col('contactPerson', 'Contact person'),
      col('contactPhone', 'Phone'),
      col('isActive', 'Active', 'boolean'),
      col('createdAt', 'Created on', 'date'),
    ],
  },

  /* ── Compliance ────────────────────────────────────────────────────────── */
  consents: {
    key: 'consents',
    label: 'Consent records',
    noun: 'consent record',
    description:
      'Data-sharing consent captures — scope, form version and revocation.',
    category: 'compliance',
    delegate: 'consentRecord',
    include: CONSENT_INCLUDE,
    orderBy: { capturedAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.ConsentRecordWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      const range = dateRange(dto);
      if (range) where.capturedAt = range;
      return where;
    },
    map: (rec) => {
      const c = rec as ConsentRec;
      return {
        farmer: person(c.farmer.firstName, c.farmer.lastName),
        farmerControlNumber: c.farmer.controlNumber,
        scope: c.scope,
        granted: c.granted,
        formVersion: c.formVersion,
        language: c.language,
        witnessName: c.witnessName ?? '',
        capturedAt: iso(c.capturedAt),
        revokedAt: iso(c.revokedAt),
      };
    },
    columns: [
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('scope', 'Scope'),
      col('granted', 'Granted', 'boolean'),
      col('formVersion', 'Form version'),
      col('language', 'Language'),
      col('witnessName', 'Witness'),
      col('capturedAt', 'Captured at', 'date'),
      col('revokedAt', 'Revoked at', 'date'),
    ],
  },
  documents: {
    key: 'documents',
    label: 'Documents',
    noun: 'document',
    description:
      'Uploaded farmer/farm documents — type, verification and file meta.',
    category: 'compliance',
    delegate: 'document',
    include: DOCUMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    buildWhere: (dto) => {
      const where: Prisma.DocumentWhereInput = {};
      if (hasFarmerFilters(dto)) where.farmer = farmerWhere(dto);
      if (hasFarmGeoFilters(dto) && !hasFarmerFilters(dto)) {
        where.farm = farmGeoWhere(dto);
      }
      const range = dateRange(dto);
      if (range) where.createdAt = range;
      return where;
    },
    map: (rec) => {
      const d = rec as DocumentRec;
      return {
        type: d.type,
        fileName: d.fileName,
        farmer: d.farmer ? person(d.farmer.firstName, d.farmer.lastName) : '',
        farmerControlNumber: d.farmer?.controlNumber ?? '',
        farmCode: d.farm?.farmCode ?? '',
        mimeType: d.mimeType ?? '',
        sizeBytes: d.sizeBytes ?? '',
        verified: d.verified,
        notes: d.notes ?? '',
        createdAt: iso(d.createdAt),
      };
    },
    columns: [
      col('type', 'Type', 'enum'),
      col('fileName', 'File name'),
      col('farmer', 'Farmer'),
      col('farmerControlNumber', 'Farmer control no.'),
      col('farmCode', 'Farm code'),
      col('mimeType', 'MIME type'),
      col('sizeBytes', 'Size (bytes)', 'number'),
      col('verified', 'Verified', 'boolean'),
      col('notes', 'Notes'),
      col('createdAt', 'Uploaded on', 'date'),
    ],
  },
};

/** Structural stand-in for a Prisma model delegate (avoids per-model generics). */
interface Delegate {
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
}

@Injectable()
export class ReportBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  schema(): BuilderEntity[] {
    return Object.values(DEFS)
      .map((def) => ({
        key: def.key,
        label: def.label,
        noun: def.noun,
        description: def.description,
        category: def.category,
        columns: def.columns,
        relations: (JOINS[def.key] ?? []).map((e) => ({
          key: e.entity,
          label: DEFS[e.entity].label,
          many: e.many,
        })),
      }))
      .sort((a, b) => {
        const cat =
          CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category);
        if (cat !== 0) return cat;
        return a.label.localeCompare(b.label);
      });
  }

  private resolveJoins(primary: EntityDef, requested: string[]): JoinEdge[] {
    const available = JOINS[primary.key] ?? [];
    const edges = [...new Set(requested)].map((key) => {
      const edge = available.find((e) => e.entity === key);
      if (!edge) {
        throw new BadRequestException(
          `"${key}" is not directly related to "${primary.key}". Available: ${available.map((a) => a.entity).join(', ') || 'none'}`,
        );
      }
      return edge;
    });
    // Two expanding joins would cross-multiply rows (farms × loans per farmer),
    // which reads as duplicated money/weight figures. One per report stays honest.
    const expanding = edges.filter((e) => e.many);
    if (expanding.length > 1) {
      throw new BadRequestException(
        `"${expanding[0].entity}" and "${expanding[1].entity}" each expand the row count — keep one expanding relation per report, or make the other one the primary data set`,
      );
    }
    return edges;
  }

  async run(dto: RunBuilderDto): Promise<BuilderResult> {
    const def = DEFS[dto.entity];
    if (!def) {
      throw new BadRequestException(
        `Unknown report entity "${dto.entity}". Available: ${Object.keys(DEFS).join(', ')}`,
      );
    }
    const edges = this.resolveJoins(def, dto.joins ?? []);

    // Split requested columns into primary (bare keys) and joined ("entity.key").
    const primaryKeys = new Set(def.columns.map((c) => c.key));
    const joinedSelection = new Map<string, Set<string>>();
    for (const key of dto.columns) {
      if (!key.includes('.')) {
        if (!primaryKeys.has(key)) {
          throw new BadRequestException(
            `Unknown column "${key}" for ${def.key}`,
          );
        }
        continue;
      }
      const dot = key.indexOf('.');
      const entityKey = key.slice(0, dot);
      const columnKey = key.slice(dot + 1);
      const edge = edges.find((e) => e.entity === entityKey);
      if (!edge) {
        throw new BadRequestException(
          `Column "${key}" requires joining "${entityKey}" first`,
        );
      }
      const catalog = DEFS[entityKey].columns.find((c) => c.key === columnKey);
      if (!catalog) {
        throw new BadRequestException(
          `Unknown column "${columnKey}" for ${entityKey}`,
        );
      }
      if (!joinedSelection.has(entityKey))
        joinedSelection.set(entityKey, new Set());
      joinedSelection.get(entityKey)!.add(columnKey);
    }
    // A join with no selected columns silently does nothing — reject it so the
    // report always matches what the user sees in the picker.
    const emptyJoins = edges
      .filter((e) => !joinedSelection.get(e.entity)?.size)
      .map((e) => e.entity);
    if (emptyJoins.length) {
      throw new BadRequestException(
        `Joined ${emptyJoins.map((k) => `"${k}"`).join(', ')} but selected no columns from it — tick at least one or remove the join`,
      );
    }

    const isExport = !!dto.format && dto.format !== 'json';
    const limit = Math.min(
      dto.limit ?? (isExport ? EXPORT_LIMIT : PREVIEW_LIMIT),
      EXPORT_LIMIT,
    );

    // Merge join includes over the base tree. A join include returns all scalar
    // fields, so it is always a superset of the base's narrow `select` picks.
    const include: Record<string, unknown> = { ...def.include };
    for (const edge of edges) {
      include[edge.relation] = { include: DEFS[edge.entity].include };
    }

    const delegate = this.prisma[def.delegate] as unknown as Delegate;
    const where = def.buildWhere(dto);
    const [records, primaryCount] = await Promise.all([
      delegate.findMany({ where, include, orderBy: def.orderBy, take: limit }),
      delegate.count({ where }),
    ]);

    const chosenPrimary = def.columns.filter((c) =>
      dto.columns.includes(c.key),
    );
    const joinedGroups = edges
      .map((edge) => ({
        edge,
        def: DEFS[edge.entity],
        cols: DEFS[edge.entity].columns.filter((c) =>
          joinedSelection.get(edge.entity)?.has(c.key),
        ),
      }))
      .filter((g) => g.cols.length > 0);
    const manyGroup = joinedGroups.find((g) => g.edge.many) ?? null;
    const flatGroups = joinedGroups.filter((g) => !g.edge.many);

    const prefixed = (
      entityKey: string,
      cols: BuilderColumn[],
      mapped: Row | null,
    ): Row =>
      Object.fromEntries(
        cols.map((c) => [`${entityKey}.${c.key}`, mapped?.[c.key] ?? '']),
      );

    let rows: Row[] = [];
    for (const rec of records) {
      const base = def.map(rec);
      const row: Row = Object.fromEntries(
        chosenPrimary.map((c) => [c.key, base[c.key] ?? '']),
      );
      for (const g of flatGroups) {
        const rel = (rec as Record<string, unknown>)[g.edge.relation];
        Object.assign(
          row,
          prefixed(g.edge.entity, g.cols, rel ? g.def.map(rel) : null),
        );
      }
      if (!manyGroup) {
        rows.push(row);
        continue;
      }
      const children =
        ((rec as Record<string, unknown>)[manyGroup.edge.relation] as
          | unknown[]
          | undefined) ?? [];
      if (children.length === 0) {
        rows.push({
          ...row,
          ...prefixed(manyGroup.edge.entity, manyGroup.cols, null),
        });
      } else {
        for (const child of children) {
          rows.push({
            ...row,
            ...prefixed(
              manyGroup.edge.entity,
              manyGroup.cols,
              manyGroup.def.map(child),
            ),
          });
        }
      }
    }
    rows = rows.slice(0, limit);

    const columns: BuilderColumn[] = [
      ...chosenPrimary,
      ...joinedGroups.flatMap((g) =>
        g.cols.map((c) => ({
          ...c,
          key: `${g.edge.entity}.${c.key}`,
          label: `${g.def.label} · ${c.label}`,
        })),
      ),
    ];

    return {
      entity: def.key,
      name: dto.name?.trim() || def.label,
      columns,
      rows,
      // With an expanding join the honest total is the expanded window length;
      // otherwise it's the full count of matching primary records.
      total: manyGroup ? rows.length : primaryCount,
      limit,
      grain: manyGroup
        ? `One row per ${manyGroup.def.noun} — ${def.label.toLowerCase()} columns repeat across their ${manyGroup.def.label.toLowerCase()}`
        : `One row per ${def.noun}`,
    };
  }
}
