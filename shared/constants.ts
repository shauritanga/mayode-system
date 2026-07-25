/**
 * MAYODE GROUP Integrated System — Shared Constants
 * Used across backend, web, and mobile
 */

// ============================================================
// USER ROLES — Role-Based Access Control (RBAC)
// ============================================================
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  FIELD_OFFICER = 'field_officer',
  FARMER = 'farmer',
  MAMCOS_SECRETARY = 'mamcos_secretary',
  AUDITOR = 'auditor',
  BUYER = 'buyer',
  FINANCIAL_PROVIDER = 'financial_provider',
}

// ============================================================
// FARM GRADES — Land Quality Classification
// ============================================================
export enum FarmGrade {
  GRADE_A = 'A', // Premium: Level land, near main irrigation canal, no vichuguu
  GRADE_B = 'B', // Standard: Middle of scheme, some walking required
  GRADE_C = 'C', // Discount: Far from road, high vichuguu or water-end plots
}

// ============================================================
// DEAL TYPES — M-LAX Pricing Categories
// ============================================================
export enum DealType {
  STANDARD = 'standard',       // 10% commission
  FLASH_DEAL = 'flash_deal',   // 14% commission (emergency cash)
  RELATIONSHIP = 'relationship', // 5% commission (preferred renter code)
}

// ============================================================
// COMMISSION RATES
// ============================================================
export const COMMISSION_RATES = {
  LAND_RENTAL: {
    [DealType.STANDARD]: 0.10,
    [DealType.FLASH_DEAL]: 0.14,
    [DealType.RELATIONSHIP]: 0.05,
  },
  TRACTOR_SERVICE: {
    STANDARD: 0.10,
    DIFFICULT_TERRAIN: 0.13,
  },
  LONG_TERM_LEASE: {
    ONE_YEAR: 0.12,
    THREE_YEAR: 0.10,
  },
} as const;

// ============================================================
// CROP CYCLE ACTIVITIES
// ============================================================
export enum ActivityType {
  LAND_PREPARATION = 'land_preparation',
  PLANTING = 'planting',
  FERTILIZING = 'fertilizing',
  WEEDING = 'weeding',
  PEST_CONTROL = 'pest_control',
  IRRIGATION = 'irrigation',
  HARVESTING = 'harvesting',
  DRYING = 'drying',
  STORAGE = 'storage',
  TRANSPORT = 'transport',
}

// ============================================================
// PAYMENT STATUS
// ============================================================
export enum PaymentStatus {
  PENDING = 'pending',
  IN_ESCROW = 'in_escrow',
  RELEASED = 'released',
  CLEARED = 'cleared',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

// ============================================================
// LEASE STATUS
// ============================================================
export enum LeaseStatus {
  DRAFT = 'draft',
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
  DISPUTED = 'disputed',
}

// ============================================================
// CONTROL NUMBER PREFIX — Farmer ID Generation
// ============================================================
export const CONTROL_NUMBER_PREFIX = 'MYD';

// ============================================================
// SUPPORTED LANGUAGES
// ============================================================
export enum Language {
  SWAHILI = 'sw',
  ENGLISH = 'en',
}
