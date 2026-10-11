# Roles, accounts and cooperative administrators

Super Admin is the only built-in access role. Everything else is a **custom role** that carries permissions only. A role never decides which portal someone signs in to or what records exist for them.

## Who manages what

| | Super Admin | Cooperative admin |
|---|---|---|
| Scope | Whole platform | One AMCOS |
| Roles | Create, edit, delete platform roles and any AMCOS's roles | Create, edit, delete roles of **their own AMCOS** |
| Permissions on a role | Anything | Only permissions **they hold themselves**, never platform-wide resources (`settings`, `locations`, `rewards`, `buyer_portal`) |
| Accounts | Create any account, change any role, activate/deactivate | Create accounts and assign roles **inside their AMCOS**; activate/deactivate their staff |
| Never | — | Create a Super Admin, edit their own role, change their own role, deactivate themselves, delete users, see another cooperative |

A **cooperative admin** is an ordinary account whose `mamcosId` is set and whose role holds the `users` and `roles` permissions. Nothing else is special about it; the API enforces the limits above on every request (`backend/src/auth/delegation.ts`).

## Setting up a cooperative

1. **Admin portal → AMCOS** — create the AMCOS. Optionally add its administrator in the same form, or press **Add admin** on the list later (`POST /auth/cooperative-admin`, Super Admin only).
2. That creates (once) an AMCOS-scoped **Cooperative Admin** role holding every grantable permission, and an account on it.
3. The administrator signs in to the **Cooperative Portal** and opens **Roles & Permissions** to create roles (for example *Clerk*, *Accountant*) and **User Accounts** to add staff, each with a role of their own AMCOS.

Role names are unique per scope, so two cooperatives can both have a *Clerk* role.

## Which portal an account uses

Decided by who the account belongs to:

- **Farmers portal** — farmers.
- **Cooperative portal** — anyone tied to an AMCOS: its admin and staff, secretaries, field officers.
- **Admin portal** — Super Admin and platform staff (no AMCOS). Field officers may use either.

## Account type (field officers and secretaries)

There is no per-role "operational profile" any more. When creating an account you may mark it as a **Field officer** or **AMCOS secretary**; that creates their staff record in the AMCOS (an employee code for officers; at most one secretary per AMCOS). Everyone else is general staff.

## Farmers

Farmers are **not a role**. They have their own dashboard and the mobile app, and what a farmer may do is fixed in code: a farmer can call any route that lists `FARMER` in `@Roles`, and every read and write is confined to the farmer's own records by the ownership checks. There is nothing to configure and no Farmer role to manage; the Roles screens never show one. Farmers sign up in the mobile app (`POST /auth/register`, or code sign-in via `/auth/otp/*`); a cooperative admin or field officer can register farmers inside their AMCOS. Accounts are created with no custom role. Older deployments may still hold a platform role named **Farmer** that early accounts were linked to: it is ignored, hidden from role management, and cannot be assigned to staff.

## Deployment

After backing up the database, from `backend`:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
```

The cooperative-scope migration (`20261007120000_cooperative_scoped_roles`) is additive: existing roles and accounts stay platform-level, it adds the `roles` permission resource, and it copies each existing secretary's / field officer's AMCOS onto their account so a cooperative admin can manage them. Existing farmer-signup setups keep working if the farmer role is named **Farmer** or `FARMER_SELF_REGISTRATION_ROLE_ID` is set — **check this before deploying**, because auto-detection by operational profile is gone.

## Verification

Backend: `npm test -- --runInBand` and `npm run build` in `backend`.
Web: `node --test tests/*.test.cjs` and `npx tsc --noEmit` in `web`.
