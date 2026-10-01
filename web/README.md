# MAYODE web portals

Three independently runnable Next.js apps share UI, feature screens, API clients,
state, and types. The NestJS backend remains in `../backend`.

| App | Directory | Development | Production | Port |
| --- | --- | --- | --- | --- |
| Farmers | `apps/farmers` | `npm run dev:farmers` | `npm run start:farmers` | 3101 |
| Cooperatives | `apps/cooperatives` | `npm run dev:cooperatives` | `npm run start:cooperatives` | 3102 |
| Admin | `apps/admin` | `npm run dev:admin` | `npm run start:admin` | 3103 |

Run these commands from `web`. Install all workspace dependencies with `npm ci`.
`npm run dev` and `npm start` default to Admin. To run all three locally, open
three terminals and run their development commands.

## Structure

- `apps/<portal>/src/app`: explicit routes owned by that portal, plus its root layout and login entry.
- `apps/<portal>/next.config.ts`: fixed portal identity and independent `.next` output.
- `src/screens`: shared implementations of existing pages and layouts (not a Next.js route tree).
- `src/components`, `src/hooks`, `src/lib`, `src/store`: shared UI, API client, types and state.
- `src/lib/portal-routes.ts`: section ownership used by navigation and route guards.
- `public`: shared assets, linked into each app's public directory.
- `config/next.config.ts`: common build configuration, including the shared source root.

Farmers ships only personal farmer pages, profile and the forbidden page.
Cooperatives ships cooperative operations and field workflows. Admin retains
platform management and the existing non-farmer modules. Existing URLs within
each portal are preserved. Pages outside a portal's route tree return 404.

Farmers lands on `/dashboard/farmer`. Cooperatives lands on `/dashboard`, with
Secretary or Field Officer content according to the account. Admin lands on
its platform overview or the permission-based workspace for other accounts.
Shared navigation filters both portal ownership and assigned permissions.
The backend remains responsible for authorization and data scoping; frontend
route separation does not replace those checks.

## Environment

Set `NEXT_PUBLIC_API_URL` for the shared backend (default:
`http://localhost:3001/api/v1`). Set it in each app's `.env.local` for local use,
or provide it through the deployment environment before building. Root `web/.env`
files are no longer automatically loaded by the individual apps.

Each app fixes `NEXT_PUBLIC_APP_MODE` in its Next.js configuration. No mode flag
is needed in shell commands. `NEXT_PUBLIC_SITE_URL` defaults to the matching
`https://<portal>.mayodegroup.com` domain and can be overridden at build time.
Existing role-to-portal admission rules remain in `src/lib/app-mode.ts`.

## Build and deploy

```bash
npm run build:farmers
npm run build:cooperatives
npm run build:admin
# Or build all three:
npm run build:all-modes
```

Builds live in `apps/<portal>/.next`; the former `.next-<portal>` outputs are
unused. Deploy the `web` workspace including shared source, installed dependencies,
public assets and the selected app's build. Start just that app using the table
above, or use `pm2 start ecosystem.config.js` to run all three. The PM2 config
resolves paths relative to itself rather than a fixed server directory.

## Checks

```bash
npm test
npm run typecheck
npm run build:all-modes
npm run test:smoke
```

The smoke check starts temporary production servers on ports 33101–33103 and
checks login metadata, shared assets, dashboard routes and cross-portal 404s.
It stops the servers after checking.

When adding a page, add an explicit route to each intended app and update
`src/lib/portal-routes.ts` when adding a new top-level dashboard section. Add
its navigation entry and permission resource in `src/lib/nav.ts` as needed.
The route tests check portal ownership against the actual route trees.
