# MAYODE Partner API v1

External bank / FI integration for consent-gated farmer credit profiles.

## Authentication

| Item | Value |
|------|--------|
| Header | `X-API-Key: <key>` |
| Key format | `myd_<hex>_<secret>` |
| Issue | `POST /partner/keys` (JWT as SUPER_ADMIN or ADMIN) — plaintext shown **once** |
| Revoke | `PATCH /partner/keys/:id/revoke` |
| Rate limit | 120 requests / key / hour |

## Discovery

```http
GET /partner/v1/docs
```

Returns auth notes, endpoint list, and schema id `mayode.credit-profile.v1`.

## Credit profile

```http
GET /partner/v1/farmers/:farmerId/credit-profile
X-API-Key: myd_….
```

**Requires** farmer `dataShareConsent === true`. Denied access is still written to `PartnerApiRequest` with the HTTP status.

### Response contract (`mayode.credit-profile.v1`)

| Field | Purpose |
|-------|---------|
| `schema` | Always `mayode.credit-profile.v1` |
| `retrievedAt` | ISO timestamp |
| `partnerAccess.apiKeyId` / `audited` | Confirms request was logged |
| `farmer` | Identity + cooperative (no NIDA) |
| `consent` | Sharing flag + latest consent record |
| `credit` | Score 0–100, `creditReady`, factor breakdown |
| `production` | Yield / cycles summary |
| `finance` | Costs, revenue, loan outstanding |
| `farms` | Registered farms |
| `conditions` | Boolean underwriting gates |

Every call creates a `PartnerApiRequest` row (farmerId, endpoint, IP, responseCode).

## Admin UI

Web → **Settings → Partner API** (ADMIN / SUPER_ADMIN): create keys, revoke, view recent audit requests.

## FI workspace (JWT)

Financial providers use the web **Credit Dashboard** with session JWT (`GET /farmers/:id/financial-profile`) — same underlying profile, UI export included.
