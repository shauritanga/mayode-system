# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary: farmers in Tanzanian rice-farming cooperatives, who need to register and verify farms, manage seasonal work, and understand the status of their farms without re-entering information already held by their AMCOS.

Supporting users: farm owners and seasonal renters; AMCOS officers and leaders; MAYODE field officers and management; and authorized buyers, financial providers, auditors, and partners where their workflows require access.

## Product Purpose

MAYOData is MAYODE Group's integrated platform for AMCOS and cooperatives in Tanzania. It connects farmer, farm, crop-cycle, cooperative, field-work, and market records so farmers can manage their farms and receive responsible, actionable support through a season.

Success means a farmer can establish a trusted farm record with low friction, record essential farm activity, and act on clear, appropriately scoped information while cooperative and MAYODE staff can verify and support that work.

## Positioning

The platform uses an AMCOS-first registry: authorized cooperative officers pre-register known plots, owners, locations, and farm attributes; owners and renters then review, confirm, or correct that information. It pairs this cooperative-grounded record with farmer-facing mobile workflows, seasonal membership, and field verification rather than making farmers start registration from a blank form.

## Operating Context

The product serves Tanzanian rice-farming communities, including Mbarali-related AMCOS workflows. Farmers use a native mobile application; staff and administrators use a web dashboard. Work can occur with intermittent connectivity, so the mobile application provides offline storage and later synchronization. SMS, app notifications, assisted registration, and specified USSD flows support farm confirmation and communication.

The product operates around farms, plots, schemes, blocks, canals, cooperatives (AMCOS), crop cycles, farming seasons, farm activities, field surveys, leases, memberships, deliveries, and verification/dispute workflows.

## Capabilities and Constraints

- Farm, farmer, plot, owner, renter, cooperative, crop-cycle, activity, expense, labor, input, document, survey, and field-verification workflows are in scope.
- Farm and basic profile registration remain free. Active seasonal membership controls premium, feature-level services such as detailed analytics, predictions, recommendations, and premium reports; the backend must enforce access rather than relying on hidden UI.
- AMCOS-entered records are pre-registered, not automatically verified. Owner confirmation, field validation, and dispute handling are distinct states.
- Role-based access limits AMCOS and field staff to their authorized cooperative, scheme, block, or area.
- The mobile app supports English and Swahili and has an offline queue/cache for supported field workflows.
- The web dashboard is primarily for staff and administrative work; the mobile app is intended for farmers and field officers.
- Product interfaces must avoid fear-based alerting and must not expose premium data in frontend state or network responses for non-members.
- Open decision: the exact supported accessibility standard has not been recorded.

## Brand Commitments

Use the established MAYODE GROUP and MAYOData names. The web product identifies itself as “The integrated platform for AMCOS and Cooperatives in Tanzania.”

## Evidence on Hand

- Product and workflow briefs: `prompt.md`, `prompt2.md`, `docs/phase1-gap-backlog.md`.
- Web portal: `web/` (Next.js); mobile application: `mobile/` (Expo/React Native); backend: `backend/`.
- Existing visual and brand assets: `web/public/logo-mark.png`, `web/public/login-rice-field.png`, with corresponding website assets.
- Bilingual mobile copy and offline implementation: `mobile/src/i18n.ts`, `mobile/src/services/offline-cache.ts`.
- No independently verified customer testimonials, outcome benchmarks, pricing, or third-party performance claims are recorded here; future surfaces must not fabricate them.

## Product Principles

1. Start from trusted cooperative records and ask farmers only to confirm, correct, or complete what is missing.
2. Keep foundational registration and farm management accessible; reserve advanced, defensible value for membership without obscuring urgent basic information.
3. Treat ownership, field data, and recommendations as statusful and verifiable—not as unqualified facts.
4. Design for real field conditions: mobile-first farmer workflows, Swahili support, intermittent connectivity, and assisted channels.
5. Give each role only the information and actions necessary for its responsibilities.

## Accessibility & Inclusion

The farmer-facing experience must support English and Swahili, function in intermittent-connectivity conditions where supported, and accommodate assisted registration and non-app communication channels. A formal accessibility conformance target remains open.
