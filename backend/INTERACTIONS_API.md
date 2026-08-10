# Per-tenant interactions & API metering — server contract

The desktop app now records every answered question and every finished Gemini Live
session locally, and uploads them in batches. This document defines what the server
must accept so the superadmin view can report per tenant.

**Status:** collection layer is built and shipping data. The endpoint below does **not
exist yet** — until it does, records accumulate locally and retry (nothing is lost).

## Endpoint

```
POST /api/admin/interactions/batch
Authorization: Bearer <serverToken>      // the licence JWT issued at login
Content-Type: application/json

{ "records": [ <record>, ... ] }         // up to 100 per call
```

Return `2xx` on success. Records are marked synced **only** after a `2xx`, so a crash
or timeout mid-upload causes a re-send.

### Idempotency is required

`record.id` is a client-generated UUID and is stable across retries. The server **must**
treat it as an idempotency key (unique index + upsert). Without this, a response lost in
transit will double-count a tenant's minutes.

## Common fields

Every record carries tenant attribution, stamped in the Electron main process from the
*verified* session — never from the renderer, which cannot be trusted to state its own
identity.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | idempotency key |
| `ts` | ISO 8601 | when it happened, client clock |
| `type` | `"interaction"` \| `"usage"` | discriminator |
| `tenantId` | string \| null | `User._id` from the licence server |
| `tenantEmail` | string \| null | |
| `companyName` | string \| null | display name for the superadmin view |
| `role` | string | role of the logged-in session |
| `deviceId` | string | machine ID — distinguishes kiosks within one tenant |
| `appVersion` | string | |

Client clocks may be wrong. Stamp a server-side `receivedAt` and prefer it for billing
period boundaries.

## `type: "interaction"` — usage patterns

| Field | Type | Notes |
|---|---|---|
| `question` | string | truncated to 2000 chars |
| `answer` | string | truncated to 4000 chars |
| `module` | string \| null | `gemma` \| `gemini` \| `gemini-live` \| `predefined` |
| `inputType` | string \| null | `voice` \| `text` |
| `latencyMs` | number \| null | offline path only |

### Privacy

These are **free-text questions from members of the public** at seminars, and can
contain names, phone numbers and other personal data. Before this goes live:

- set a retention period and enforce it server-side
- consider a per-tenant opt-out flag
- confirm the privacy policy (`PrivacyPolicy.jsx`) covers storing attendee questions

## `type: "usage"` — Gemini Live metering

One record per finished session. This is the basis for cost attribution.

| Field | Type | Notes |
|---|---|---|
| `provider` | string | currently always `"gemini-live"` |
| `model` | string | **cost varies enormously by model** — always group by this |
| `voice` | string | |
| `startedAt` / `endedAt` | ISO 8601 | |
| `connectedMs` | number | **authoritative**; excludes gaps between reconnects |
| `connectedMinutes` | number | convenience, derived from `connectedMs` |
| `turns` | number | completed exchanges |
| `promptTokens` | number | from Google's `usageMetadata` |
| `responseTokens` | number | from Google's `usageMetadata` |
| `totalTokens` | number | from Google's `usageMetadata` |
| `modalities` | object | e.g. `{ "AUDIO": 14800, "TEXT": 1200 }` |
| `tokensReported` | boolean | **see below** |

### `tokensReported` matters

Not every model/API version returns `usageMetadata`. When `tokensReported` is `false`,
token counts are `0` because **nothing was reported — not because nothing was used.**

Never sum those zeros into a total presented as complete. `usageSummary()` returns
`sessionsMissingTokens` for exactly this reason; the superadmin UI should show it as a
caveat rather than silently under-reporting a tenant.

Duration is always reliable, so **minutes are the safer billing basis than tokens.**

### Cost calculation

Deliberately **not** computed client-side. Rates change, differ per model, and a wrong
number shown to a client is worse than no number. Store the facts (minutes, tokens,
model) and apply a rate table at display time where it can be updated without shipping
a new app build.

## Reading the data

Superadmin only. `GET /admin/interactions/...` endpoints should reuse the existing
`authenticate, isSuperAdmin` middleware chain from `admin.routes.js`.

Locally, `get-usage-analytics` over IPC already enforces `role === 'superadmin'`.

Suggested indexes: `{ id: 1 }` unique, `{ tenantId: 1, ts: -1 }`, `{ type: 1, ts: -1 }`.
