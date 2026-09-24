# Super Admin and custom roles

Super Admin is the only built-in access role. In **Roles & Permissions**, Super Admin creates a role, saves its resource permissions, then assigns it in **User Accounts**. New custom roles have no grants. Only Super Admin can create roles, change permissions, provision staff accounts, or change an account's role. Farmers can self-register in the mobile app; the server assigns their Farmer role automatically.

Non-super accounts need an active custom role. Neither an old `ADMIN` value nor another historical profile grants access. Permission changes are loaded from the database on every authenticated request. Deactivating a role blocks its users' next request and token refresh.

An optional operational profile configures farmer/cooperative records for newly created accounts. The historical enum values remain for those domain workflows and existing records; they are not built-in access roles. Generic roles use `CUSTOM`. Ownership checks still apply in addition to resource permissions.

## Farmer self-registration

The mobile signup form restored from `36d476f` (last changed in `2100318`, removed in `1780206`) submits to public, rate-limited `POST /auth/register` (with `/auth/register/farmer` retained as an alias). It creates a farmer profile and signs the farmer in. Public requests cannot select a role or roleId. Super Admin provisioning uses the protected `POST /auth/register/admin` endpoint.

Create an active custom role with the `FARMER` operational profile and the desired permissions. If exactly one such role exists, signup uses it automatically. If multiple exist, set backend `FARMER_SELF_REGISTRATION_ROLE_ID` to the intended role ID. Signup fails with a configuration message when no eligible role exists or the selection is ambiguous; it never creates a built-in role or grants permissions automatically.

## Deployment

After backing up the database, apply the checked-in migrations from `backend`:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
```

The migration removes non-super built-in role records, preserves users and existing custom roles, and adds database constraints preventing additional built-in roles. It does not grant replacement access automatically. Super Admin must assign custom roles to legacy accounts without one. Existing custom roles and their grants are preserved for review. The old automatic role-template seed is disabled.

This migration does not require running the full application seed. A new installation's seed creates only the Super Admin role and the resource catalog; provision the initial Super Admin account using the existing administrative bootstrap process.

## Verification

Backend: `npm test -- --runInBand` and `npm run build` in `backend`.
Web: `node tests/nav.test.cjs` and `npx tsc --noEmit` in `web`.
