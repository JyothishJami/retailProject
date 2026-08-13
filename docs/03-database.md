# QuickPick — Database Architecture

> Part 3 of the Product Discovery & Architecture Document.
> PostgreSQL 16 + PostGIS. This is the V1 (MVP) schema proposal with the V2/V3 tables
> marked, so the migration path is visible from day one.

---

## 28. Cross-cutting conventions

| Convention | Rule | Why |
|---|---|---|
| Primary keys | `uuid` (v7 where available, else v4) named `id` | No enumerable ids in URLs (IDOR resistance); client-generatable for offline writes |
| Timestamps | `created_at`, `updated_at` (`timestamptz`, UTC) on every table | Auditability; timezone bugs are unrecoverable |
| Soft delete | `deleted_at timestamptz NULL` on user-visible, referenced entities (users, businesses, branches, products, messages). **Hard delete** for carts/cart items, expired OTPs, idempotency records, presence | Orders must keep referencing a "deleted" product |
| Enums | PostgreSQL enum types for stable domains (order status, payment status); `text` + check constraint where values churn | Type safety without endless migrations for volatile lists |
| Money | `numeric(12,2)` + separate `currency char(3)`; never floats. Minor-unit integers considered and rejected for readability, with all arithmetic done in SQL/`decimal.js` | Rounding correctness |
| Naming | snake_case, singular table names, `<table>_id` FKs | Consistency |
| Audit columns | `created_by`, `updated_by` on admin/staff-mutable tables | Accountability |
| Optimistic concurrency | `version int` on `order`, `branch_product` | Detect concurrent edits |
| Multi-tenancy | `business_id` / `branch_id` on every business-owned row, always indexed first in composite indexes | Every business query is tenant-scoped; a future shard key |
| Migrations | Prisma Migrate, forward-only, reviewed; expand-then-contract for breaking changes | Zero-downtime deploys |
| Indexes | Every FK indexed; composite indexes ordered by selectivity for real query shapes (documented per table) | |

---

## 29. Identity & access

### `user`
Purpose: one row per human identity, regardless of hats worn.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_type | enum(`CUSTOMER`,`BUSINESS_USER`,`PLATFORM_USER`) | primary context |
| full_name | text | |
| phone_e164 | text UNIQUE (nullable) | canonical E.164 |
| phone_verified_at | timestamptz | |
| email | citext UNIQUE (nullable) | |
| email_verified_at | timestamptz | |
| avatar_media_id | uuid FK → media_object | |
| status | enum(`ACTIVE`,`BLOCKED`,`PENDING`,`DELETED`) | |
| locale, timezone | text | |
| last_login_at | timestamptz | |
| created_at, updated_at, deleted_at | timestamptz | |

Constraints: at least one of `phone_e164` / `email` NOT NULL.
Indexes: `(phone_e164)`, `(email)`, `(user_type, status)`, `(created_at)`.

### `user_credential`
`id`, `user_id` FK, `type` enum(`PASSWORD`,`OTP_PHONE`,`OTP_EMAIL`,`OAUTH`),
`provider` text NULL, `provider_subject` text NULL, `secret_hash` text NULL (Argon2id),
`password_changed_at`, `failed_attempts int`, `locked_until timestamptz`, timestamps.
Unique: `(user_id, type, provider)`, `(provider, provider_subject)`.
**Why separate:** adding OAuth/MFA is a new row/type, not a user-table migration.

### `otp_challenge`
`id`, `user_id` NULL, `destination` text, `channel` enum(`SMS`,`EMAIL`),
`purpose` enum(`LOGIN`,`REGISTER`,`RESET`,`VERIFY_PHONE`), `code_hash` text (HMAC),
`attempts int`, `max_attempts int`, `expires_at`, `consumed_at`, `ip inet`, timestamps.
Indexes: `(destination, purpose, created_at desc)`. Hard-deleted by a cleanup job.

### `session`
`id`, `user_id`, `device_id` FK, `refresh_token_hash` text UNIQUE,
`parent_session_id` uuid NULL (rotation family), `expires_at`, `revoked_at`,
`revoked_reason`, `ip inet`, `user_agent`, `last_used_at`.
Indexes: `(user_id, revoked_at)`, `(refresh_token_hash)`.
**Reuse detection:** presenting an already-rotated token revokes the whole family.

### `device`
`id`, `user_id`, `platform` enum(`IOS`,`ANDROID`,`WEB`), `push_token` text,
`push_token_invalid_at`, `app_version`, `os_version`, `last_seen_at`.
Unique: `(user_id, platform, push_token)`. Index: `(push_token)`.

### `role`, `permission`, `role_permission`, `user_role`
- `role`: `id`, `code` UNIQUE (`SUPER_ADMIN`,`ADMIN`,`OPERATIONS_ADMIN`,
  `SUPPORT_ADMIN`,`FINANCE_ADMIN`,`MODERATOR`,`ANALYST`,`OWNER`,`MANAGER`,`PACKER`,
  `CASHIER`,`STAFF`,`CUSTOMER`), `scope_type` enum(`PLATFORM`,`BUSINESS`,`BRANCH`),
  `is_system bool`.
- `permission`: `id`, `code` UNIQUE (`order.accept`, `product.write`,
  `business.approve`, `message.read_content`, …), `description`.
- `role_permission`: `(role_id, permission_id)` PK.
- `user_role`: `id`, `user_id`, `role_id`, `business_id` NULL, `branch_id` NULL,
  `granted_by`, `expires_at` NULL. Unique `(user_id, role_id, business_id, branch_id)`.

**Why permission tables and not an enum check:** §24 requires that adding a role or a
plan entitlement never touches request handlers. Handlers check
`can(user, 'order.accept', {branchId})`; the resolution walks `user_role` scoped rows.

---

## 30. Business & branch

### `business_category`
`id`, `code` UNIQUE, `name`, `icon_media_id`, `sort_order`, `is_active`.
Admin-curated (grocery, pharmacy, print, bakery, …).

### `business`
`id`, `owner_user_id` FK, `business_category_id` FK, `name`, `slug` UNIQUE,
`legal_name`, `description`, `logo_media_id`, `cover_media_id`,
`status` enum(`DRAFT`,`PENDING_VERIFICATION`,`APPROVED`,`REJECTED`,`SUSPENDED`),
`status_reason`, `approved_at`, `approved_by`, `plan_code` (Billing),
`rating_avg numeric(3,2)`, `rating_count int`, `reliability_score numeric(5,2)`,
`settings jsonb`, timestamps, `deleted_at`.
Indexes: `(status)`, `(business_category_id, status)`, `(owner_user_id)`, `(slug)`.
Denormalised rating/reliability are maintained by triggers/jobs for ranking speed.

### `business_document`
`id`, `business_id`, `doc_type` enum(`GST`,`LICENSE`,`ID_PROOF`,`ADDRESS_PROOF`,
`OTHER`), `media_id`, `number_encrypted bytea`, `status`
enum(`PENDING`,`VERIFIED`,`REJECTED`), `reviewed_by`, `reviewed_at`, `notes`.
KYC numbers are column-encrypted; media is private + scanned.

### `branch`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| business_id | uuid FK | tenant |
| name, code | text | `code` unique per business |
| phone_e164 | text | |
| address_line1/2, city, state, postal_code, country | text | |
| location | `geography(Point,4326)` NOT NULL | PostGIS |
| pickup_instructions | text | |
| status | enum(`ACTIVE`,`INACTIVE`,`TEMP_CLOSED`) | |
| accepting_orders | bool | manual kill-switch |
| avg_prep_minutes | int | rolling, for discovery ETA band |
| inventory_mode | enum(`AVAILABILITY_ONLY`,`LOW_STOCK_THRESHOLD`,`TRACKED_QUANTITY`) | FR-E1 |
| order_accept_timeout_min, pickup_expiry_hours | int | per-branch overrides |
| timezone | text | hours are local |
| timestamps, deleted_at | | |

Indexes: **`GIST(location)`** (nearby search), `(business_id, status)`,
`(city, status)`.

### `branch_hour`
`id`, `branch_id`, `day_of_week smallint (0–6)`, `opens_at time`, `closes_at time`,
`is_closed bool`. Multiple rows per day support split shifts (lunch closure).
Unique `(branch_id, day_of_week, opens_at)`.

### `branch_holiday`
`id`, `branch_id`, `date`, `reason`, `is_closed bool`, optional custom hours.

### `branch_staff`  *(V2, table created in V1 so orders can reference an actor)*
`id`, `branch_id`, `user_id`, `role_id`, `status` enum(`INVITED`,`ACTIVE`,
`SUSPENDED`), `invited_by`, `joined_at`. Unique `(branch_id, user_id)`.

---

## 31. Catalog

### `product_category`  (platform tree, admin-curated)
`id`, `parent_id` self-FK, `name`, `slug`, `path ltree` (or `materialized_path text`),
`level int`, `icon_media_id`, `sort_order`, `is_active`.
Indexes: `(parent_id)`, GIST on `path`. **Why a path column:** category subtree queries
("everything under Beverages") must not be recursive CTEs on every product listing.

### `business_category_custom`
`id`, `business_id`, `name`, `sort_order`, `is_active` — the shop's own aisle grouping,
independent of the platform tree (shops think in aisles, the platform thinks in taxonomy).

### `product`
`id`, `business_id` FK, `product_category_id` FK NULL,
`business_category_custom_id` FK NULL, `master_product_id` FK NULL (master catalog
lineage), `name`, `description`, `brand`, `sku` (unique per business, nullable),
`unit` (`kg`,`g`,`l`,`ml`,`piece`,`pack`,`page`,`service`), `unit_value numeric`,
`mrp numeric(12,2)`, `base_price numeric(12,2)`, `tax_rate numeric(5,2)`,
`discount_type` enum(`NONE`,`PERCENT`,`FLAT`), `discount_value numeric`,
`is_active bool`, `is_custom bool` (FR-D6 non-catalog items),
`search_vector tsvector` (generated), timestamps, `deleted_at`.
Indexes: `(business_id, is_active)`, `(business_id, sku)` unique,
GIN on `search_vector`, GIN `gin_trgm_ops` on `name`.

### `product_media`
`id`, `product_id`, `media_id`, `sort_order`, `is_primary`.

### `product_variant`  *(V2)*
`id`, `product_id`, `name`, `sku`, `price_delta numeric`, `attributes jsonb`,
`is_active`. Variant becomes the sellable unit when present.

### `master_product`  (platform-seeded FMCG catalog, FR-D5)
`id`, `name`, `brand`, `barcode` UNIQUE NULL, `product_category_id`, `unit`,
`unit_value`, `default_mrp`, `image_media_id`, `is_active`.
**Why:** shop catalog onboarding is the #1 churn driver; searching a master catalog and
tapping "add" is 10× faster than typing products.

### `branch_product`  (the availability/pricing join — see ADR-05)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| branch_id, product_id | uuid FK | unique together |
| product_variant_id | uuid FK NULL | V2 |
| price_override | numeric(12,2) NULL | falls back to `product.base_price` |
| availability | enum(`AVAILABLE`,`OUT_OF_STOCK`,`HIDDEN`) | |
| quantity_on_hand | numeric(12,3) NULL | only for `TRACKED_QUANTITY` |
| quantity_reserved | numeric(12,3) DEFAULT 0 | |
| low_stock_threshold | numeric(12,3) NULL | |
| version | int | optimistic concurrency |
| updated_by | uuid | |

Unique: `(branch_id, product_id, product_variant_id)`.
Indexes: `(branch_id, availability)`, `(product_id)`.
Derived rule: effective availability = `HIDDEN` → not listed; `TRACKED_QUANTITY` and
`quantity_on_hand - quantity_reserved <= 0` → out of stock.

### `inventory_transaction`  (append-only ledger)
`id`, `branch_product_id`, `order_id` NULL, `type` enum(`MANUAL_ADJUST`,`RESERVE`,
`RELEASE`,`CONSUME`,`IMPORT`,`CORRECTION`), `quantity_delta numeric(12,3)`,
`quantity_after numeric(12,3)`, `reason`, `actor_user_id`, `created_at`.
Indexes: `(branch_product_id, created_at desc)`, `(order_id)`.
**Never updated, never deleted** — it is the audit and the future forecasting dataset.

---

## 32. Customer, location, cart

### `address`
`id`, `user_id`, `label`, `address_line1/2`, `landmark`, `city`, `state`,
`postal_code`, `country`, `location geography(Point,4326)`, `is_default`, timestamps,
`deleted_at`. Index `(user_id, is_default)`, GIST `(location)`.

### `cart`
`id`, `customer_user_id`, `branch_id`, `status` enum(`ACTIVE`,`CONVERTED`,
`ABANDONED`,`EXPIRED`), `expires_at`, `converted_order_id` NULL, timestamps.
**Partial unique index:** `(customer_user_id, branch_id) WHERE status='ACTIVE'`
— enforces FR-G1 in the database, not in application code.

### `cart_item`
`id`, `cart_id`, `branch_product_id`, `product_id`, `product_variant_id` NULL,
`quantity numeric(12,3)`, `unit_price_snapshot numeric(12,2)`,
`tax_rate_snapshot numeric(5,2)`, `notes text`, timestamps.
Unique `(cart_id, branch_product_id, product_variant_id)`.

---

## 33. Ordering

### `order`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_number | text UNIQUE | human-readable (`QP-10025`), from a sequence |
| customer_user_id | uuid FK | |
| business_id, branch_id | uuid FK | denormalised business_id for tenant queries |
| cart_id | uuid FK UNIQUE NULL | one cart converts to at most one order |
| status | enum (all §19 states) | |
| fulfilment_type | enum(`PICKUP`,`DELIVERY`) DEFAULT `PICKUP` | V3-ready |
| item_count | int | |
| subtotal, tax_total, discount_total, grand_total | numeric(12,2) | snapshot |
| currency | char(3) | |
| payment_mode | enum(`PAY_AT_STORE`,`ONLINE`) | |
| payment_status | enum(`NOT_APPLICABLE`,`PENDING`,`AUTHORIZED`,`CAPTURED`,`FAILED`,`REFUND_PENDING`,`REFUNDED`) | mirrored for queries; `payment` is authoritative |
| prep_minutes_initial, prep_minutes_current | int NULL | |
| placed_at, received_at, accepted_at, promised_ready_at, ready_at, arrived_at, handed_over_at, completed_at, cancelled_at | timestamptz NULL | one column per milestone: analytics without parsing history |
| cancelled_by_user_id, cancel_reason | | |
| pickup_code | char(6) | hashed? **No** — displayed to both sides; short-lived and single-order scoped |
| customer_note | text | |
| idempotency_key | text | unique with customer |
| version | int | |
| timestamps | | |

Unique: `(customer_user_id, idempotency_key)`, `(cart_id)`.
Indexes: `(branch_id, status, placed_at desc)` — the shop queue query;
`(customer_user_id, placed_at desc)` — order history;
`(status, placed_at)` — expiry/stuck-order jobs;
`(business_id, completed_at)` — analytics.

### `order_item`
`id`, `order_id`, `product_id`, `product_variant_id` NULL, `branch_product_id` NULL,
`name_snapshot`, `unit_snapshot`, `unit_value_snapshot`,
`quantity_ordered numeric(12,3)`, `quantity_fulfilled numeric(12,3)`,
`unit_price numeric(12,2)`, `tax_rate numeric(5,2)`, `line_total numeric(12,2)`,
`packing_status` enum(`PENDING`,`PACKED`,`SUBSTITUTED`,`UNAVAILABLE`),
`substitute_product_id` NULL, `substitution_approved_at`, `is_custom_item bool`,
`custom_spec jsonb` (print jobs: pages, copies, colour, paper), `media_id` NULL.
Index `(order_id)`.
**Snapshots exist so a later product rename/price change cannot rewrite history.**

### `order_status_history`
`id`, `order_id`, `from_status`, `to_status`, `actor_user_id` NULL,
`actor_role` text, `actor_type` enum(`CUSTOMER`,`BUSINESS`,`ADMIN`,`SYSTEM`),
`reason`, `metadata jsonb`, `created_at`.
Index `(order_id, created_at)`. Append-only.

### `order_prep_adjustment`
`id`, `order_id`, `delta_minutes int`, `reason`, `actor_user_id`,
`promised_ready_at_before/after`, `created_at`.

### `pickup`
`id`, `order_id` UNIQUE, `method` enum(`CODE`,`QR`,`OTP`,`MANUAL_OVERRIDE`),
`verified_at`, `verified_by_user_id`, `override_reason`, `attempts int`.

---

## 34. Conversations

### `conversation`
`id`, `type` enum(`ORDER`,`BRANCH`,`SUPPORT`), `order_id` NULL UNIQUE,
`business_id`, `branch_id`, `customer_user_id`, `status` enum(`OPEN`,`SYSTEM_ONLY`,
`CLOSED`), `last_message_id`, `last_message_at`, timestamps.
Indexes: `(branch_id, last_message_at desc)` (shop inbox),
`(customer_user_id, last_message_at desc)` (customer inbox), `(order_id)`.
`last_message_*` denormalised — inbox lists must not aggregate `messages`.

### `conversation_member`
`id`, `conversation_id`, `user_id`, `member_role` enum(`CUSTOMER`,`BUSINESS`,`ADMIN`,
`SYSTEM`), `last_read_message_id`, `last_read_at`, `unread_count int`,
`muted_until`, `joined_at`, `left_at`.
Unique `(conversation_id, user_id)`. Unread counts are per member, incremented in the
send transaction (cheap) rather than computed per inbox render (expensive).

### `message`
`id`, `conversation_id`, `sender_user_id` NULL (NULL ⇒ system),
`client_message_id` text, `type` enum(`TEXT`,`IMAGE`,`FILE`,`SYSTEM`,`PRODUCT_REF`,
`ORDER_REF`,`QUOTE`), `body text` NULL, `payload jsonb` NULL (quote details, refs,
system event code + params for localisation), `reply_to_message_id` NULL,
`status` enum(`SENT`,`DELIVERED`,`READ`,`FAILED`), `edited_at`, `deleted_at`,
`created_at`.
Unique `(conversation_id, client_message_id)` → **idempotent send**.
Index `(conversation_id, created_at desc)`, `(sender_user_id)`.
Partitioned by `created_at` month once large (§25.2).
**System messages store an event code, not a rendered sentence** — so localisation and
copy changes work retroactively.

### `message_attachment`
`id`, `message_id`, `media_id`, `sort_order`.

### `message_receipt`  *(V2, group-ready)*
`(message_id, user_id)` PK, `delivered_at`, `read_at`.

---

## 35. Media

### `media_object`
`id`, `owner_user_id`, `purpose` enum(`CHAT_IMAGE`,`CHAT_DOCUMENT`,`PRODUCT_IMAGE`,
`BUSINESS_DOCUMENT`,`BUSINESS_MEDIA`,`AVATAR`,`REVIEW_PHOTO`), `storage_key` UNIQUE,
`bucket`, `mime_type`, `size_bytes bigint`, `checksum_sha256`,
`original_filename` (sanitised, display only),
`status` enum(`PENDING`,`UPLOADED`,`SCANNING`,`SCAN_CLEAN`,`INFECTED`,`FAILED`,
`DELETED`), `scan_result jsonb`, `width`, `height`, `page_count int` (PDF quoting),
`thumbnail_key`, `expires_at` NULL, timestamps, `deleted_at`.
Indexes: `(owner_user_id, created_at desc)`, `(status)`.

---

## 36. Notifications

### `notification`
`id`, `user_id`, `category` enum(`ORDER`,`CHAT`,`ACCOUNT`,`PAYMENT`,`MARKETING`,
`SYSTEM`), `event_code`, `title`, `body`, `payload jsonb` (deep-link target),
`priority` enum(`CRITICAL`,`NORMAL`,`LOW`), `read_at`, `created_at`.
Index `(user_id, created_at desc)`, `(user_id) WHERE read_at IS NULL`.

### `notification_delivery`
`id`, `notification_id`, `channel` enum(`IN_APP`,`PUSH`,`SMS`,`EMAIL`),
`status` enum(`QUEUED`,`SENT`,`DELIVERED`,`FAILED`,`SUPPRESSED`), `provider`,
`provider_message_id`, `attempts int`, `last_error`, `dedupe_key` UNIQUE,
`sent_at`, timestamps. **`dedupe_key = hash(event_id, user_id, channel)`** makes
outbox retries safe.

### `notification_preference`
`(user_id, category, channel)` PK, `enabled bool`, `quiet_hours_start/end time`.

---

## 37. Payments & reviews *(V2 tables, designed now)*

### `payment`
`id`, `order_id`, `method` enum(`PAY_AT_STORE`,`UPI`,`CARD`,`WALLET`,`NETBANKING`),
`provider`, `provider_payment_id`, `status` enum(`PENDING`,`AUTHORIZED`,`CAPTURED`,
`FAILED`,`CANCELLED`,`REFUND_PENDING`,`REFUNDED`), `amount`, `currency`,
`idempotency_key` UNIQUE, `failure_code`, `raw_payload jsonb` (redacted),
`captured_at`, timestamps. Index `(order_id)`, `(provider, provider_payment_id)` unique.

### `refund`
`id`, `payment_id`, `amount`, `reason`, `status`, `provider_refund_id`, timestamps.

### `payment_webhook_event`
`id`, `provider`, `provider_event_id` UNIQUE, `type`, `payload jsonb`,
`processed_at`, `error`. **Idempotent webhook ingestion**; never process inline.

### `review`
`id`, `order_id` , `business_id`, `branch_id`, `author_user_id`,
`rating_overall smallint (1–5)`, `rating_availability`, `rating_speed`,
`comment text`, `status` enum(`PUBLISHED`,`PENDING_MODERATION`,`REMOVED`),
`business_reply text`, `business_replied_at`, timestamps.
Unique `(order_id, author_user_id)` — one review per order (anti-abuse).
Index `(business_id, status, created_at desc)`.

### `review_media`, `review_report`
Photos and abuse reports; moderation queue reads `review_report`.

---

## 38. Platform / operations tables

### `outbox_event`
`id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload jsonb`,
`occurred_at`, `published_at` NULL, `attempts int`, `last_error`.
Index `(published_at, occurred_at)` — the pump query. Written **in the same
transaction** as the domain change.

### `processed_event`
`(handler, event_id)` PK, `processed_at` — consumer-side dedupe (effectively-once).

### `idempotency_record`
`id`, `key`, `user_id`, `endpoint`, `request_hash`, `response_status`,
`response_body jsonb`, `expires_at`. Unique `(user_id, endpoint, key)`.

### `audit_log`
`id`, `actor_user_id`, `actor_type`, `action`, `entity_type`, `entity_id`,
`before jsonb`, `after jsonb`, `ip inet`, `user_agent`, `request_id`, `created_at`.
Append-only, no update/delete grants for the app role.
Index `(entity_type, entity_id, created_at desc)`, `(actor_user_id, created_at desc)`.

### `platform_config` / `feature_flag`
`key` PK, `value jsonb`, `description`, `updated_by`, `updated_at`; flags support
percentage and per-city/per-business targeting.

### `city` / `service_area`
`id`, `name`, `state`, `country`, `boundary geography(Polygon)` NULL,
`is_launched bool` — controls where discovery returns results and is the natural future
shard key.

### `search_query_log`  *(analytics)*
`id`, `user_id` NULL, `query`, `result_count`, `city`, `created_at` — drives
zero-result reporting and future ranking.

---

## 39. Key query shapes and their indexes

| Query | SQL shape | Index used |
|---|---|---|
| Nearby open branches | `WHERE ST_DWithin(location, :point, :radius) AND status='ACTIVE' AND accepting_orders` + business join on `APPROVED`, ordered by distance | `GIST(branch.location)` + `(business.status)` |
| Branch catalog page | `branch_product JOIN product WHERE branch_id=? AND availability<>'HIDDEN'` paginated by `(name,id)` keyset | `(branch_id, availability)` |
| Product search in branch | `search_vector @@ websearch_to_tsquery` ∪ trigram similarity | GIN `search_vector`, GIN trgm `name` |
| Shop order queue | `WHERE branch_id=? AND status IN (...) ORDER BY placed_at` | `(branch_id, status, placed_at desc)` |
| Customer order history | `WHERE customer_user_id=? ORDER BY placed_at DESC` keyset | `(customer_user_id, placed_at desc)` |
| Conversation inbox | `WHERE branch_id=? ORDER BY last_message_at DESC` | `(branch_id, last_message_at desc)` |
| Message page | `WHERE conversation_id=? AND created_at < :cursor ORDER BY created_at DESC LIMIT 50` | `(conversation_id, created_at desc)` |
| Stuck-order job | `WHERE status IN ('ORDER_PLACED','RECEIVED') AND placed_at < now()-interval` | `(status, placed_at)` |
| Unread badge | `count(*) FROM notification WHERE user_id=? AND read_at IS NULL` | partial index |

**Pagination:** keyset (cursor) pagination everywhere user-facing; `OFFSET` only in
admin screens with bounded page counts. **Why:** offset pagination degrades and
double-shows rows in fast-moving lists (orders, messages).

---

## 40. Data consistency, concurrency, and race conditions

| Scenario | Mechanism |
|---|---|
| Two customers order the last tracked unit | `SELECT ... FOR UPDATE` on `branch_product` inside the placement/acceptance transaction + conditional `quantity_on_hand - quantity_reserved >= qty`; loser gets a 409 with the available quantity |
| Duplicate order submit (retry/double tap) | `Idempotency-Key` + unique `(customer_user_id, idempotency_key)` + unique `(cart_id)` |
| Concurrent order status changes (owner on phone, manager on web) | Row lock + `version` check → 409 `StaleOrderState`; UI refetches |
| Price changed between cart and checkout | Cart stores the snapshot; checkout preflight diffs and requires explicit acceptance |
| Payment captured but order create failed (V2) | Payment intent created *before* order only with an `order_draft`; reconciliation job refunds orphan captures; webhook events are stored then processed idempotently |
| Order saved but notification lost | Transactional outbox (same commit) + retry with backoff |
| Notification sent twice | `dedupe_key` unique on `notification_delivery` + `processed_event` |
| Chat message duplicated by client retry | Unique `(conversation_id, client_message_id)` |
| Unread counters drifting | Incremented in the send transaction; a nightly job recomputes and corrects |
| Inventory drift from manual edits | Every change writes `inventory_transaction` with `quantity_after`; a job asserts ledger sum = current value and alerts on mismatch |
| Cross-aggregate consistency (order ↔ conversation ↔ inventory) | Same-database transaction in V1; after service extraction, saga with compensating events (documented per flow before extraction) |
| Eventual consistency exposure | Only presence/typing/analytics/search are allowed to be eventually consistent. Order state, totals, and inventory reservation are strongly consistent — non-negotiable |

**Isolation level:** default `READ COMMITTED` with explicit row locks for the flows
above; `REPEATABLE READ` for the packing finalisation transaction. Long transactions
are forbidden (no external HTTP calls inside a transaction — that is what the outbox
is for).

---

## 41. Retention, soft deletion, and privacy

| Data | Retention | Deletion behaviour |
|---|---|---|
| Orders, order items, status history | 7 years (tax/dispute) | never hard-deleted; PII pseudonymised on account deletion |
| Messages | 24 months default (configurable) | soft delete → purge job |
| Chat media | 12 months, or 30 days after order completion for documents | storage lifecycle rule + metadata soft delete |
| OTP challenges | 24 hours | hard delete |
| Sessions/devices | 90 days after expiry | hard delete |
| Audit logs | 3 years | immutable, never deleted by the app |
| Search/analytics logs | 12 months raw, then aggregated | aggregate-only retention |
| Account deletion request | 30-day grace, then pseudonymise `user` (name/phone/email → tokens), keep order rows | export before delete on request |

Access to message content and KYC documents by platform staff requires an explicit
permission (`message.read_content`, `business.read_kyc`) and writes an `audit_log` row.

---

Continue to [Part 4 — API](./04-api.md).
