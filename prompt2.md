# ADDITIONAL PROMPT: AMCOS-FIRST FARM REGISTRY, OWNER CONFIRMATION, LEASE MANAGEMENT, FIELD DATA COLLECTION, AND LOW-FRICTION REGISTRATION

Extend the existing MAYOData implementation with an **AMCOS-first farm registration model**.

The main goal is to reduce the amount of information farmers must enter manually.

Responsible AMCOS officers already possess important information about farms, hectares, plot numbers, and their legal owners. The system should use this information as pre-filled farm data that owners and renters can review, confirm, correct, or complete.

Do not require farmers to re-enter information that already exists and has been provided by an authorized AMCOS officer.

---

# 1. REQUIRED USER INTERFACES

The system must provide separate interfaces and workflows for:

1. Farm owner
2. Farm renter or seasonal farmer
3. Responsible AMCOS officer
4. MAYODE management

Additional authorized users may include:

- MAYOData field officer
- Block leader
- Canal leader
- Scheme leader
- System administrator

Each interface must display only the actions and information relevant to that user’s responsibilities.

---

# 2. AMCOS-FIRST FARM REGISTRATION MODEL

The initial farm registry should be created from information collected from the responsible AMCOS.

The responsible AMCOS should identify:

- Which farm or hectare exists
- The plot number
- The block
- The canal
- The scheme
- The farm size
- The known legal owner
- The owner’s phone number
- The owner’s identification details, where available
- The farm location
- Existing rental information, where available

AMCOS information should be stored as the initial or pre-registered farm record.

When an owner or renter later accesses the system, they should be shown suggested or pre-filled farm details from the AMCOS registry.

They should confirm whether the information is correct instead of completing a long registration form from the beginning.

---

# 3. RESPONSIBLE AMCOS INTERFACE

Create a simple AMCOS interface for farm-registry management.

The AMCOS officer should be able to:

- Register farms and hectares
- Register plot numbers
- Register known legal owners
- Add owner phone numbers
- Assign farms to schemes, blocks, and canals
- Enter farm sizes
- Upload existing farm records
- Import farm records from spreadsheets
- Search existing farms
- Update incorrect details
- Flag uncertain ownership information
- View owner-confirmation status
- View renter-confirmation status
- View active seasonal users
- View farms without confirmed owners
- View farms without active seasonal farmers
- View disputes
- Generate farm-registry reports

The system must prevent AMCOS officers from registering duplicate farms.

Before creating a farm, search existing records using:

- Plot number
- Block
- Canal
- Owner name
- Phone number
- GPS location
- Farm code

AMCOS users must only manage farms within their assigned cooperative, scheme, block, or area.

---

# 4. FARM PRE-REGISTRATION STATUS

A farm added by AMCOS should initially have a pre-registration status.

Suggested farm-registry statuses:

- PRE_REGISTERED
- OWNER_CONFIRMATION_PENDING
- OWNER_CONFIRMED
- FIELD_VERIFICATION_PENDING
- FIELD_VERIFIED
- DISPUTED
- INACTIVE
- ARCHIVED

A pre-registered farm must clearly identify:

- The source of the information
- The AMCOS officer who entered it
- The date it was entered
- Whether the owner has confirmed it
- Whether MAYODE has physically verified it
- Whether coordinates and field details are available

Do not treat all AMCOS-entered data as fully verified until the required confirmation and field-validation stages are completed.

---

# 5. OWNER NOTIFICATION AND CONFIRMATION

After the responsible AMCOS registers a farm and identifies its owner, notify the owner using the phone number provided by AMCOS.

The owner may confirm through:

- USSD
- SMS
- Mobile application
- Assisted registration by an officer

Example SMS:

> MAYOData: AMCOS has registered farm MAMCOS-B03-P014 under your name. Do you confirm that this farm belongs to you? Reply 1 for YES, 2 for NO, or 3 for HELP.

Possible responses:

- 1. Yes, the farm is mine
- 2. No, the farm is not mine
- 3. I need assistance

When the owner selects YES:

- Mark the owner-confirmation status as confirmed
- Link the owner’s verified phone number
- Invite the owner to complete their personal profile
- Show the pre-filled farm details
- Ask the owner only for missing information
- Allow the owner to report incorrect details
- Allow the owner to add a renter or lease

When the owner selects NO:

- Do not activate ownership
- Create an ownership-verification task
- Notify the responsible AMCOS officer
- Notify the assigned MAYODE officer
- Mark the farm as disputed or requiring review

---

# 6. OWNER PROFILE COMPLETION

After confirming farm ownership, the owner should complete only the missing personal information.

Possible owner information includes:

- Full name
- Phone number
- Alternative phone number
- National identification information
- Gender, when legally and operationally required
- Date of birth, when required
- Village
- Ward
- District
- Cooperative membership
- Preferred communication language
- Mobile-money account
- Bank account, when required
- Emergency or trusted contact
- Consent and platform terms

The system should display existing AMCOS information as pre-filled, read-only, or editable depending on the user’s permissions.

Do not force owners to repeat:

- Farm code
- Plot number
- Block
- Canal
- Farm size
- Known farm location

Owners should review and confirm those details.

---

# 7. OWNER LEASE MANAGEMENT

After ownership confirmation, the owner must have an **Add Lease** or **Assign Renter** function.

This must be available through:

- Mobile application
- Web application, where applicable
- USSD
- Assisted registration

The owner should be able to enter:

- Farm or hectare
- Farming season
- Renter phone number
- Renter name, where known
- Lease start date
- Lease end date
- Area rented
- Full farm or partial farm
- Rental agreement reference
- Rental amount, when relevant
- Payment arrangement, when relevant
- Notes

After the owner submits lease information:

- Create a pending lease
- Create a pending seasonal farm assignment
- Notify the renter
- Do not require the renter to enter the farm details again
- Ask the renter to confirm the lease
- Ask the renter to complete their personal and financial details
- Activate the renter only after the required confirmation and verification process

---

# 8. RENTER NOTIFICATION AND CONFIRMATION

When an owner assigns a renter, notify the renter automatically.

Example SMS:

> MAYOData: You have been identified by the owner as the renter of farm MAMCOS-B03-P014 for the 2026/2027 farming season. Reply 1 to confirm, 2 to reject, or dial the provided USSD code to continue registration.

Possible renter responses:

- Confirm
- Reject
- Request assistance
- Continue registration

When the renter confirms:

- Link the renter to the existing farm
- Do not create a new farm record
- Ask the renter to complete only missing personal information
- Show the lease period
- Show the farming season
- Show the farm code
- Show the farm size or area rented
- Show the owner’s name where appropriate
- Record the renter as the proposed active seasonal user

When the renter rejects:

- Notify the owner
- Cancel or flag the pending lease
- Do not grant access
- Preserve the rejection record in the audit log

---

# 9. ACTIVE FARM USER LOGIC

The system must distinguish between:

- Legal owner
- Active seasonal farmer
- Renter
- Farm manager
- Shared operator

If a farm is rented for the current season:

- The renter becomes the active seasonal user after verification
- The owner remains the legal owner
- Farm-operational alerts go to the renter
- Ownership and lease notifications go to the owner
- Both may view permitted information based on roles and permissions

If a farm is not rented:

- The legal owner should be treated as the active seasonal farmer if they confirm self-operation
- Operational alerts should go to the owner
- The owner should be invited to activate membership for premium analytics

The system must not automatically assume that an owner is farming the land unless the owner confirms self-operation or no valid renter exists under the configured business rules.

---

# 10. PRE-SEASON OWNER REVIEW

Before each farming season begins, notify every confirmed farm owner to review who will actively use each farm.

The owner should see:

- All owned farms
- Current renters
- Previous renters
- Farms without renters
- Proposed seasonal assignments
- Lease start and end dates

The owner should be able to mark each farm as:

- I will farm it myself
- It is rented
- It will not be cultivated
- The renter has changed
- I need assistance
- The farm information is incorrect

Example USSD flow:

1. Select farm
2. View current status
3. Confirm self-farming
4. Confirm existing renter
5. Enter a new renter
6. Mark farm as not cultivated
7. Request officer assistance

The system should use these responses to determine the correct active user for the upcoming season.

---

# 11. USSD EXPERIENCE

All major registration, confirmation, ownership, and leasing functions must be usable through USSD.

The USSD experience must be short, staged, and similar to familiar mobile-money menus.

Avoid long screens and large forms.

Example main menu:

1. My farms
2. Confirm ownership
3. Add renter
4. Confirm lease
5. Current farming season
6. Membership
7. Alerts
8. Help

Example farm menu:

1. View farm details
2. Confirm farm
3. Report incorrect details
4. Add renter
5. Confirm active farmer
6. Return

Example Add Renter flow:

1. Select farm
2. Select farming season
3. Enter renter phone number
4. Enter lease start date
5. Enter lease end date
6. Confirm details
7. Enter PIN or confirmation code

Where practical, use Yes/No responses.

Examples:

- Reply 1 for YES
- Reply 2 for NO
- Reply 3 for HELP

USSD sessions must support:

- Session timeout handling
- Resume or restart instructions
- Input validation
- Duplicate-submission prevention
- Language selection
- Confirmation before submission
- Transaction reference
- Clear success or failure message

---

# 12. FEATURE-PHONE ACCESS

Users without smartphones must still be able to:

- Confirm farm ownership
- Reject incorrect ownership
- View registered farms
- Add a renter
- Confirm a rental
- Reject a rental
- Confirm self-farming
- View the current active farming season
- Check membership status
- Start membership payment
- Receive alerts
- Request help
- Confirm reward receipt

Detailed analytics may remain available through the application, web portal, SMS summaries, printed reports, or officer-assisted channels.

Do not design the system so that smartphone ownership is required for basic participation.

---

# 13. MOBILE-APPLICATION EXPERIENCE

The mobile application should provide the same business capabilities as USSD but with richer information.

The application should prioritize review and confirmation rather than manual data entry.

The user experience should follow this pattern:

1. Show suggested information
2. Ask the user to confirm
3. Highlight missing information
4. Allow optional corrections
5. Request only essential additional information
6. Complete registration

Example owner screen:

- Farm image or map
- Farm code
- Plot number
- Block
- Canal
- Farm size
- AMCOS
- Ownership-confirmation status
- Active farmer
- Current season
- Add renter button
- Report incorrect details button

Example renter screen:

- Farm code
- Farm owner
- Rental period
- Farming season
- Area assigned
- Confirmation status
- Membership status
- Continue registration button

Do not show all available fields on one mobile screen.

Use:

- Step-by-step forms
- Expandable sections
- Progress indicators
- Saved drafts
- Pre-filled values
- Optional-detail sections

---

# 14. REDUCING REGISTRATION FATIGUE

Registration must be deliberately short.

Use progressive data collection.

## First stage

Collect only:

- Phone number
- Name
- Role
- Farm confirmation
- Farming season
- Consent

## Second stage

Collect:

- Identification
- Location
- Cooperative information
- Financial details
- Rental information

## Later optional stage

Collect:

- Additional farm observations
- Supporting documents
- Photos
- Missing historical information
- Preferences

Do not block basic account creation because optional farm details are missing.

Show a profile-completion percentage but do not overwhelm the user.

Example:

> Your registration is complete. Add two optional details to improve farm recommendations.

---

# 15. MAYODE FIELD DATA COLLECTION

While owners and renters are confirming records, MAYODE field teams should collect and update detailed farm information.

Create a field-data-collection interface that works online and offline.

Field officers should collect:

- GPS coordinates
- Farm boundary
- Farm size verification
- Farm photographs
- Soil-use information
- Current crop
- Previous crop
- Irrigation type
- Water source
- Water accessibility
- Distance from water source
- Distance from the nearest road
- Road accessibility
- Farm slope
- Drainage condition
- Flood risk
- Erosion risk
- Nearby infrastructure
- Storage access
- Machine accessibility
- Electricity access
- Field observations
- Date of inspection
- Officer details

The field-data interface should support:

- Offline capture
- GPS capture
- Photo capture
- Draft saving
- Later synchronization
- Conflict resolution
- Verification status
- Re-inspection scheduling
- Historical comparison

---

# 16. FARM DATA SOURCES

Each farm-data field should record its source.

Possible data sources:

- AMCOS
- Legal owner
- Renter
- MAYODE field officer
- Block leader
- Canal leader
- Neighbor
- Satellite
- Government record
- Sensor
- Imported dataset
- System calculation

Each value should support:

- Source
- Date collected
- Collected by
- Confidence level
- Verification status
- Last updated date
- Previous value
- Evidence

Do not overwrite verified information silently.

Where two sources provide conflicting information:

- Flag the conflict
- Preserve both values
- Assign an officer to review
- Record the approved final value

---

# 17. SATELLITE AND REMOTE DATA

Prepare the architecture for satellite and remote-sensing information.

Possible satellite-derived information includes:

- Vegetation condition
- Crop-health indicators
- Moisture indicators
- Flood exposure
- Drought indicators
- Farm-boundary validation
- Land-use classification
- Seasonal change
- Crop-stage estimates
- Weather-related risk indicators

Satellite information must be treated as an additional data source, not automatically as an unquestionable fact.

The system should record:

- Satellite-data provider
- Image date
- Processing date
- Farm or plot
- Indicator type
- Confidence score
- Model version
- Derived value
- Review status

Do not require satellite integration to block the initial farm-registry implementation.

Implement the system so satellite services can be added or replaced later.

---

# 18. FARM DATA COMPLETENESS

Create a farm-data completeness score.

Example sections:

- Ownership information
- Location information
- Boundary information
- Soil information
- Water information
- Access information
- Crop information
- Field photographs
- Seasonal assignment
- Verification information

Show users which details are:

- Complete
- Missing
- Pending verification
- Outdated
- Conflicting

Do not require ordinary farmers to complete all sections themselves.

Assign missing information to the most suitable party:

- AMCOS
- Owner
- Renter
- Field officer
- MAYODE administrator
- Satellite or system process

---

# 19. ADDITIONAL FARM DETAILS FROM FARMERS

Owners and renters should be allowed to submit missing or corrected farm details.

Provide an **Add More Details** or **Suggest Correction** function.

The user may submit:

- Missing water-source information
- Road-access information
- Current crop
- Farm-condition observations
- Photos
- Boundary concerns
- Soil observations
- Incorrect owner information
- Incorrect farm size
- Incorrect plot number

User-submitted changes should not automatically overwrite verified AMCOS or field-officer information.

Store them as:

- Suggested update
- Pending review
- Approved
- Rejected
- Merged

Notify the responsible officer when review is required.

---

# 20. MAYODE MANAGEMENT INTERFACE

MAYODE management should be able to:

- View all AMCOS farm registrations
- Track owner-confirmation progress
- Track renter-confirmation progress
- Track field-data collection
- Track GPS-boundary completion
- Track satellite-data availability
- Track farms with missing information
- Track ownership conflicts
- Track farms without active seasonal users
- Track registration completion
- Track membership activation
- Assign field officers
- Approve corrections
- Resolve disputes
- Configure farming seasons
- Configure notification templates
- Generate reports

Management dashboards should show:

- Total pre-registered farms
- Confirmed owners
- Unconfirmed owners
- Rejected ownership claims
- Active renters
- Owner-operated farms
- Farms awaiting field visits
- Farms with GPS boundaries
- Farms with complete data
- Farms with conflicts
- Upcoming season readiness

---

# 21. RECOMMENDED END-TO-END WORKFLOW

Implement the following preferred workflow.

## Step 1: AMCOS registers farms

AMCOS enters:

- Farm
- Plot
- Block
- Canal
- Hectares
- Known owner
- Owner phone number

## Step 2: Owner is notified

The owner receives an SMS, USSD prompt, or application notification.

## Step 3: Owner confirms ownership

The owner confirms or rejects the farm.

## Step 4: Owner completes profile

The system requests only missing personal information.

## Step 5: Owner confirms seasonal use

The owner chooses:

- Self-farming
- Rented
- Not cultivated

## Step 6: Owner adds renter

If rented, the owner enters the renter’s basic details.

## Step 7: Renter is notified

The renter confirms or rejects the rental.

## Step 8: Renter completes profile

The renter supplies missing personal, contact, and account information.

## Step 9: Seasonal assignment activates

The renter becomes the active user for that farm and season.

## Step 10: Field data is collected

MAYODE officers collect coordinates, boundaries, images, soil, water, road, and infrastructure details.

## Step 11: Data is improved continuously

The platform updates farm information using:

- Field visits
- Owner feedback
- Renter feedback
- AMCOS corrections
- Satellite information
- Farm activities

## Step 12: Farmer subscribes

The active farmer activates membership to access analytics, recommendations, and premium services.

---

# 22. DATABASE ENTITIES

Review existing models before creating duplicates.

Add or improve entities such as:

## ResponsibleAMCOS

- id
- name
- scheme
- contact
- assigned area
- status

## FarmRegistryRecord

- id
- farmId
- sourceAMCOSId
- sourceOfficerId
- legalOwnerId
- ownerNameProvided
- ownerPhoneProvided
- plotNumber
- block
- canal
- scheme
- farmSize
- registrationStatus
- ownerConfirmationStatus
- fieldVerificationStatus
- createdAt
- updatedAt

## OwnerConfirmationRequest

- id
- farmId
- proposedOwnerId
- phoneNumber
- channel
- token
- status
- response
- sentAt
- expiresAt
- respondedAt

## Lease

- id
- farmId
- ownerId
- renterId
- renterPhone
- farmingSeasonId
- startDate
- endDate
- rentedArea
- leaseStatus
- ownerConfirmedAt
- renterConfirmedAt
- verifiedAt

## FarmFieldSurvey

- id
- farmId
- officerId
- surveyDate
- latitude
- longitude
- boundary
- photographs
- soilUse
- waterSource
- roadDistance
- waterDistance
- accessCondition
- observations
- verificationStatus
- syncStatus

## FarmDataValue

- id
- farmId
- fieldName
- value
- sourceType
- sourceId
- confidenceLevel
- verificationStatus
- recordedAt
- verifiedAt
- supersededBy

## SuggestedFarmUpdate

- id
- farmId
- submittedBy
- fieldName
- currentValue
- suggestedValue
- evidence
- reviewStatus
- reviewedBy
- reviewedAt

---

# 23. AUTHORIZATION RULES

Enforce the following:

- AMCOS officers can enter farm-registry information only in their assigned area.
- Owners can confirm or reject farms assigned to them.
- Owners can add renters only to confirmed farms they legally own.
- Renters can confirm only leases linked to their verified phone number or account.
- Renters cannot change ownership information.
- Field officers can update field-survey data only for assigned farms.
- MAYODE management can review, approve, reject, and resolve conflicts.
- Ordinary users cannot view private AMCOS contact lists.
- Ordinary users cannot view other owners’ phone numbers.
- No user should gain active farm access through frontend manipulation.
- All access changes must be confirmed by the backend.

---

# 24. NOTIFICATION REQUIREMENTS

Add notification templates for:

- AMCOS farm registration completed
- Owner ownership confirmation
- Ownership rejected
- Owner profile completion
- Add renter reminder
- Renter lease confirmation
- Renter lease rejection
- Seasonal-user confirmation
- Pre-season review
- Farm field visit
- Missing farm details
- Farm correction approved
- Farm correction rejected
- Membership invitation
- Membership expiry
- Premium analytics available

Support both English and Swahili.

Use short, understandable language for SMS and USSD.

---

# 25. TESTING SCENARIOS

Add tests for at least the following:

1. AMCOS can pre-register a farm.
2. AMCOS cannot register a duplicate plot in the same scheme and block.
3. An owner receives a confirmation request.
4. An owner confirms ownership through USSD.
5. An owner rejects incorrect ownership.
6. A confirmed owner completes only missing details.
7. An owner adds a renter through the application.
8. An owner adds a renter through USSD.
9. A renter receives a lease-confirmation request.
10. A renter confirms and becomes the proposed seasonal user.
11. A renter rejecting a lease does not receive farm access.
12. A renter does not create a duplicate farm.
13. A non-rented farm can be assigned to the owner as the active seasonal user.
14. A field officer can capture GPS coordinates offline.
15. Offline field data synchronizes correctly.
16. A farmer can suggest a correction.
17. A suggested correction does not overwrite verified data before approval.
18. Conflicting information creates a review task.
19. Private owner information is protected.
20. A feature-phone user can complete ownership and rental confirmation.
21. The active seasonal user receives operational notifications.
22. The legal owner continues to receive ownership notifications.
23. Previous renters do not remain active in a new season.
24. Farm data preserves its source and verification history.
25. AMCOS users cannot access farms outside their assigned scope.

---

# 26. USER-EXPERIENCE PRINCIPLES

Follow these principles:

- Prefer confirmation over manual entry.
- Prefer pre-filled information over blank forms.
- Ask only for missing information.
- Keep USSD menus short.
- Use familiar Yes/No choices.
- Save progress after every major step.
- Do not display too many fields at once.
- Make correction options visible.
- Clearly show verification status.
- Clearly distinguish owner from active seasonal farmer.
- Support users with smartphones and feature phones equally for basic workflows.
- Keep detailed technical and farm data collection primarily with AMCOS and MAYODE officers.
- Allow farmers to add missing information without making registration exhausting.
- Make registration, subscription, and farm activation the main farmer responsibilities.
- Preserve a complete audit trail for every confirmation, correction, lease, and assignment.

---

# 27. REQUIRED OUTPUT FROM THE AGENTS

After reviewing the existing system, provide:

1. Existing modules that can be reused.
2. Current gaps in AMCOS, owner, renter, and management interfaces.
3. Updated end-to-end workflow.
4. Database changes.
5. API changes.
6. USSD menu design.
7. SMS templates in English and Swahili.
8. Mobile-screen changes.
9. AMCOS dashboard changes.
10. MAYODE management dashboard changes.
11. Field-data collection workflow.
12. Offline synchronization approach.
13. Satellite-integration extension points.
14. Access-control rules.
15. Migration plan for existing farms.
16. Automated tests.
17. Manual testing steps.
18. Assumptions and unresolved dependencies.

Implement the solution in the existing application.

Do not only produce mockups, recommendations, or documentation. Make the necessary database, backend, mobile, web, USSD, notification, authorization, and testing changes while preserving the existing project architecture.
