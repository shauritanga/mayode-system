# PROMPT: IMPLEMENT FARM ACCESS, MEMBERSHIP, VERIFICATION, NOTIFICATIONS, SEASON MANAGEMENT, AND FARMER REWARDS IN THE EXISTING MAYODATA PLATFORM

You are working on an existing agricultural management platform called **MAYOData**.

Do not rebuild the application from scratch.

First inspect the current implementation, database schema, authentication, roles, farm registration, farmer registration, cooperative management, notifications, payments, subscriptions, and analytics modules.

Reuse the existing architecture, coding conventions, UI components, APIs, database models, and permission system wherever possible.

Your responsibility is to extend the current platform with the following business rules and workflows.

---

# 1. CORE BUSINESS PRINCIPLE

Farm registration must remain free.

Do not require payment before a farmer, farm owner, renter, cooperative officer, field officer, or MAYODE administrator can register:

- A farmer
- A farm
- A plot
- Farm ownership information
- Rental information
- Cooperative membership
- Basic farming activities
- Basic profile information

Payment or active membership should only be required for premium services that provide advanced value.

Premium services may include:

- Farm analytics
- Productivity analysis
- Yield forecasts
- Risk analysis
- Soil recommendations
- Fertilizer recommendations
- Pest and disease insights
- Irrigation recommendations
- Financial analysis
- Farm comparison reports
- Personalized farming recommendations
- Advanced crop calendars
- Immediate-action recommendations
- Historical performance trends
- Premium reports
- Machine-support opportunities
- Fertilizer-support opportunities
- Seed-support opportunities
- Other advanced advisory services

The free registration flow must not discourage farmers from joining the platform.

---

# 2. FREE AND PREMIUM ACCESS MODEL

Implement a clear access-control system with at least two access levels:

## 2.1 Free access

Free users should be able to:

- Create an account
- Register a farmer profile
- Register a farm
- Register plots
- View basic farm information
- Record farm activities
- Record crop-cycle information
- Record expenses
- Record labor
- Record farm inputs
- Upload basic farm documents
- Receive general notifications
- Receive alerts indicating that an issue or action has been detected
- View membership plans
- Start a membership payment

## 2.2 Premium membership access

Users with an active membership should be able to access:

- Full farm analytics
- Detailed alert explanations
- Recommended corrective actions
- Yield prediction
- Productivity reports
- Risk reports
- Farm comparisons
- Advanced farming recommendations
- Premium reports and downloadable documents
- Premium support programmes
- Other paid features already available in the system

The system must support feature-level access control rather than only hiding complete pages.

For example:

- A free user may see that a critical farm issue exists.
- The user may see the affected farm and urgency level.
- The detailed diagnosis, recommendation, and action plan should require active membership.

---

# 3. PREMIUM ALERT AND MEMBERSHIP CONVERSION FLOW

Implement a notification system that informs farmers when immediate farm action may be required.

Examples:

- Irrigation may be required
- A farm activity is overdue
- Fertilizer application is due
- Pest or disease risk has been detected
- Crop progress is behind schedule
- Heavy rainfall may affect the farm
- Harvesting time is approaching
- A crop-cycle activity has not been recorded
- Farm productivity is lower than expected

The notification must not contain misleading or false fear-based messaging.

It should communicate urgency clearly but responsibly.

Example:

> An important action may be required on Farm Plot MAMCOS-B03-P014. Open the recommendation to review the detected issue and suggested action.

## 3.1 Behaviour for premium members

When an active member opens the notification:

- Open the complete alert details
- Show the reason for the alert
- Show affected farm or plot
- Show urgency level
- Show recommended action
- Show expected action date
- Show supporting analytics
- Allow the user to mark the action as completed
- Allow the user to record observations, photos, expenses, inputs, and labor

## 3.2 Behaviour for non-members

When a free user opens a premium alert:

- Show a limited preview
- Show the affected farm or plot
- Show alert category
- Show urgency level
- Hide premium details
- Display a clear membership call-to-action
- Redirect the user to membership plans when they choose to unlock the recommendation

Suggested message:

> An important recommendation is available for this farm. Activate your MAYOData membership to view the full analysis and recommended action.

Do not expose premium data through APIs, hidden fields, mobile application state, network responses, or frontend-only restrictions.

Membership access must be validated by the backend.

---

# 4. MEMBERSHIP PERIOD AND FARMING SEASONS

Membership should be linked to one complete farming season.

The platform must not hard-code one permanent annual period because farming seasons may differ by scheme, crop, region, or year.

Create a configurable `FarmingSeason` module.

Each season should include:

- Season name
- Scheme
- Cooperative
- Region
- Crop
- Start date
- End date
- Registration opening date
- Registration closing date
- Rental-verification deadline
- Farming start date
- Expected harvesting period
- Status
- Created by
- Updated by

Possible statuses:

- DRAFT
- REGISTRATION_OPEN
- VERIFICATION_IN_PROGRESS
- ACTIVE
- HARVESTING
- COMPLETED
- ARCHIVED

Membership should include:

- User
- Farmer
- Membership plan
- Farming season
- Start date
- End date
- Payment status
- Membership status
- Activation date
- Expiration date
- Renewal status
- Payment reference
- Created by
- Approved by

Possible membership statuses:

- PENDING
- PAYMENT_PENDING
- ACTIVE
- EXPIRED
- CANCELLED
- SUSPENDED
- WAIVED
- SPONSORED

Support periods such as:

- July to July
- August to August
- A custom season-specific period

The period must be configured by authorized administrators.

Do not hard-code July or August as the only supported start month.

---

# 5. FARM OWNERSHIP AND RENTAL MODEL

A farm must be registered independently from the person farming it during a particular season.

Separate the following concepts:

- Farm
- Plot
- Legal owner
- Seasonal operator
- Renter
- Farming season
- Rental agreement
- Verification status
- Access rights

A farm may remain owned by the same person while different renters use it during different seasons.

Create or improve a seasonal farm-access model.

Suggested entity:

`FarmSeasonAssignment`

Required fields:

- Farm
- Plot
- Farming season
- Legal owner
- Active farmer
- Renter, when applicable
- Assignment type
- Start date
- End date
- Verification status
- Verification method
- Verified by
- Verification date
- Owner confirmation status
- Cooperative confirmation status
- MAYODE officer confirmation status
- Notes
- Supporting documents
- Status

Assignment types:

- OWNER_OPERATED
- RENTED
- FAMILY_MEMBER
- COOPERATIVE_ASSIGNED
- SHARED_OPERATION
- OTHER

Verification statuses:

- PENDING
- OWNER_CONFIRMED
- COOPERATIVE_CONFIRMED
- OFFICER_VERIFIED
- REJECTED
- DISPUTED
- EXPIRED

Only the verified active farmer for the current season should receive farm-specific recommendations, analytics, alerts, and activity responsibilities.

The legal owner may still receive ownership-related notifications.

---

# 6. PRE-REGISTRATION OF FARMS AND LEGAL OWNERS

Before the beginning of a farming season, authorized users should be able to register existing farms and their known legal owners.

Authorized users may include:

- MAYODE administrators
- MAYOData officers
- MAMCOS cooperative administrators
- Scheme leaders
- Block leaders
- Canal leaders
- Authorized field officers

The system should maintain an official farm registry containing:

- Scheme
- Cooperative
- Block
- Canal
- Plot number
- Farm code
- Farm name
- Farm size
- GPS boundary
- Current legal owner
- Owner phone number
- Owner identification details, when available
- Neighboring farms
- Neighboring farm owners
- Block leader
- Canal leader
- Verification status
- Verification history
- Ownership history
- Seasonal-user history

Each farm must have a clear and unique name or code.

Suggested naming structure:

`SCHEME-COOPERATIVE-BLOCK-PLOT`

Example:

`MAYO-MAMCOS-B03-P014`

The existing naming approach should be preserved if one is already implemented and suitable.

---

# 7. FARM SEARCH DURING RENTER REGISTRATION

When a renter registers, the renter should not create a duplicate farm.

The renter should search for and select an existing farm using details such as:

- Farm code
- Plot number
- Block
- Canal
- Cooperative
- Owner name
- Owner phone number
- Farm location

After selecting a farm, display:

- Farm code
- Plot number
- Block
- Canal
- Farm size
- Legal owner name
- Farm location
- Farm map, when available

Hide sensitive owner information that the renter does not need.

Before continuing, the renter must confirm:

> I confirm that this is the farm I have rented for the selected farming season.

After confirmation:

- Create a pending seasonal assignment
- Do not immediately grant full farm access
- Begin the verification workflow
- Prevent duplicate active assignments for the same farm, plot, and season unless shared farming is explicitly authorized

---

# 8. TWO SUPPORTED RENTAL-REGISTRATION FLOWS

The system must support both of the following workflows.

## 8.1 Renter-initiated registration

1. The renter creates an account or uses USSD.
2. The renter searches for the registered farm.
3. The renter selects the correct farm.
4. The renter selects the farming season.
5. The renter confirms the owner.
6. The renter enters rental details.
7. The system creates a pending assignment.
8. The owner is contacted for confirmation.
9. The cooperative or MAYODE officer verifies the assignment.
10. After verification, the renter receives seasonal farm access.

## 8.2 Owner-initiated registration

1. The owner selects a farm.
2. The owner selects the new renter.
3. The owner enters the renter's phone number and rental period.
4. The system sends an SMS or USSD request to the renter.
5. The renter confirms the rental.
6. The renter completes personal and account information.
7. The system creates or updates the seasonal assignment.
8. The cooperative or MAYODE officer completes final verification.
9. The renter receives seasonal farm access.

The system should allow administrators to configure which workflow is preferred for a cooperative or scheme.

---

# 9. OWNER VERIFICATION THROUGH SMS OR USSD

Many farm owners may not have smartphones.

The system must therefore support verification through:

- SMS
- USSD
- Assisted verification by a MAYODE officer
- Assisted verification by a cooperative officer
- Smartphone application, when available

Example owner verification message:

> MAYOData: John Mushi has requested access to farm MAMCOS-B03-P014 for the 2026/2027 farming season. Do you recognize this renter? Reply 1 for YES or 2 for NO.

Possible responses:

- YES
- NO
- STOP
- HELP

For USSD, use short numeric responses:

- 1. Yes
- 2. No
- 3. I need help

The system must:

- Record the phone number used
- Record response date and time
- Record the response channel
- Link the response to the assignment
- Prevent repeated use of expired verification requests
- Expire requests after a configurable period
- Allow resend with rate limiting
- Keep an audit trail
- Notify the renter of the outcome

Owner confirmation alone may not be enough for final verification where local policy requires cooperative or officer verification.

---

# 10. MAYODE OFFICER VERIFICATION

When an owner cannot verify digitally, a MAYODE or MAYOData officer should complete assisted verification.

The officer should be able to see:

- Farm details
- Plot number
- Block
- Canal
- Legal owner
- Proposed renter
- Neighboring farms
- Two neighboring farm owners
- Block leader
- Canal leader
- Cooperative leaders
- Ownership history
- Previous renters
- Supporting documents
- GPS location
- Farm boundary
- Current verification stage

The officer should not need to manually ask for information that is already recorded in the system.

The system should automatically display the relevant leaders and neighboring farms based on:

- Scheme
- Cooperative
- Block
- Canal
- GPS location
- Plot adjacency
- Existing farm registry

The officer may verify by contacting:

- Legal owner
- Block leader
- Canal leader
- Cooperative leader
- Neighboring farm owners

The officer must record:

- Person contacted
- Contact method
- Contact phone number
- Verification response
- Verification notes
- Date and time
- Supporting evidence
- Final decision

Final decisions:

- VERIFIED
- REJECTED
- NEEDS_MORE_INFORMATION
- DISPUTED

All officer decisions must be included in an audit log.

---

# 11. NEIGHBOR AND LOCAL-LEADERSHIP VERIFICATION

When a farm is registered, the system should identify and show at least two relevant neighboring farms where reliable map or registry data exists.

For each neighboring farm, show authorized officers:

- Neighboring farm code
- Owner or active farmer
- Contact information
- Relationship to the selected farm
- Shared boundary information, when available

Also associate farms with:

- Scheme leader
- Cooperative leader
- Block leader
- Canal leader
- Field officer

Do not expose personal phone numbers to ordinary users unless permission has been explicitly granted.

These details should be available only to roles involved in verification and administration.

---

# 12. PRE-SEASON FARM-OCCUPANCY CONFIRMATION

Before a new farming season starts, the platform should send confirmation messages to legal owners.

## 12.1 Farm currently assigned to a renter

Example message:

> MAYOData: You previously confirmed that John Mushi will farm plot MAMCOS-B03-P014 from 1 November 2026 to 30 June 2027. Reply 1 to confirm, 2 to reject, or 3 for assistance.

## 12.2 Farm not assigned to a renter

Example message:

> MAYOData: No renter is currently registered for farm MAMCOS-B03-P014 for the upcoming season. Reply 1 if you will farm it yourself, 2 if it will be rented, or 3 if the farm will not be cultivated.

Possible owner choices:

- SELF_FARMING
- RENTED
- NOT_CULTIVATED
- UNDECIDED
- NEED_HELP

When the owner chooses self-farming:

- Create an owner-operated seasonal assignment
- Invite the owner to register for MAYOData services
- Explain available analytics, farming information, fertilizer support, seed support, machine support, and other programmes

When the owner chooses rented:

- Request renter details
- Create a pending seasonal assignment
- Start verification

When the owner chooses not cultivated:

- Record the farm as inactive for that season
- Do not send operational farming alerts to the owner as though cultivation is occurring

---

# 13. SEASONAL ACCESS CONTROL

Farm access must automatically follow the seasonal assignment.

When a seasonal assignment becomes active:

- Grant the verified farmer access to the farm
- Allow farm activity recording
- Send farm-specific alerts
- Include the farm in the farmer dashboard
- Include the farm in analytics, subject to membership
- Allow cooperative and officers to supervise the farm

When the season or assignment ends:

- Remove active operational access
- Preserve historical records
- Preserve ownership rights
- Preserve reports from the completed season
- Stop sending new operational alerts to the former renter
- Allow the former renter to view permitted historical records
- Require a new assignment for the next season

Do not delete historical farm, rental, activity, analytics, payment, or verification records.

---

# 14. COOPERATIVE AND MAMCOS RESPONSIBILITIES

The cooperative module must allow authorized MAMCOS users to:

- Register cooperative members
- Register known farm owners
- Register farms and plots
- Assign blocks and canals
- Maintain block leaders
- Maintain canal leaders
- Maintain scheme leaders
- Review renters
- Review seasonal assignments
- Support verification
- View disputed assignments
- View farms without active farmers
- View farmers without verified farms
- View upcoming season readiness
- Generate verification reports
- Generate farm-occupancy reports
- Generate ownership reports
- Generate renter reports

Cooperative users must only access farms and farmers under their authorized cooperative, scheme, block, or canal scope.

---

# 15. FARMER REWARD AND AWARD SYSTEM

Implement a configurable farmer reward and award programme.

The platform may provide annual or seasonal benefits such as:

- Fertilizer subsidy
- Free fertilizer bags
- Seed support
- Machine services
- Irrigation support
- Training opportunities
- Farm-input vouchers
- Recognition certificates
- Other approved benefits

Create a `RewardCampaign` module.

Required campaign fields:

- Campaign name
- Description
- Sponsor
- Reward type
- Reward quantity
- Number of winners
- Farming season
- Eligible cooperatives
- Eligible schemes
- Eligibility start date
- Eligibility end date
- Selection method
- Selection date
- Campaign status
- Created by
- Approved by

Possible campaign statuses:

- DRAFT
- ACTIVE
- SELECTION_PENDING
- WINNERS_SELECTED
- ANNOUNCED
- FULFILLED
- CANCELLED

---

# 16. FAIR WINNER SELECTION

Support multiple selection methods:

- Random selection
- Performance-based selection
- Participation-based selection
- Need-based selection
- Hybrid selection
- Manual selection with approval

For random selection, do not simply select any registered account.

The farmer must first meet configurable eligibility rules.

Possible eligibility rules:

- Verified farmer profile
- Verified farm assignment
- Active farming season
- Minimum number of recorded farm activities
- No duplicate or fraudulent account
- Valid phone number
- Cooperative membership, where required
- Farm registered before a specified deadline
- Consent to programme terms
- Not already selected in a conflicting campaign
- Active MAYOData usage
- Membership status, only where the campaign requires it

The selection process must:

- Be reproducible
- Store the eligible farmer list
- Store the selection timestamp
- Store the selection algorithm version
- Store the random seed or secure selection reference where appropriate
- Keep an audit trail
- Prevent unauthorized replacement of winners
- Support approval before announcement
- Support backup winners
- Avoid bias toward staff-created accounts or duplicate accounts

Example:

- Select five eligible farmers each year for fertilizer support.

---

# 17. WINNER NOTIFICATION AND REWARD FULFILMENT

Winners should be notified through:

- In-app notification
- SMS
- USSD status
- Officer-assisted communication

Example SMS:

> Congratulations. You have been selected for MAYODE fertilizer support for farm MAMCOS-B03-P014. You will receive four fertilizer bags. A MAYODE officer will contact you with collection details.

The reward record should include:

- Farmer
- Farm
- Plot
- Farming season
- Reward campaign
- Reward type
- Quantity
- Selection status
- Notification status
- Redemption status
- Distribution location
- Distribution date
- Officer responsible
- Farmer confirmation
- Supporting document
- Notes

Possible reward statuses:

- SELECTED
- APPROVED
- NOTIFIED
- ACCEPTED
- DECLINED
- DISTRIBUTION_PENDING
- DISTRIBUTED
- CONFIRMED
- CANCELLED

---

# 18. NOTIFICATION CHANNELS

Create a unified notification service supporting:

- In-app notifications
- Push notifications
- SMS
- USSD-triggered messages
- Email, where available
- Officer task notifications

Notification categories should include:

- FARM_ALERT
- PREMIUM_RECOMMENDATION
- MEMBERSHIP_EXPIRY
- PAYMENT_CONFIRMATION
- OWNER_VERIFICATION
- RENTER_VERIFICATION
- OFFICER_VERIFICATION_TASK
- SEASON_START
- SEASON_END
- FARM_OCCUPANCY_CONFIRMATION
- REWARD_WINNER
- REWARD_COLLECTION
- ACTIVITY_REMINDER
- SYSTEM_ANNOUNCEMENT

Each notification should record:

- Recipient
- Recipient role
- Channel
- Template
- Language
- Farm
- Plot
- Season
- Related entity
- Delivery status
- Read status
- Sent date
- Response
- Retry count
- Failure reason

Support both English and Swahili notification templates.

---

# 19. DASHBOARD REQUIREMENTS

## 19.1 Farmer dashboard

Display:

- Current active season
- Active farms
- Verification status
- Membership status
- Membership expiration
- Pending verification requests
- Basic farm alerts
- Locked premium alerts
- Upcoming activities
- Reward announcements
- Support-programme opportunities

Keep the mobile interface simple.

Do not overload the home screen.

Use summary cards and progressive disclosure.

## 19.2 Farm owner dashboard

Display:

- Owned farms
- Current seasonal users
- Pending renter-verification requests
- Upcoming season confirmations
- Previous renters
- Disputed assignments
- Farm status by season

## 19.3 Cooperative dashboard

Display:

- Registered farms
- Verified owners
- Active renters
- Pending assignments
- Farms without seasonal operators
- Disputed farms
- Verification workload
- Season-readiness percentage

## 19.4 MAYODE officer dashboard

Display:

- Assigned verification tasks
- Farms requiring field verification
- Owner confirmation failures
- Conflicting assignments
- Neighbor verification information
- Pending documents
- Season deadlines

## 19.5 Administrator dashboard

Display:

- Membership statistics
- Premium conversion statistics
- Farm-registration statistics
- Seasonal occupancy
- Verification statistics
- Notification delivery statistics
- Reward campaign statistics
- Payment statistics
- Audit activity

---

# 20. REQUIRED ROLE-BASED ACCESS CONTROL

Review and extend the existing role system.

Suggested roles include:

- FARMER
- FARM_OWNER
- RENTER
- COOPERATIVE_MEMBER
- COOPERATIVE_ADMIN
- BLOCK_LEADER
- CANAL_LEADER
- SCHEME_LEADER
- FIELD_OFFICER
- MAYODATA_OFFICER
- MAYODE_ADMIN
- FINANCE_OFFICER
- REWARD_MANAGER
- SYSTEM_ADMIN

A user may have multiple roles.

Permissions must be scoped by:

- Cooperative
- Scheme
- Block
- Canal
- Farm
- Plot
- Farming season

Do not rely only on frontend route hiding.

All sensitive access must be checked by the backend.

---

# 21. DATA-INTEGRITY RULES

Enforce the following rules:

1. A farm must not be duplicated because a renter is registering.
2. A legal owner remains associated with the farm unless an authorized ownership-transfer process is completed.
3. Only one primary seasonal operator should exist per farm and season unless shared operation is approved.
4. A renter must not receive full farm access before verification.
5. A previous renter must not continue receiving current-season operational alerts.
6. Expired membership must block premium details but not basic farm records.
7. Farm history must never be deleted when a rental ends.
8. Verification actions must be auditable.
9. Reward selection must be auditable.
10. Owners without smartphones must still be able to participate.
11. Phone-number changes must require verification.
12. Conflicting ownership or rental claims must be flagged for review.
13. Premium API responses must not expose locked information to free users.
14. Every farm assignment must belong to a farming season.
15. Every analytics record must identify the farm, plot, season, and farmer assignment used to generate it.

---

# 22. DISPUTE MANAGEMENT

Implement a dispute workflow for cases such as:

- Owner rejects renter
- Two renters claim the same farm
- Cooperative records conflict with owner response
- Farm owner is unknown
- Plot number is incorrect
- Farm boundary overlaps another farm
- Neighbor information conflicts
- Previous renter still claims access
- Ownership transfer is disputed

A dispute should include:

- Farm
- Plot
- Season
- Claimants
- Dispute type
- Description
- Supporting evidence
- Assigned officer
- Status
- Resolution
- Resolved by
- Resolution date
- Audit history

Possible statuses:

- OPEN
- UNDER_REVIEW
- FIELD_VERIFICATION_REQUIRED
- RESOLVED
- REJECTED
- ESCALATED

While a dispute is open, restrict sensitive farm access until an authorized officer resolves it.

---

# 23. MEMBERSHIP PAYMENT AND RENEWAL

Integrate membership with the existing payment system.

Support:

- Mobile-money payment
- Bank payment
- Sponsored membership
- Cooperative-paid membership
- Voucher-based activation
- Administrative waiver
- Renewal before expiry

When payment succeeds:

- Validate the payment on the backend
- Activate membership
- Link it to the correct farmer and season
- Record the payment reference
- Send confirmation
- Unlock premium features immediately

Before expiration:

- Send reminders
- Show renewal options
- Preserve farm data if membership expires

Membership expiration must not delete or hide basic farm ownership and activity records.

---

# 24. ANALYTICS ACCESS IMPLEMENTATION

Every analytics endpoint must check:

- Authenticated user
- User role
- Farm access
- Seasonal assignment
- Verification status
- Membership status
- Feature entitlement

Create reusable authorization functions or guards, such as:

- `canViewFarm`
- `canManageFarm`
- `canViewPremiumAnalytics`
- `canVerifyRental`
- `canManageSeason`
- `canRunRewardSelection`
- `canViewOwnerContact`
- `canResolveFarmDispute`

Return clear API errors:

- `FARM_ACCESS_DENIED`
- `SEASON_ASSIGNMENT_REQUIRED`
- `FARM_VERIFICATION_PENDING`
- `MEMBERSHIP_REQUIRED`
- `MEMBERSHIP_EXPIRED`
- `FEATURE_NOT_INCLUDED`
- `VERIFICATION_PERMISSION_DENIED`

---

# 25. AUDIT LOGGING

Record all sensitive actions, including:

- Farm registration
- Ownership changes
- Rental requests
- Owner responses
- Cooperative verification
- Officer verification
- Seasonal-access activation
- Seasonal-access expiration
- Membership activation
- Membership expiry
- Payment confirmation
- Reward eligibility generation
- Winner selection
- Winner approval
- Reward distribution
- Dispute resolution
- Manual overrides

Each audit record should include:

- User
- Role
- Action
- Entity type
- Entity ID
- Previous value
- New value
- Date and time
- IP address where applicable
- Device or channel
- Reason
- Approval reference

---

# 26. OFFLINE AND ASSISTED REGISTRATION

Because some users may have limited internet access or no smartphone, support:

- Officer-assisted registration
- Cooperative-assisted registration
- Offline form capture
- Later synchronization
- SMS verification
- USSD registration and confirmation
- Duplicate detection after synchronization

Offline changes must be assigned temporary local identifiers and reconciled with server identifiers after synchronization.

Potential conflicts must be sent for review rather than silently overwriting verified data.

---

# 27. REQUIRED USER INTERFACES

Implement or improve the following screens:

## Farmer and renter screens

- Membership status
- Membership plans
- Premium-feature preview
- Locked analytics screen
- Farm search
- Farm confirmation
- Rental request
- Verification status
- Active season
- Current farm assignments
- Historical assignments
- Alert details
- Reward notifications

## Farm-owner screens

- Owned farms
- Renter requests
- Current renters
- Previous renters
- Season confirmations
- Ownership disputes

## Cooperative screens

- Farm registry
- Farmer registry
- Owner registry
- Seasonal assignments
- Verification queue
- Block and canal management
- Farms without operators
- Disputes
- Verification reports

## MAYODE officer screens

- Verification tasks
- Farm details
- Owner and renter information
- Neighbor information
- Local leaders
- Contact log
- Verification decision
- Supporting evidence upload

## Administrator screens

- Farming-season configuration
- Membership-plan configuration
- Premium-feature configuration
- Notification-template configuration
- Reward-campaign configuration
- Winner-selection approval
- Audit logs
- Analytics and reports

---

# 28. REPORTING REQUIREMENTS

Generate reports for:

- Farms by legal owner
- Farms by active seasonal farmer
- Rented farms
- Owner-operated farms
- Unverified rentals
- Disputed assignments
- Farms without seasonal operators
- Farms not cultivated
- Membership status
- Membership revenue
- Premium conversion
- Verification response rates
- SMS and USSD delivery
- Season readiness
- Reward eligibility
- Reward winners
- Reward fulfilment
- Farm alerts and completed actions

Support filtering by:

- Season
- Region
- District
- Scheme
- Cooperative
- Block
- Canal
- Farmer
- Owner
- Renter
- Verification status
- Membership status

---

# 29. TESTING REQUIREMENTS

Add automated tests for at least the following scenarios:

1. A farmer registers a farm without paying.
2. A free user can record basic farm activities.
3. A free user cannot access full premium analytics.
4. A free user can see a limited premium-alert preview.
5. A paid member can open the complete alert.
6. A renter selects an existing farm without creating a duplicate.
7. A renter cannot access a farm before verification.
8. An owner approves a renter through SMS or USSD.
9. An owner rejects a renter.
10. An officer verifies a renter through assisted verification.
11. A previous renter loses active access after the season ends.
12. Historical renter records remain available.
13. Two renters cannot be assigned as primary operators for the same farm and season.
14. A disputed assignment restricts operational access.
15. Membership activates after a successful payment.
16. Membership expires correctly.
17. Reward selection only includes eligible farmers.
18. Reward selection produces the configured number of winners.
19. Winner selection is recorded in the audit log.
20. Unauthorized users cannot access owner contact details.
21. Cooperative officers only access their assigned scope.
22. Notifications are sent to the correct seasonal farmer.
23. Owners receive ownership-related notifications.
24. Locked premium data is not returned by the API.
25. Offline-created records synchronize without duplication.

---

# 30. IMPLEMENTATION APPROACH

Follow this sequence:

## Phase 1: Existing-system assessment

- Inspect the current codebase
- Identify relevant modules
- Document existing database models
- Identify reusable features
- Identify missing features
- Identify migration risks

## Phase 2: Domain and database design

- Add farming seasons
- Add seasonal farm assignments
- Add verification requests
- Add verification responses
- Add local leadership and neighbor relationships
- Add memberships and entitlements
- Add reward campaigns
- Add reward winners
- Add disputes
- Add notification tracking
- Add audit records

## Phase 3: Backend implementation

- Add services
- Add APIs
- Add authorization guards
- Add validation
- Add background notification jobs
- Add scheduled season jobs
- Add payment integration
- Add reward-selection service

## Phase 4: Mobile and web interfaces

- Add simple mobile workflows
- Add officer verification tools
- Add cooperative dashboards
- Add administrative configuration
- Add premium lock screens

## Phase 5: SMS and USSD integration

- Add verification templates
- Add inbound-response handling
- Add request expiry
- Add retry and rate limiting
- Add audit tracking

## Phase 6: Testing and migration

- Write unit tests
- Write integration tests
- Test role permissions
- Test seasonal transitions
- Test data migration
- Test low-connectivity workflows

---

# 31. REQUIRED OUTPUT FROM THE DEVELOPMENT AGENTS

After inspecting and implementing the features, provide:

1. A summary of the existing implementation.
2. A gap analysis.
3. The proposed architecture.
4. Updated database entities and relationships.
5. Database migrations.
6. Backend services and endpoints.
7. Mobile and web screens added or changed.
8. Role and permission changes.
9. SMS and USSD workflow.
10. Membership and premium-feature logic.
11. Farming-season logic.
12. Farm-owner and renter-verification workflow.
13. Reward-selection workflow.
14. Notification workflow.
15. Audit-log implementation.
16. Automated tests.
17. Manual testing instructions.
18. Deployment and migration instructions.
19. List of assumptions made.
20. List of unresolved external dependencies.

---

# 32. IMPORTANT IMPLEMENTATION RULES

- Do not rebuild working modules unnecessarily.
- Do not duplicate farm records during renter registration.
- Do not make farm registration a paid feature.
- Do not implement premium restrictions only on the frontend.
- Do not send farm alerts to an unverified or expired seasonal user.
- Do not remove the legal owner when a renter is assigned.
- Do not delete historical assignments.
- Do not hard-code one farming season for every scheme.
- Do not expose private contact information to unauthorized users.
- Do not announce reward winners before approval.
- Do not select reward winners from unverified or duplicate accounts.
- Do not silently resolve ownership conflicts.
- Use database transactions for critical verification, assignment, membership, and reward operations.
- Preserve backward compatibility with the existing application wherever reasonably possible.
- Clearly document all breaking changes.
- Ensure all important flows work for users without smartphones through assisted registration, SMS, or USSD.
