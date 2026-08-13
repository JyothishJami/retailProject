# QuickPick — API Architecture

> Part 4 of the Product Discovery & Architecture Document.
> REST over HTTPS, `/(api)/v1`, JSON only. Real-time events are in Part 2 §21.

---

## 42. Conventions

| Concern | Rule |
|---|---|
| Base path | `/api/v1`. Breaking changes ⇒ `/api/v2`; additive changes never bump the version |
| Auth | `Authorization: Bearer <access JWT>` (15 min). Refresh via `POST /auth/refresh` with a rotating refresh token |
| Content | `application/json; charset=utf-8`; `multipart` never used (uploads go direct to storage) |
| Errors | Problem-details style: `{ "error": { "code": "ORDER_INVALID_TRANSITION", "message": "...", "details": [{"field":"quantity","issue":"..."}], "requestId": "..." } }`. Machine-readable `code` is the contract; `message` is not |
| Status codes | 200/201/204; 400 validation, 401 unauthenticated, 403 unauthorised, 404 not found (also used to hide existence), 409 conflict/invalid transition, 410 gone, 422 business rule, 423 locked, 429 rate limited, 5xx |
| Pagination | Cursor: `?limit=20&cursor=<opaque>` → `{ data: [...], pageInfo: { nextCursor, hasNextPage } }`. `limit` max 100 |
| Filtering/sorting | Explicit allow-listed params only (no arbitrary `sort=<column>` passthrough) |
| Idempotency | `Idempotency-Key` header **required** on `POST /orders`, `POST /payments/*`, `POST /files/upload-intent`; recommended on all POSTs. Replays return the original response with `Idempotency-Replayed: true` |
| Concurrency | `If-Match: <version>` supported on order/product/branch-product mutations; 409 on mismatch |
| Rate limits | Response headers `X-RateLimit-Limit/Remaining/Reset`; classes in §44 |
| Tracing | `X-Request-Id` accepted or generated, echoed, and present in every log line and error body |
| Localisation | `Accept-Language`; system messages are event codes rendered client-side |
| Time | ISO-8601 UTC with offset (`2026-08-13T15:40:00Z`) everywhere |
| Money | `{ "amount": "240.50", "currency": "INR" }` as strings — never floats |
| Contract source | zod schemas in `packages/shared` → OpenAPI 3.1 generated → typed client generated. **The schema is the spec**; docs cannot drift |
| Deprecation | `Deprecation` + `Sunset` headers, minimum 90 days, tracked per client version |
| Mobile min version | `X-App-Version` header; server can return `426 Upgrade Required` for unsupported clients |

---

## 43. Module surface (V1)

```text
/auth          /users        /addresses     /businesses   /branches
/categories    /products     /inventory     /carts        /orders
/conversations /messages     /files         /notifications
/reviews (V2)  /payments (V2) /locations    /admin/*      /config  /health
```

---

## 44. Rate-limit classes

| Class | Endpoints | Limit (per identity) |
|---|---|---|
| `otp` | `POST /auth/otp/*` | 5 / 15 min per phone, 20 / h per IP |
| `auth` | login, refresh, reset | 10 / 5 min, exponential lockout after 5 failures |
| `write_order` | `POST /orders`, order transitions | 20 / h per customer; 600 / h per branch |
| `message` | `POST /messages` | 60 / min per user, 5 msg/s burst |
| `upload` | `POST /files/upload-intent` | 30 / h per user, 200 MB / day |
| `search` | discovery/search endpoints | 60 / min per user, 300 / min per IP |
| `default` | everything else | 300 / min per user |

---

## 45. Endpoint catalogue (key endpoints in detail)

### 45.1 Auth

**`POST /api/v1/auth/otp/request`** — public, class `otp`
```json
{ "phone": "+919876543210", "purpose": "LOGIN" }
```
- Validation: E.164, purpose enum. Response `202 { "challengeId", "expiresInSec": 300, "resendAfterSec": 30 }`.
- Never reveals whether the account exists (enumeration resistance).
- Errors: `429 OTP_RATE_LIMITED`, `423 ACCOUNT_LOCKED`.

**`POST /api/v1/auth/otp/verify`** — public, class `auth`
```json
{ "challengeId": "...", "code": "123456", "device": { "platform": "ANDROID", "pushToken": "...", "appVersion": "1.0.0" } }
```
→ `200 { accessToken, refreshToken, expiresIn, user: {...}, isNewUser }`
- Max 5 attempts, then challenge is consumed and lockout applies.
- Errors: `400 OTP_INVALID`, `410 OTP_EXPIRED`, `429`.

**`POST /api/v1/auth/login`** (business/admin: email + password) → same token shape;
`403 MFA_REQUIRED` with an `mfaToken` when MFA is on (V2).

**`POST /api/v1/auth/refresh`** → new pair; **rotates** and single-uses the refresh
token. Reuse of a rotated token ⇒ `401 REFRESH_REUSE_DETECTED` + whole family revoked.

**`POST /api/v1/auth/logout`** (current session) / **`/logout-all`**.
**`GET /api/v1/auth/sessions`**, **`DELETE /auth/sessions/:id`** — device management.
**`POST /auth/password/forgot`**, **`POST /auth/password/reset`** — always `202`,
single-use token, all sessions revoked on success.

### 45.2 Users & addresses
- `GET /users/me`, `PATCH /users/me` (name, email, avatarMediaId, locale)
- `GET|POST /users/me/addresses`, `PATCH|DELETE /users/me/addresses/:id`
- `GET|PUT /users/me/notification-preferences`
- `POST /users/me/devices` (push token upsert), `DELETE /users/me/devices/:id`
- `POST /users/me/deletion-request`, `GET /users/me/export` (V2, async job)

### 45.3 Locations & discovery

**`GET /api/v1/locations/geocode?q=`** and **`/reverse?lat=&lng=`** — proxied through
the `GeoProvider` port; cached in Redis (24 h) to control provider cost. Class `search`.

**`GET /api/v1/branches/nearby`** — authenticated (customer)
```
?lat=12.97&lng=77.59&radiusM=3000&categoryId=&openNow=true&q=&sort=distance|rating&limit=20&cursor=
```
→ per item: `{ branchId, businessName, categoryName, distanceM, isOpen, opensAt, ratingAvg, ratingCount, avgPrepMinutes, logoUrl }`
- `radiusM` clamped to 10 000; `limit` ≤ 50. Only `APPROVED` businesses, `ACTIVE`
  branches, launched cities.
- Cached per (rounded geohash, filters) for 60 s. Errors: `400 INVALID_COORDINATES`.

**`GET /api/v1/search?q=&lat=&lng=&type=business|product`** — federated search with
per-type sections; logs to `search_query_log`.

### 45.4 Businesses & branches (shop-facing)
- `POST /businesses` (create draft), `GET /businesses/:id`, `PATCH /businesses/:id`
  (perm `business.write`, scoped)
- `POST /businesses/:id/documents` (mediaId + docType) → moves to
  `PENDING_VERIFICATION` when the required set is complete
- `GET|POST /businesses/:id/branches`, `PATCH /branches/:id`
- `PUT /branches/:id/hours`, `GET|POST|DELETE /branches/:id/holidays`
- `PATCH /branches/:id/accepting-orders` `{ "acceptingOrders": false, "reason": "..." }`
  — the shop's panic button; surfaces immediately in discovery
- `GET|POST /branches/:id/staff`, `PATCH|DELETE /branches/:id/staff/:staffId` (V2)
- Public read: `GET /businesses/:slug` / `GET /branches/:id` (customer view, cached)

### 45.5 Catalog
- `GET /categories/products?parentId=` (platform tree, cached 1 h, public)
- `GET /businesses/:id/products?...` (shop view), `GET /branches/:id/products?...`
  (customer view: joins `branch_product`, hides `HIDDEN`, marks out-of-stock)
- `POST|PATCH /products/:id`, `DELETE /products/:id` (soft, perm `product.write`)
- `POST /products/:id/media`, `DELETE /products/:id/media/:mediaId`
- `GET /master-products?q=` + `POST /businesses/:id/products/from-master`
  `{ "masterProductId", "price", "branchIds": [...] }` — the fast onboarding path
- `POST /businesses/:id/products/import` (CSV mediaId) → `202 { jobId }`;
  `GET /import-jobs/:jobId` returns per-row errors

### 45.6 Inventory
- `GET /branches/:id/inventory?availability=&q=`
- `PATCH /branches/:branchId/inventory/:branchProductId`
  `{ "availability": "OUT_OF_STOCK" }` or `{ "quantityOnHand": "12" }`,
  `If-Match: <version>`; perm `inventory.write`; writes an `inventory_transaction`
- `POST /branches/:id/inventory/bulk` `{ "items": [...] }` (≤ 500) — the daily
  "what's out today" sweep
- `GET /branches/:branchId/inventory/:branchProductId/transactions` (ledger)

### 45.7 Cart

- `GET /carts?branchId=` → active cart or `null`
- `POST /carts/items` `{ branchId, branchProductId, quantity, notes }`
  → re-validates availability + price; `409 ITEM_UNAVAILABLE`,
  `409 PRICE_CHANGED { oldPrice, newPrice }`
- `PATCH /carts/:cartId/items/:itemId` `{ quantity }` (0 ⇒ remove)
- `DELETE /carts/:cartId` / `DELETE /carts/:cartId/items/:itemId`
- **`POST /carts/:cartId/preflight`** → `{ valid, issues: [{ itemId, type:
  PRICE_CHANGED|UNAVAILABLE|QUANTITY_REDUCED, ... }], totals }` — called before showing
  the Place Order button; prevents a failed checkout being the first time the customer
  learns something changed

### 45.8 Orders

**`POST /api/v1/orders`** — customer, perm `order.create`, class `write_order`,
**`Idempotency-Key` required**
```json
{ "cartId": "...", "customerNote": "call on arrival", "paymentMode": "PAY_AT_STORE",
  "acceptedPriceVersion": "<preflight token>" }
```
→ `201 { order, conversationId }`
- Guards: cart active and non-empty, branch `ACTIVE` + `accepting_orders` + open (or
  scheduled-order flag), all items available, plan limit not exceeded.
- Transaction per Part 2 §17.2. Errors: `409 CART_NOT_ACTIVE`,
  `409 BRANCH_NOT_ACCEPTING`, `409 ITEMS_UNAVAILABLE { items: [...] }`,
  `422 PRICE_CHANGED`, `429`.

**`GET /orders?role=customer|branch&branchId=&status=&from=&to=&cursor=`** — scoped by
the caller's identity; a shop can never read another branch's orders.
**`GET /orders/:id`** → order + items + history + prep adjustments + conversationId.

**Transition endpoints** (each: distinct permission, guarded, audited, event-emitting):

| Endpoint | Actor / permission | Body | Result |
|---|---|---|---|
| `POST /orders/:id/ack` | shop `order.read` | — | `RECEIVED` |
| `POST /orders/:id/accept` | shop `order.accept` | `{ prepMinutes: 15, note? }` | `ACCEPTED`, `promised_ready_at`, reservations |
| `POST /orders/:id/reject` | shop `order.reject` | `{ reasonCode, note? }` | `REJECTED` |
| `POST /orders/:id/cancel` | customer `order.cancel` / admin `order.force_cancel` | `{ reasonCode?, note? }` | `CANCELLED` |
| `POST /orders/:id/prep-time` | shop `order.accept` | `{ deltaMinutes: 10, reasonCode }` | delay event + new ETA |
| `POST /orders/:id/start-preparing` | shop | — | `PREPARING` |
| `POST /orders/:id/start-packing` | shop | — | `PACKING` |
| `PATCH /orders/:id/items/:itemId/packing` | shop `order.pack` | `{ status: PACKED\|UNAVAILABLE\|SUBSTITUTED, substituteProductId?, quantityFulfilled? }` | checklist state; substitutions notify the customer |
| `POST /orders/:id/items/:itemId/substitution-response` | customer | `{ approved: true }` | recompute totals |
| `POST /orders/:id/packed` | shop `order.pack` | — | `PACKED`, totals frozen, inventory consumed |
| `POST /orders/:id/ready` | shop `order.ready` | — | `READY_FOR_PICKUP`, pickup code, CRITICAL notification |
| `POST /orders/:id/arrived` | customer or shop | — | `CUSTOMER_ARRIVED` |
| `POST /orders/:id/handover` | shop `order.handover` | `{ pickupCode }` or `{ overrideReason }` | verify → `HANDED_OVER` → `COMPLETED` |
| `POST /orders/:id/repeat` | customer | — | creates a cart from the order (availability-filtered) |

All transitions return the updated order and reject illegal moves with
`409 ORDER_INVALID_TRANSITION { from, to, allowed: [...] }`.

### 45.9 Conversations & messages
- `GET /conversations?role=customer|branch&branchId=&cursor=` → inbox with unread counts
- `GET /conversations/:id` / `GET /conversations/:id/messages?before=&after=&limit=`
  (cursor; `after` used for reconnect reconciliation)
- **`POST /conversations/:id/messages`**
  `{ clientMessageId, type, body?, attachments?: [mediaId], payload? }`
  → `201 message`; duplicate `clientMessageId` returns the existing message (`200`).
  Guards: membership, conversation `OPEN`, attachments owned by sender and `SCAN_CLEAN`,
  ≤ 5 attachments, body ≤ 4000 chars.
- `POST /conversations/:id/read` `{ lastReadMessageId }` → updates cursor + unread
- `POST /conversations/:id/quote` (shop) `{ items: [{description, quantity, unitPrice}], prepMinutes, note }`
  → `QUOTE` message; customer `POST /conversations/:id/quote/:messageId/accept` creates
  an order with custom line items (the print-shop path)
- `PATCH|DELETE /messages/:id` (edit/delete window, V2)

### 45.10 Files
- **`POST /files/upload-intent`** `{ purpose, mimeType, sizeBytes, filename }` →
  `201 { mediaId, uploadUrl, method: "PUT", headers, expiresInSec: 300 }`
  Guards: purpose-specific MIME allow-list and size cap; class `upload`.
- **`POST /files/:mediaId/complete`** → `202 { status: "SCANNING" }`; enqueues scan.
- **`GET /files/:mediaId`** → `200 { url, expiresInSec: 300, mimeType, sizeBytes,
  pageCount? }`; `403` if not authorised, `409 FILE_NOT_SCANNED`,
  `422 FILE_INFECTED`. Every issuance is audited.
- `DELETE /files/:mediaId` (owner or admin; soft delete).

### 45.11 Notifications
- `GET /notifications?cursor=`, `GET /notifications/unread-count`
- `POST /notifications/:id/read`, `POST /notifications/read-all`

### 45.12 Payments (V2)
- `POST /orders/:id/payment-intent` (idempotent) → provider client token
- `POST /webhooks/payments/:provider` — signature-verified, stores
  `payment_webhook_event`, returns `200` fast, processes async
- `POST /payments/:id/refund` (perm `payment.refund`), `GET /orders/:id/payments`

### 45.13 Reviews (V2)
- `POST /orders/:id/review`, `GET /businesses/:id/reviews?cursor=`,
  `POST /reviews/:id/reply` (shop), `POST /reviews/:id/report`

### 45.14 Admin (`/api/v1/admin/*`, permission-gated per endpoint)
- `GET /admin/metrics/overview`, `/admin/metrics/orders?groupBy=day`
- `GET /admin/operations/alerts` — stuck orders, unacknowledged orders, failed
  notifications, verification backlog
- `GET /admin/businesses?status=`, `POST /admin/businesses/:id/approve|reject|suspend`
  `{ reasonCode, note }`
- `GET /admin/users`, `POST /admin/users/:id/block|unblock`
- `GET /admin/orders`, `POST /admin/orders/:id/force-cancel`
- `GET|POST|PATCH /admin/categories/(business|product)`
- `GET|POST /admin/master-products`
- `GET|PUT /admin/config`, `/admin/feature-flags`
- `GET /admin/cities`, `PATCH /admin/cities/:id` (launch toggle)
- `GET /admin/audit-logs?entityType=&entityId=&actorId=&from=&to=`
- `GET|POST /admin/staff`, `PUT /admin/staff/:id/roles`
- `GET /admin/complaints` (V2)

### 45.15 Platform
- `GET /config` — public bootstrap: min app version, feature flags, limits, upload caps
- `GET /health` (liveness), `GET /health/ready` (DB + Redis + storage probes),
  `GET /metrics` (Prometheus, internal only)

---

## 46. Authorisation matrix (representative)

| Endpoint | Customer | Packer | Cashier | Manager | Owner | Support admin | Ops admin |
|---|---|---|---|---|---|---|---|
| `POST /orders` | ✅ own | — | — | — | — | — | — |
| `POST /orders/:id/accept` | — | — | — | ✅ | ✅ | — | — |
| `PATCH .../packing` | — | ✅ | — | ✅ | ✅ | — | — |
| `POST /orders/:id/ready` | — | ✅ | — | ✅ | ✅ | — | — |
| `POST /orders/:id/handover` | — | — | ✅ | ✅ | ✅ | — | — |
| `POST /orders/:id/cancel` | ✅ own (≤PACKING) | — | — | — | — | — | ✅ force |
| `PATCH /inventory/...` | — | ✅ | — | ✅ | ✅ | — | — |
| `POST /products` | — | — | — | ✅ | ✅ | — | — |
| `GET /conversations/:id` | ✅ member | ✅ branch | ✅ branch | ✅ | ✅ | ⚠️ metadata only | ⚠️ audited content |
| `POST /admin/businesses/:id/approve` | — | — | — | — | — | — | ✅ |

Every ✅ additionally requires resource scoping (`business_id`/`branch_id` derived from
the **resource**, never from the request body).

---

## 47. Real-time contract (see also Part 2 §21)

Handshake: `wss://api/rt?token=<access JWT>` (or `auth.token`); server joins
`user:<id>` automatically and authorises explicit `subscribe` for
`conversation:<id>`, `order:<id>`, `branch:<id>`.

Envelope:
```json
{ "event": "order.accepted", "eventId": "uuid", "occurredAt": "...", "version": 1,
  "data": { "orderId": "...", "status": "ACCEPTED", "promisedReadyAt": "...", "prepMinutes": 15 } }
```
Client rules: dedupe by `eventId`; on reconnect call
`GET /conversations/:id/messages?after=<cursor>` and `GET /orders?updatedSince=` before
trusting the stream again; never treat a missing event as a state change.

---

## 48. Contract testing & documentation

- zod schemas are the single source of truth → OpenAPI 3.1 generated at build →
  `packages/api-client` generated → clients compile against real contracts.
- CI fails on an OpenAPI diff that is not accompanied by a version/changelog entry.
- Every documented error `code` has at least one test that produces it.
- A Postman/Bruno collection and a seeded demo environment are generated from the same
  spec for manual QA.

---

Continue to [Part 5 — Testing, DevOps, Risks & Edge Cases](./05-testing-devops-risks.md).
