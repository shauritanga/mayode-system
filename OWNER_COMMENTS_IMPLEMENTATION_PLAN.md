# Owner Comments Implementation Plan

## Goal

Make the current MAYODE app meet the owner comments by extending the existing backend, mobile app, web dashboard, database schema, and notification foundation. Do not rebuild the app from scratch.

The best approach is to first stabilize the core farm-ownership workflow, then add membership-gated analytics, then add USSD/SMS support and advanced AI/analytics features.

## Current App Snapshot

The project already has useful foundations:

- Backend modules for users, farmers, MAMCOS, farms, plots, farm verification, crop cycles, finance, inventory, locations, marketplace, uploads, and notifications.
- Mobile screens for onboarding, registration, profile, farm registration, farm details, GPS boundary capture, plots, activities, weather, and marketplace.
- Web dashboard screens for farmers, farms, MAMCOS, crop cycles, finance, inventory, locations, and marketplace.
- Prisma models for `User`, `Farmer`, `Farm`, `Plot`, `FarmVerification`, `FarmerVerification`, `Document`, `Notification`, `Payment`, and `LandListing`.
- Real weather support already exists through OpenWeather when configured, with Open-Meteo fallback.
- Farm productivity analytics already exist, but they are currently accessible without membership gating.

Main gaps against the owner comments:

- `MAMCOS` naming needs to be corrected to user-facing `AMCOS` where appropriate, especially `Madibira AMCOS`.
- Farm name is optional in mobile and backend, but the owner wants a required structured farm name.
- Legal owner, renter, lease, active seasonal user, owner verification, and officer-assisted verification are not modeled clearly enough.
- Membership and farming seasons are not modeled as first-class records.
- Analytics are not protected by backend membership checks.
- Notifications exist, but farm-action recommendation notifications and membership conversion behavior are not implemented.
- Profile verification has documents and officer verification, but not a clear final identity-verification flow with ID, photo, and facial capture.
- Help/support is only an alert and currently uses the wrong email in translations.
- Farm photos, soil analytics, road-distance analysis, printable farm report, and AI-assisted analytics need additional data models/services.
- USSD/SMS workflows are not implemented.

## Implementation Strategy

Use four implementation tracks:

- Data and backend correctness first, because owner/renter/membership rules must be enforced server-side.
- Mobile farmer-facing flows second, because the demo and adoption depend on a simple registration experience.
- Web/admin/AMCOS/officer tools third, because pre-registration and verification require staff interfaces.
- Advanced integrations last, because soil, satellite, AI, USSD, and road-distance analysis need external services and operational decisions.

## Phase 1: Quick Owner-Comment Fixes

Purpose: align visible app behavior with the easiest owner comments without changing the whole architecture.

### Backend

- Seed or update AMCOS records to include `Madibira AMCOS`, `Mbuyuni AMCOS`, and `Ubaruku AMCOS`.
- Keep the database model named `Mamcos` for now to avoid a risky rename, but change user-facing labels from `MAMCOS` to `AMCOS` where required.
- Make farm `name` required in `CreateFarmDto` and validate it on the backend.
- Add structured optional farm-location fields to `Farm` or `Plot`: `plotNumber`, `blockNumber`, `section`, `ward`, `district`, `region`.
- Keep `village` and `mamcosId` as separate fields.
- Add a helper that builds a default structured name, for example: `Plot No. 02, Block 5, South-West Section, Madibira AMCOS`.

### Mobile

- Change farm registration label from `Farm name (optional)` to required.
- Add fields for plot number, block number, section/direction, ward, district, and region.
- Auto-preview the structured farm name while the user enters location details.
- Ask whether the person registering is the `Owner` or `Renter/Tenant`.
- If renter is selected, collect owner name and owner phone number as temporary fields until the full lease model is implemented.
- Update Help and Support email to `support@mayodegroup.com`.
- Replace the current Help alert with a simple FAQ/support screen placeholder.
- Add a visible verification tick/star beside the user name on the profile screen when `verificationStatus` is `VERIFIED`.
- Show whether weather is live data: display provider/status such as `Live weather from Open-Meteo` or `Live weather from OpenWeather`.

### Web Dashboard

- Update labels from `MAMCOS` to `AMCOS` where user-facing.
- Add structured farm fields to farm list/detail views.
- Show owner/renter status on farm rows once captured.

### Acceptance Criteria

- Farm registration remains free.
- A farm cannot be created without a structured farm name.
- Users can identify whether they are registering as owner or renter.
- Support email is correct.
- Verified users have a visible profile indicator.
- Weather source is clear to users.

## Phase 2: Core Ownership, Lease, and Seasonal Active User Model

Purpose: implement the workflow the owner described: AMCOS pre-registers farms, owner confirms, owner adds lease, renter becomes active user for the season.

### Database Changes

Add first-class models instead of overloading `Farm.farmerId` and `LandListing`.

Recommended models:

```prisma
model FarmingSeason {
  id                    String   @id @default(uuid())
  name                  String
  mamcosId              String?  @map("mamcos_id")
  region                String?
  crop                  String?
  startDate             DateTime @map("start_date")
  endDate               DateTime @map("end_date")
  registrationOpenDate  DateTime? @map("registration_open_date")
  registrationCloseDate DateTime? @map("registration_close_date")
  verificationDeadline  DateTime? @map("verification_deadline")
  status                FarmingSeasonStatus @default(DRAFT)
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")
}

model FarmOwnership {
  id                String @id @default(uuid())
  farmId            String @map("farm_id")
  ownerFarmerId     String? @map("owner_farmer_id")
  ownerName         String? @map("owner_name")
  ownerPhone        String? @map("owner_phone")
  source            OwnershipSource @default(AMCOS)
  confirmationStatus VerificationStatus @default(PENDING) @map("confirmation_status")
  confirmedAt       DateTime? @map("confirmed_at")
  verifiedByUserId  String? @map("verified_by_user_id")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
}

model FarmLease {
  id                    String @id @default(uuid())
  farmId                String @map("farm_id")
  ownerFarmerId         String? @map("owner_farmer_id")
  renterFarmerId        String? @map("renter_farmer_id")
  renterName            String? @map("renter_name")
  renterPhone           String @map("renter_phone")
  farmingSeasonId       String @map("farming_season_id")
  leaseStartDate        DateTime @map("lease_start_date")
  leaseEndDate          DateTime @map("lease_end_date")
  ownerConfirmationStatus VerificationStatus @default(PENDING) @map("owner_confirmation_status")
  renterConfirmationStatus VerificationStatus @default(PENDING) @map("renter_confirmation_status")
  officerVerificationStatus VerificationStatus @default(PENDING) @map("officer_verification_status")
  status                LeaseStatus @default(PENDING_VERIFICATION)
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")
}

model SeasonalFarmAssignment {
  id              String @id @default(uuid())
  farmId          String @map("farm_id")
  farmingSeasonId String @map("farming_season_id")
  activeFarmerId  String @map("active_farmer_id")
  leaseId         String? @map("lease_id")
  assignmentType  AssignmentType
  status          VerificationStatus @default(PENDING)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
}
```

Recommended enums:

```prisma
enum FarmingSeasonStatus {
  DRAFT
  REGISTRATION_OPEN
  VERIFICATION_IN_PROGRESS
  ACTIVE
  HARVESTING
  COMPLETED
  ARCHIVED
}

enum OwnershipSource {
  AMCOS
  OWNER
  RENTER
  MAYODE_OFFICER
  IMPORT
}

enum AssignmentType {
  OWNER_OPERATED
  RENTED
  NOT_CULTIVATED
}
```

### Backend Modules

- Add `FarmingSeasonsModule` for configurable seasons.
- Add `FarmOwnershipModule` for legal owner records and confirmation.
- Add `FarmLeasesModule` for owner-created leases and renter confirmation.
- Add `SeasonalAssignmentsModule` or keep this inside leases initially if a smaller implementation is preferred.
- Extend `OwnershipService` so active seasonal renters can access farm activity features for assigned farms without becoming legal owners.
- Ensure legal owner remains associated with the farm even when a renter is active.
- Add audit logs for ownership changes, lease changes, owner confirmations, renter confirmations, and officer overrides.

### Mobile Flows

- Owner flow: confirm farm, complete identity, add lease.
- Renter flow: search/select pre-registered farm, view owner name, confirm farm, complete personal details, wait for owner/officer verification.
- Active user display: show `Owner-operated`, `Rented`, `Owner verified`, `Officer verified`, and lease period.

### Web/Admin/AMCOS Flows

- AMCOS officer can pre-register farms with owner information.
- MAYODE officer can verify owner/renter claims using block leaders and field checks.
- Management can view disputes and pending verifications.

### Acceptance Criteria

- A farm has one current legal owner record independent of the active seasonal user.
- A renter can be verified by owner, officer, or both.
- The active user for a season is clear.
- Ownership conflicts are flagged, not silently overwritten.

## Phase 3: Membership and Premium Analytics Gate

Purpose: keep registration free, but require active membership for advanced analytics and detailed recommendations.

### Database Changes

- Add `MembershipPlan`.
- Add `Membership` linked to `User`, `Farmer`, and `FarmingSeason`.
- Extend `PaymentType` with `MEMBERSHIP`.
- Add `FeatureAccess` constants in code, not necessarily a table at first.

### Backend Rules

- Free access must allow account creation, farmer profile, farm registration, plots, ownership/rental data, crop cycles, expenses, labor, inputs, basic documents, and general notifications.
- Premium checks must run in the backend before returning advanced data.
- Gate current endpoints such as `GET /farms/:id/productivity` behind membership or return only a safe preview for free users.
- Never send premium-only diagnosis, recommendations, action plans, or analytics in API responses for free users.

### Mobile UX

- Free users see farm issue preview, category, affected farm/plot, and urgency.
- Premium users see full diagnosis, recommendation, action date, supporting analytics, and completion actions.
- Add membership plans and payment start screen.
- Show a clear CTA: `Activate MAYOData membership to view full analysis and recommended action.`

### Acceptance Criteria

- Registration and basic farm management remain free.
- Premium analytics cannot be accessed by changing frontend state or inspecting API responses.
- Membership is tied to a farming season.

## Phase 4: Farm-Action Notifications and Conversion Flow

Purpose: implement responsible alerting that creates awareness without misleading users.

### Backend

- Add `FarmRecommendation` or `FarmAlert` model with `category`, `urgency`, `farmId`, `plotId`, `seasonId`, `premiumDetails`, `previewMessage`, `recommendedAction`, `expectedActionDate`, and `status`.
- Generate alerts from crop-cycle dates, missing activities, weather risks, and later soil/satellite analytics.
- Add notification payload types that deep-link to alert preview/detail screens.
- Add push/SMS delivery as a worker/service behind the existing `NotificationsService`.

### Mobile

- Replace placeholder notification alert with a real notification center.
- Add alert preview screen for free users.
- Add alert detail screen for premium users.
- Add actions: mark completed, record observation, photo, expense, input, and labor.

### Acceptance Criteria

- Non-members can see that an issue exists but cannot see premium details.
- Active members can open full recommendations.
- Alerts are worded responsibly and do not use fear-based messaging.

## Phase 5: Identity Verification Upgrade

Purpose: make profile registration end with reliable identity verification.

### Backend

- Extend `DocumentType` if needed with `NIDA_ID`, `VOTER_ID`, `PROFILE_PHOTO`, and `FACE_CAPTURE`.
- Add fields to `FarmerVerification` for identity document reviewed, photo reviewed, face match status, and reviewer notes.
- Keep officer verification as the final approval until automated facial matching is selected.

### Mobile

- Add final onboarding step for ID upload, recent photo, and guided face capture.
- Show pending/verified/rejected status clearly.
- Add retry flow when verification is rejected.

### Acceptance Criteria

- A farmer can submit identity documents and photo evidence.
- Officers can approve/reject with reasons.
- Verified status is shown beside the user name.

## Phase 6: Farm Media, Soil, Road, Water, and Printable Analytics Report

Purpose: create the comprehensive farm report the owner requested.

### Farm Data Collection

- Require or strongly prompt for 3 to 5 farm photos during field verification.
- Store photo metadata: uploader, GPS point, timestamp, and farm/plot reference.
- Add soil sample/result model with source, date, pH, organic matter, nutrients, texture, and notes.
- Add road/access model or computed fields for nearest road distance and road access quality.
- Add water access fields with source, distance, reliability, and irrigation method.

### Integrations

- Road distance: start with OpenStreetMap/OSRM or Overpass-based nearest-road lookup.
- Soil analytics: support manual lab entry first, then integrate external soil data/API later.
- Satellite/AI: add only after the core report schema is stable.

### Report

- Add printable farm analytics report endpoint.
- Include farm name/location, size, GPS map, photos, soil analysis, condition, potential yield, estimated value, road access, water access, and recommendations.
- For free users, show basic report and premium preview.
- For members, show full analytics and recommendations.

### Acceptance Criteria

- Farm details include GPS coordinates and map.
- Reports can be printed or downloaded.
- User-entered soil condition is treated as farmer observation, not trusted analytics.

## Phase 7: USSD and SMS Workflows

Purpose: support owners and farmers without smartphones.

### USSD/SMS Capabilities

- Owner receives verification request: `Do you recognize and approve this renter? Reply Yes or No.`
- Owner can confirm self-farming, rented, or not cultivated.
- Owner can add lease through step-by-step USSD.
- Renter can confirm a lease through USSD.
- Officers can trigger assisted verification when owner cannot respond digitally.

### Backend

- Add `UssdSession` model for multi-step state.
- Add webhook endpoints for SMS/USSD provider callbacks.
- Store every response for auditability.
- Limit simple responses to `Yes`, `No`, `Continue`, and `Stop` where possible.

### Acceptance Criteria

- A non-smartphone owner can verify or reject renter assignment.
- USSD/SMS responses update lease verification status.
- Failed/no responses create officer follow-up tasks.

## Phase 8: Farmer Awards and Incentives

Purpose: encourage usage while keeping selection transparent.

### Backend

- Add `IncentiveProgram`, `IncentiveEligibilityRule`, `IncentiveSelection`, and `IncentiveAward` models.
- Define eligibility rules such as verified profile, active farming season, registered farm, completed activities, no unresolved disputes, and active use.
- Use auditable random selection with stored seed, selected candidates, reviewers, and final approval.

### Mobile/Web

- Notify selected farmers by SMS/push.
- Show awards in profile and management dashboard.

### Acceptance Criteria

- Five eligible farmers can be selected transparently each year.
- Every selection is auditable.

## Phase 9: Visual Demo Revision

Purpose: revise the demo to match the new owner-approved workflow.

### Mobile UI

- Add agricultural visuals to login, dashboard, farm registration, weather, and farm detail screens.
- Keep visuals lightweight and locally bundled where possible.
- Avoid blocking registration with heavy graphics or slow remote images.

### Demo Script

- Demo AMCOS pre-registering a farm and owner.
- Demo owner confirmation.
- Demo owner adding a lease.
- Demo renter confirming and becoming active seasonal user.
- Demo free registration.
- Demo premium analytics lock and membership conversion.
- Demo farm-action notification for free and premium users.

## Recommended Build Order

1. Phase 1 quick fixes.
2. Phase 2 ownership, lease, and season model.
3. Phase 3 membership gating for analytics.
4. Phase 4 notifications and recommendation preview/detail flow.
5. Phase 5 identity verification upgrade.
6. Phase 6 farm analytics report and external data enrichment.
7. Phase 7 USSD/SMS workflows.
8. Phase 8 awards/incentives.
9. Phase 9 demo polish and visuals.

## Highest-Risk Decisions To Confirm Early

- Whether the product should display `AMCOS` everywhere or keep `MAMCOS` internally and only rename user-facing text.
- Which AMCOS list is authoritative for Mbarali District.
- Which SMS/USSD provider MAYODE will use.
- Which payment provider and membership approval process should activate seasonal membership.
- Whether owner/renter verification requires both owner confirmation and officer approval, or either one depending on policy.
- Whether facial verification is manual officer review first or automated biometric matching.
- Which external services should be used for road distance, soil data, satellite data, and AI recommendations.

## Minimal First Milestone

The smallest useful release should include:

- Correct AMCOS naming and seed list.
- Required structured farm name.
- Owner/renter question in farm registration.
- Owner contact collection for rented farms.
- Correct support email and FAQ placeholder.
- Profile verified indicator.
- Backend membership gate around productivity analytics with safe preview for free users.
- Real notification center connected to existing notification API.

This milestone gives the owner visible progress while preparing the app for the larger ownership, season, membership, and USSD workflows.
