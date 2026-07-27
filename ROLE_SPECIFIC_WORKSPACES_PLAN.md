# Role-specific MAYOData Workspaces

> Implementation note (2026-07-27): role-aware workspace context, renter
> assignment authorization, AMCOS-scoped registry/lease lists, mobile role
> dashboards, and web role-aware navigation have been implemented. The
> remaining fresh-start database migration (retiring legacy farmer-owned farm
> records) must be applied deliberately before production data is introduced.

## Summary

Transform MAYOData into one role-adaptive platform with four complete workspaces:

- Renter / seasonal farmer — mobile
- Field Officer — mobile
- AMCOS Officer — mobile and restricted AMCOS web workspace
- Admin/Management — web only

AMCOS is the legal owner of every farm. Farmers do not own farms; they rent and operate AMCOS farms for a farming season.

## Key Changes

- Replace the current farmer-owned-farm model with an AMCOS-owned farm registry. Start fresh: archive current development farm records and create all production farms through AMCOS registration.
- Replace owner-confirmation flows with seasonal renter assignment:
  1. AMCOS Officer registers an AMCOS-owned farm.
  2. AMCOS Officer assigns a renter for an active season.
  3. Renter accepts in the app, SMS, or USSD.
  4. Field Officer verifies the renter and farm in the field.
  5. Only then may the renter record crop cycles, activities, inputs, costs, harvests, and revenue for that farm.
- Update row-level access checks so renters only access farms with their active, verified seasonal assignment. AMCOS Officers access only their assigned AMCOS. Field Officers access their assigned verification work. Admins retain full access.
- Add a single authenticated workspace-context API returning the user role, assigned AMCOS/area, active renter assignments, pending actions, and unread alerts. Mobile and web navigation must use this response instead of exposing shared navigation to every role.
- Keep public registration renter-only. Admin/Management creates and assigns Field Officer and AMCOS Officer accounts.

## Workspace Design

### Renter mobile workspace

- Home starts with active farm, verification status, urgent tasks/alerts, and today’s recommended actions.
- Includes assigned farm details, crop records, activity logging, inputs/expenses, harvest/revenue, membership, notifications, and profile.
- Does not show registry administration, other renters’ farms, or AMCOS operational data.

### Field Officer mobile workspace

- Home is a prioritized work queue: pending renter verification, scheduled field visit, missing field survey, dispute, and unsynced offline record.
- Includes assigned farm search, GPS boundary/survey capture, photos and evidence, renter verification decision, discrepancy reporting, and completed-work history.
- Supports offline drafts and clearly exposes pending sync state.

### AMCOS Officer workspace

- Mobile home prioritizes registry exceptions: unassigned farms, renter requests awaiting action, renter acceptance awaiting field verification, disputes, duplicate warnings, and farms without active seasonal operators.
- Web workspace uses the same AMCOS-scoped data and provides the full registry, season setup, renter assignment, officer task monitoring, disputes, production overview, and reports.
- AMCOS Officers cannot view or edit another AMCOS’s records.

### Admin/Management web workspace

- Keep the full web dashboard, but make the sidebar and routes role-aware.
- Provides account creation, AMCOS assignment, seasons, all-AMCOS oversight, operational KPIs, escalated disputes, membership/reward administration, and system-wide reports.

## Interfaces and Data Rules

- Add AMCOS ownership to the farm registry as a required relationship; retire farmer-as-legal-owner fields from active workflows.
- Make `SeasonalFarmAssignment` the authority for renter access, with statuses: pending renter acceptance, renter accepted, field verification pending, active, rejected, expired, suspended.
- Add Field Officer assignment/work-item records or equivalent scoped queries so the officer dashboard never defaults to all farms.
- Expose role-scoped dashboard endpoints for renter, officer, AMCOS, and admin summaries; return only data authorized for that workspace.
- Convert existing SMS/USSD language from owner confirmation to renter assignment acceptance and verification status updates.
- Archive current development farm records before rollout; do not migrate them, per the selected fresh-start decision.

## Test Plan

- A renter can see and work only on an active, officer-verified seasonal assignment.
- A renter cannot access a farm before acceptance and field verification, or after assignment expiry.
- AMCOS Officer A cannot view or change AMCOS Officer B’s farms, renters, or disputes.
- Field Officers only receive their assigned work queue and cannot approve work outside their scope.
- Admin-created staff accounts receive the correct workspace after login; public registration always produces a renter account.
- Mobile navigation changes correctly by role and never displays unauthorized tabs/screens.
- Renter acceptance works through app, SMS, and USSD; each path updates the same assignment status.
- Field verification activates the assignment and enables crop/finance activity access.
- Existing development farms are archived and excluded from active registry/dashboard results.

## Assumptions

- “MAMCOS” remains the internal database/model name where needed, while all user-facing text says “AMCOS.”
- Admin/Management remains web-only; no complete mobile admin workspace is included.
- Field verification is mandatory before a renter receives operational farm access.
- Current farm data is development data and may be archived for the fresh AMCOS-owned registry launch.
