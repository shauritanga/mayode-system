# Field officer and farmer requirements — implementation

Implemented workflows:

- Officers register farmers with name, normalized phone, initial password and location. The backend assigns the configured farmer login role and scopes the cooperative to the officer. Farmers also enter location during self-registration.
- Officers can register farms from a farmer profile. Plots capture a photo and GPS point; walking a boundary records native GPS points and computes area without loading map tiles.
- Activities capture date/type, multiple inputs (name, positive quantity, unit), workers, hours and photos. Expense records remain separate cycle records in TZS; harvest yield is recorded in kg.
- Farmer and officer profiles show total yield, total costs and links to season history. These basic totals do not require premium financial analytics.
- Backend validation rejects negative labor/yields/costs and harvest/planting chronology conflicts on activity creation, editing and crop-cycle updates. Mobile forms provide immediate validation.
- Signed-in field workflows persist records and photo files offline, replay in order, reconcile IDs across related new records and retain failures for retry. Read caches and queues are account-scoped. The old single-account queue is migrated for its persisted signed-in user.
- Synchronization runs on reconnection, app resume, periodic foreground retries and OS-scheduled background tasks. Durable server receipts reuse completed write responses after a lost connection or server restart.
- Sync Center can download field records before leaving coverage. Initial sign-in/account activation requires connectivity; existing records need to have been downloaded to this device. Officer-assisted registration works offline in an existing signed-in session.

## Deployment

1. Deploy backend and apply the migration in `backend/prisma/migrations/20260930120000_plot_photos` with `npx prisma migrate deploy` from `backend`. Generate Prisma Client during the normal backend build. The migration adds plot photos and durable synchronization receipts.
2. Ensure `FARMER_SELF_REGISTRATION_ROLE_ID` identifies an active custom Farmer role, or exactly one such role exists. Officer roles need the existing field-workflow permissions.
3. Install mobile dependencies and rebuild the native Android/iOS app. This change adds Expo FileSystem, BackgroundTask and TaskManager and uses `mobile/index.ts` as the entry point. An OTA JavaScript update alone does not install native modules.

The database migration is supplied but was not applied to an external database during implementation.

## Verification

Automated checks cover numeric/date validation, farmer role/cooperative assignment, free performance totals, durable idempotency, account isolation, concurrent local writes, offline photos, dependent IDs, legacy queue migration and replay after connection loss.

Run `npm run test:offline` from `mobile`. Run the field-records, farmer-registration, field-registration and idempotency interceptor Jest suites from `backend`.

Physical-device acceptance:

1. Sign in as an officer and use Sync Center to download field records.
2. Enable airplane mode. Register a farmer, register their farm, add a plot with GPS/photo and walk a boundary. Create a season, record inputs/labor and expenses, then record harvest yield. Check profile totals and histories.
3. Restart the app while offline; confirm records and captured photos remain available.
4. Restore connectivity; verify IDs reconcile, each record appears once on the server, and the queue clears. Interrupt connectivity mid-upload and repeat.
5. Repeat as a farmer and with an expired access token; check that retries preserve records and a required new sign-in does not delete them.
6. Test background sync on a native physical device. The operating system controls scheduling (Android minimum interval is 15 minutes); force-stopping the app can prevent background work until it is reopened. Foreground reconnection initiates sync immediately.

Native camera, GPS and OS background execution require device verification. Map imagery and drawing need connectivity; native GPS walking/capture do not.
