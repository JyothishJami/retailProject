# QuickPick — Architecture

> Part 2 of the Product Discovery & Architecture Document.
> Covers: domain model, high-level system architecture, technology evaluation,
> order state machine, prep-time engine, real-time, files/media, notifications,
> security, scalability, and architectural decision records.

---

## 16. Domain Model

### 16.1 Bounded contexts (module boundaries)

```text
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Identity   │ │   Business   │ │   Catalog    │ │  Inventory   │
│ users, roles │ │ business,    │ │ categories,  │ │ availability,│
│ sessions     │ │ branch,staff │ │ products     │ │ ledger       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Discovery   │ │     Cart     │ │  Ordering    │ │ Conversation │
│ geo search   │ │ carts, items │ │ order agg.,  │ │ threads,     │
│ ranking      │ │              │ │ state machine│ │ messages     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    Media     │ │ Notification │ │   Payment    │ │   Review     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Billing    │ │    Admin     │ │  Platform    │
│ plans/limits │ │ ops, audit   │ │ config,flags │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Rules that make these boundaries real (and enforced in CI):**

1. A module may only be reached through its **public service interface**
   (`<module>/<module>.service.ts` + DTOs). No cross-module repository/entity imports.
2. Cross-module *reactions* go through **domain events**, never direct writes.
   (`OrderAccepted` → Conversation writes a system message; Notification sends push;
   Inventory reserves stock.)
3. Foreign keys across contexts are allowed inside one PostgreSQL database in V1, but
   **queries never join across more than one context boundary** in application code —
   read models/aggregating queries live in a dedicated `reporting` module. This is what
   makes later extraction to a service mechanically possible.
4. Each module owns its tables with a table-name prefix convention.

### 16.2 Aggregates and invariants

| Aggregate | Root | Key invariants |
|-----------|------|----------------|
| Business | `business` | Cannot receive orders unless `APPROVED` and not suspended; ≥1 active branch |
| Branch | `branch` | Belongs to exactly one business; has geo point + hours; open/closed derived from hours ∪ override |
| Product | `product` | Owned by business; sellable at a branch only via `branch_product` |
| InventoryItem | `branch_product` | Availability derived from tracking mode; quantity ≥ 0; every change has a ledger row |
| Cart | `cart` | Exactly one active cart per (customer, branch); all items from that branch |
| **Order** | `order` | **Single branch; immutable price snapshot; status changes only via allowed transitions; total = Σ(items) + tax − discount; every transition has a history row** |
| Conversation | `conversation` | Order conversation has exactly one order; members are customer + branch staff |
| Message | `message` | Immutable body after send window; belongs to one conversation; unique `(conversation_id, client_message_id)` |
| MediaObject | `media_object` | Not readable until `SCAN_CLEAN`; access authorised via owning conversation/order |
| Payment | `payment` | Belongs to one order; state machine independent of order state |
| Review | `review` | One per (order, author); only after `COMPLETED` |

### 16.3 Relationship map

```text
business 1─n branch 1─n branch_staff n─1 user
business 1─n product 1─n product_variant (V2)
branch   1─n branch_product n─1 product          (availability + price override)
branch_product 1─n inventory_transaction
customer(user) 1─n address
customer 1─n cart (one active per branch) 1─n cart_item
customer 1─n order 1─n order_item
order    1─n order_status_history
order    1─1 conversation (type=ORDER)  ─┐
branch   1─n conversation (type=BRANCH) ─┴─ 1─n message 1─n message_attachment ─ media_object
order    1─n payment 1─n refund
order    1─1 pickup
order    1─n notification
user     1─n notification, session, device
* 1─n audit_log
```

**Why `branch_product` is a first-class entity:** the same product sold by a business
may be available in branch A and out of stock in branch B at a different price. Putting
availability on `product` would make multi-branch impossible without a rewrite, which is
the single most expensive mistake available in this domain.

### 16.4 Identity model

One `user` table with `user_type` (`CUSTOMER | BUSINESS_USER | PLATFORM_USER`) and a
separate `user_credential` table (`type: PASSWORD | OTP_PHONE | OAUTH`, provider,
secret hash). **WHY:** a single identity can later be both a customer and a shop
staff member; and adding OAuth (FR-A7) becomes a new credential row, not a schema
migration of the user table. Roles are assigned via `user_role` scoped optionally to a
business/branch, so "MANAGER of branch 3" is expressible.

---

## 17. High-Level System Architecture

### 17.1 V1 (MVP) topology — modular monolith

```text
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ Customer app │   │  Shop app    │   │  Admin web   │
 │ React Native │   │ React Native │   │  React SPA   │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        │ HTTPS/REST + WSS │                  │
        └─────────┬────────┴──────────┬───────┘
                  ▼                   ▼
          ┌───────────────────────────────────┐
          │  Load balancer / TLS termination  │
          └───────────────┬───────────────────┘
                          ▼
   ┌────────────────────────────────────────────────────┐
   │  QuickPick API (NestJS, TypeScript) — 2+ instances │
   │  ┌──────────────────────────────────────────────┐  │
   │  │ HTTP module (REST /api/v1) │ WS gateway      │  │
   │  ├──────────────────────────────────────────────┤  │
   │  │ Domain modules (§16.1)                       │  │
   │  ├──────────────────────────────────────────────┤  │
   │  │ Event bus (in-process) + transactional outbox│  │
   │  └──────────────────────────────────────────────┘  │
   └───┬───────────┬──────────────┬─────────────┬───────┘
       │           │              │             │
       ▼           ▼              ▼             ▼
 ┌──────────┐ ┌─────────┐  ┌────────────┐ ┌──────────────┐
 │PostgreSQL│ │  Redis  │  │ S3-compat  │ │ Worker procs │
 │ +PostGIS │ │cache,   │  │  storage   │ │ BullMQ:      │
 │ primary  │ │socket   │  │ + CDN      │ │ outbox pump, │
 │ +replica │ │adapter, │  └────────────┘ │ notifications│
 └──────────┘ │queues,  │                 │ scans, jobs  │
              │rate lim │                 └──────┬───────┘
              └─────────┘                        ▼
                                    ┌──────────────────────────┐
                                    │ FCM │ SMS │ Email │ Maps │
                                    │ AV scanner │ (Payments V2)│
                                    └──────────────────────────┘
```

Same deployable artifact runs in two roles (`ROLE=api` / `ROLE=worker`) — one build,
two process types. **WHY:** avoids a second codebase while keeping request latency
isolated from background work.

### 17.2 Request/flow patterns

**Command flow (place order)**

```text
POST /orders (Idempotency-Key)
  → guard: authn → authz(permission) → rate limit → validation (zod/class-validator)
  → OrderService.place()
      BEGIN
        SELECT cart FOR UPDATE
        revalidate availability + price per item
        insert order + order_items (price snapshot)
        insert order_status_history(ORDER_PLACED)
        insert conversation + system message
        insert outbox_event(order.placed)
        mark cart CONVERTED
      COMMIT
  → 201 (+ same response for a repeated Idempotency-Key)
outbox pump → publish → [Notification, RealTime, Analytics] handlers
```

**Event flow:** transactional outbox → poller (worker) → in-process bus + Redis
pub/sub → handlers (idempotent, keyed by `event_id`) → side effects (push, socket
emit, system message). **WHY outbox:** without it, "order saved but notification
lost" and "notification sent but transaction rolled back" are both live bugs. The
outbox makes side effects *at-least-once* and the handler dedupe makes them
*effectively-once*.

### 17.3 Target topology at scale (V3+)

```text
CDN → API Gateway → [API pods ×N] ─┬─ PostgreSQL primary (+ read replicas, PgBouncer)
                                    ├─ Redis cluster (cache/presence/queues)
                                    ├─ Kafka/NATS (event backbone, replaces outbox pump)
                                    ├─ OpenSearch (product/business search)
                                    ├─ Object storage + CDN
                                    └─ extracted services: Chat, Notification, Search,
                                       Media, Analytics (in that order of extraction)
```

---

## 18. Technology Stack Evaluation

### 18.1 Backend framework

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **NestJS (Node + TS)** | First-class DI and module boundaries (exactly the modular-monolith need), same language as clients, mature WebSocket/queue/validation integrations, huge hiring pool | Node CPU-bound weakness (irrelevant here — this is an I/O-bound workload), opinionated boilerplate | **Chosen** |
| Express/Fastify bare | Minimal, fast | No enforced module structure → the monolith degenerates into a mud ball; we would rebuild Nest's DI badly | Rejected |
| Spring Boot (Java/Kotlin) | Strongest transactional/enterprise story, excellent tooling | Second language + second toolchain; slower iteration for a small team; heavier ops | Rejected for V1 |
| Django/FastAPI (Python) | Fast to build, great admin scaffold | Weaker real-time story; third language in the stack | Rejected |
| Go | Best runtime efficiency, great concurrency | Slower feature velocity, less shared code with clients | Reconsider later for extracted chat/notification services |

**WHY:** the dominant risk in V1 is *feature velocity and correctness*, not CPU. One
TypeScript language across API, worker, mobile, and web maximises shared types
(`packages/shared` with zod schemas + generated API client), which removes an entire
class of contract bugs. NestJS's module system is the cheapest available mechanism for
enforcing the boundaries in §16.1 — and boundary enforcement is what makes the
"monolith → services" path real rather than aspirational.

### 18.2 Database

**PostgreSQL 16 + PostGIS.** Chosen because the domain is intensely relational and
transactional (inventory reservation, order placement, payments) and simultaneously
geospatial (nearby search) and text-search-y (product search). PostgreSQL does all
three well enough that V1 needs *one* datastore.

- MongoDB rejected: order/inventory correctness wants real multi-row transactions and
  constraints; schemaless flexibility is not the bottleneck.
- Separate geo store or Elasticsearch rejected for V1: PostGIS GIST handles radius
  search at our scale; `pg_trgm` + `tsvector` handle typo-tolerant search until
  catalog size or ranking sophistication forces OpenSearch (V3).
- **Chat messages stay in PostgreSQL** for V1 (partitioned by month later). They are
  the fastest-growing table; when write volume or retention forces it, `messages`
  moves to a dedicated store — which the Conversation module boundary permits.

**ORM:** Prisma for typed access + migrations; raw SQL for geospatial and analytics
queries. **WHY:** Prisma gives the strongest TS type-safety and a clean migration
workflow; escaping to SQL for the 5% it handles poorly is a deliberate, contained cost.

### 18.3 Cache / queue / real-time

- **Redis** — cache (config, catalog reads, discovery results), Socket.IO adapter for
  cross-instance fan-out, presence/typing TTL keys, rate-limit counters, and **BullMQ**
  job queues (notifications, scans, reminders, outbox pump). One dependency, four jobs.
- **Socket.IO over raw WebSocket** — because we need rooms, automatic reconnection with
  backoff, and a horizontal-scaling adapter on day one; a raw `ws` implementation means
  writing all three ourselves. Cost: protocol lock-in and slight overhead — acceptable.
- **No Kafka in V1.** The outbox + BullMQ gives ordering-per-key and retries at our
  volume. Kafka arrives when we need multi-consumer replay and cross-service streams
  (V3), and the outbox's `publish()` seam is where it plugs in.

### 18.4 Clients

- **Customer & Shop apps: React Native (Expo) + TypeScript.** One codebase per app,
  shared types/design system with the web admin, and native push/camera/geolocation via
  Expo modules. Flutter would be equally capable but adds a second language and
  forfeits shared TS contracts. Two *separate* apps (not one with a role switch): the
  shop app is an operational tool with different navigation, alerting, and store
  listing; merging them harms both.
- **Admin: React + TypeScript + Vite**, a data-grid-first UI (TanStack Table/Query).
  Information density and analytics beat mobile ergonomics here.
- **Shop web dashboard (V2):** the same React admin shell with a business role — shops
  with a PC will do catalog work there, which materially reduces onboarding pain.

### 18.5 Supporting choices

| Concern | Choice | Why |
|---|---|---|
| Object storage | S3-compatible (AWS S3 / R2 / MinIO in dev) | Portable API; pre-signed uploads keep big files off the API |
| CDN | CloudFront/Cloudflare | Image delivery cost/latency |
| Push | FCM (Android + iOS via APNs bridge) | Single integration, free, mature |
| SMS/OTP | Pluggable provider (e.g. MSG91/Twilio) behind an `SmsProvider` port | Deliverability and price vary by geography; must be swappable |
| Email | Transactional provider (SES/Postmark) behind an `EmailProvider` port | Same reason |
| Maps/geocoding | Provider behind a `GeoProvider` port; Google Maps for autocomplete/geocode quality, OSM/Nominatim fallback in dev | Geocoding quality is regionally decisive; cost caps require a swap option |
| AV scanning | ClamAV in a worker container; upgradeable to a hosted scanner | Untrusted PDFs from strangers reach shop devices — non-negotiable |
| Auth crypto | Argon2id for passwords, HMAC-hashed OTPs, RS256 JWT with key rotation | Modern defaults |
| IaC / deploy | Docker + Terraform; managed Postgres/Redis; container platform (ECS/Fly/K8s) | Managed data stores; avoid running a DB in V1 |
| CI/CD | GitHub Actions | Repo-native |
| Monorepo | pnpm workspaces + Turborepo | Shared packages, cached builds |
| Observability | OpenTelemetry → traces/metrics; pino JSON logs; Sentry; Grafana/Loki or hosted | Vendor-neutral instrumentation |

### 18.6 Repository layout

```text
quickpick/
├── apps/
│   ├── api/                  # NestJS (ROLE=api|worker)
│   ├── customer-mobile/      # React Native (Expo)
│   ├── shop-mobile/          # React Native (Expo)
│   └── admin-web/            # React + Vite
├── packages/
│   ├── shared/               # zod schemas, DTO types, enums, order state machine
│   ├── api-client/           # generated typed client (OpenAPI)
│   ├── ui/                   # shared RN/web primitives + tokens
│   └── config/               # eslint, tsconfig, jest presets
├── infra/                    # docker-compose (dev), terraform, k8s manifests
├── docs/                     # this document + ADRs + runbooks
└── .github/workflows/
```

**The order state machine lives in `packages/shared`** so client and server agree on
allowed transitions and labels — clients can render correct affordances without
duplicating rules, while the server remains the only authority that enforces them.

---

## 19. Order State Machine

```text
                    ┌──────────────── customer cancels ─────────┐
                    │                                           ▼
CART ──place──▶ ORDER_PLACED ──ingest──▶ RECEIVED ──accept──▶ ACCEPTED ──start──▶ PREPARING
                    │                       │                                        │
                    │                       └── reject ──▶ REJECTED                  │
                    └── timeout ──▶ EXPIRED                                          ▼
                                                                                 PACKING
                                                                                     │
                                                                                     ▼
   COMPLETED ◀─ settle ── HANDED_OVER ◀─ verify ── CUSTOMER_ARRIVED ◀─arrive─ READY_FOR_PICKUP
        │                                              ▲                             │
        └── (V2) refund path ─▶ REFUND_PENDING ─▶ REFUNDED                           │
                                                       └──── no-show timeout ────▶ EXPIRED
```

### 19.1 Transition table

| From | To | Actor | Guards | Effects |
|------|----|-------|--------|---------|
| CART | ORDER_PLACED | customer | branch open/accepting, items available, plan limit ok, idempotency key | create order+items snapshot, conversation, system msg, notify branch |
| ORDER_PLACED | RECEIVED | system | branch device/socket ack **or** push accepted | mark received, stop escalation |
| ORDER_PLACED/RECEIVED | ACCEPTED | shop (`order.accept`) | prep-time provided (1–240 min) | set `promised_ready_at`, reserve tracked inventory, notify customer with ETA |
| ORDER_PLACED/RECEIVED | REJECTED | shop (`order.reject`) | reason required | release nothing, notify customer, close conversation to system-only |
| ORDER_PLACED/RECEIVED | EXPIRED | system | no acceptance within `ORDER_ACCEPT_TIMEOUT` (default 10 min) | notify both, suggest alternatives |
| ORDER_PLACED…PACKING | CANCELLED | customer (`order.cancel`) | state ≤ PACKING; reason optional | release reservations, notify shop |
| any non-terminal | CANCELLED | admin (`order.force_cancel`) | reason + audit | release, notify both |
| ACCEPTED | PREPARING | shop | — | notify (low priority), system msg |
| PREPARING | PACKING | shop | — | open packing checklist |
| PACKING | PACKED | shop | every item `PACKED`/`SUBSTITUTED`/`UNAVAILABLE`; substitutions customer-approved; total recomputed | freeze final total, consume tracked inventory |
| PACKED | READY_FOR_PICKUP | shop | pickup code generated | **high-priority** notification, pickup instructions |
| READY_FOR_PICKUP | CUSTOMER_ARRIVED | customer or shop | — | surface at top of shop queue |
| READY/ARRIVED | HANDED_OVER | shop (`order.handover`) | pickup code/QR verified **or** manual override with reason | record pickup, payment `CAPTURED` for pay-at-store |
| HANDED_OVER | COMPLETED | system | payment recorded | release residual reservations, enable review, emit analytics |
| READY_FOR_PICKUP | EXPIRED | system | no-show past `PICKUP_EXPIRY` (default 24 h, configurable per branch) | notify, restock decision by shop |
| any | PAYMENT_FAILED / REFUND_* | payment module (V2) | webhook-driven | never mutates fulfilment state directly |

### 19.2 Enforcement rules

1. Transitions are executed **only** by `OrderStateMachine.apply(order, event, actor)`
   in a single transaction with `SELECT ... FOR UPDATE` on the order row; an illegal
   transition throws `409 InvalidTransition`.
2. Every transition writes `order_status_history(from, to, actor_id, actor_role,
   reason, metadata, created_at)` — no exceptions, no direct `UPDATE orders SET status`
   anywhere in the codebase (enforced by a repository-level guard + lint rule).
3. Notifications and system messages are **derived from the transition event**, so UI
   text, push, and chat can never disagree.
4. **Rollback:** business rollback is a *new forward transition* (e.g. `PACKED →
   PACKING` is allowed for correction and logged), never a history rewrite. Terminal
   states (`COMPLETED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `REFUNDED`) are immutable.
5. Payment state is orthogonal: fulfilment never blocks on payment in V1, and in V2 a
   payment failure emits an event that the order module *chooses* how to handle.

---

## 20. Preparation-Time & Delay Engine

Model on the order: `promised_ready_at`, `prep_minutes_initial`,
`prep_minutes_current`, plus a `order_prep_adjustment` ledger
(`delta_minutes`, `reason`, `actor`, `created_at`).

- Shop sets initial prep minutes at acceptance (chips: 5/10/15/30/45/60, or custom).
- A delay is an **append** (`+10 min`), never an overwrite → the customer sees an
  honest history and the platform can measure promise-keeping.
- Every adjustment emits `order.delayed` → notification + system message with old and
  new ETA.
- Metrics captured for later ML: `accepted_at`, `ready_at`, item count, distinct
  categories, concurrent active orders at acceptance, hour-of-week, staff on shift.

**V3 prediction:** a `PrepTimeEstimator` port with a `HeuristicEstimator` (per-branch
rolling median by item-count bucket and hour band) shipped first; an ML implementation
replaces it behind the same port. It only ever **suggests** a value the shop can
override — an autonomous wrong ETA destroys the core promise.

---

## 21. Real-Time Architecture

```text
client ──WSS(/rt, JWT in handshake)──▶ Socket.IO gateway (any API instance)
   rooms: user:<id>, conversation:<id>, branch:<id>, order:<id>
                    ▲
                    │ Redis adapter (pub/sub) fans out across instances
domain event → outbox → worker → publish → gateway emit to rooms
```

**Events (server → client):** `message.created`, `message.delivered`, `message.read`,
`typing.start/stop`, `presence.changed`, `order.created`, `order.received`,
`order.accepted`, `order.rejected`, `order.preparing`, `order.packing`,
`order.packed`, `order.delayed`, `order.ready`, `order.arrived`, `order.handed_over`,
`order.completed`, `order.cancelled`, `order.expired`, `inventory.changed`.

**Client → server:** `message.send` (with `client_message_id`), `message.read`,
`typing`, `subscribe` (authorised room join), `ack`.

Design rules:
1. **The socket is an accelerator, never the source of truth.** Every real-time payload
   is reproducible via REST; clients reconcile on reconnect with
   `GET /conversations/:id/messages?since=<cursor>` and `GET /orders?updatedSince=`.
   This is what makes flaky mobile networks survivable.
2. Room joins are authorised server-side against membership; a client cannot subscribe
   to another conversation.
3. At-least-once delivery + client dedupe by `message_id`/`event_id`.
4. Presence and typing live in Redis with short TTLs; they are explicitly lossy.
5. Sticky sessions are not required (Redis adapter), but WS connection limits per
   instance are monitored; the gateway is the **first** component extracted at scale.

---

## 22. File & Media Architecture

```text
client ──1. POST /files/upload-intent (mime, size, purpose)──▶ API
       ◀── pre-signed PUT URL + media_object(id, status=PENDING) ──
       ──2. PUT bytes ────────────────────────────────────────▶ Object storage
       ──3. POST /files/:id/complete ─────────────────────────▶ API → enqueue scan
                                                 worker: verify size/magic bytes,
                                                 AV scan, thumbnail, PDF page count
                                                 → status = SCAN_CLEAN | INFECTED
       ──4. GET /files/:id/url (authorised) ─────────────────▶ short-lived signed GET
```

Controls: allow-list of MIME types per purpose (`chat_image`, `chat_document`,
`product_image`, `business_document`, `avatar`); size caps (image 10 MB, PDF 25 MB);
magic-byte verification server-side (never trust the client `Content-Type`); EXIF/GPS
stripping on images; filenames sanitised and never used as storage keys (keys are
`<purpose>/<uuid>`); `Content-Disposition: attachment` + `X-Content-Type-Options` on
download; private bucket, no public ACLs; signed URL TTL 5 min; per-user upload rate
limits; delete = soft-delete metadata + storage lifecycle purge; retention policy per
purpose. **A file is never served to anyone until `SCAN_CLEAN`** — this is the print-shop
threat model (a stranger uploads a PDF that a shop opens on their phone).

**Print-shop flow reuses this:** upload in chat → page count extracted → shop sends a
`QUOTE` message (pages, copies, colour, price, prep minutes) → customer accepts →
order created with a **custom line item** referencing the media object. No separate
document-order subsystem.

---

## 23. Notification Architecture

```text
domain event → outbox → NotificationDispatcher
   → resolve recipients + template + locale
   → apply preferences, quiet hours, category opt-outs
   → dedupe key = hash(event_id, user_id, channel)
   → per-channel adapters: InApp | Push(FCM) | SMS | Email
   → notification_delivery(status, provider_id, attempts, error) with backoff retry
```

- **Priority classes:** `CRITICAL` (new order for shop, order ready for customer) →
  push with high priority, escalation (repeat push at 60 s/180 s until acknowledged,
  then SMS to the owner); `NORMAL` (accepted, preparing, delayed); `LOW`
  (marketing — opt-in only, never in the order path).
- **Preferences** cannot disable `CRITICAL` transactional notifications for shops
  (operational requirement, disclosed at onboarding).
- Push token lifecycle: registered per device, invalidated on FCM `NotRegistered`,
  cleaned by a scheduled job.
- In-app notification is written **first** (durable), then external channels are
  attempted — so a failed push never means a lost notification.

---

## 24. Security Architecture

### 24.1 Controls

| Layer | Controls |
|-------|----------|
| Transport | TLS 1.2+ everywhere, HSTS, no plaintext ports; certificate management at the LB |
| AuthN | Argon2id passwords (unique salt, tuned cost); OTP = 6 digits, HMAC-hashed at rest, 5 min TTL, max 5 attempts, per-phone + per-IP throttle; RS256 JWT access token (15 min) with `kid` rotation; refresh token (30 d) stored **hashed**, single-use, rotated, family-revoked on reuse detection |
| Sessions | Device registry, list/revoke sessions, logout-all, revoke on password change, absolute session lifetime |
| AuthZ | Permission-based RBAC: `role → permissions[]`, guards check `permissions` and a **resource scope** (`business_id`/`branch_id`) resolved from the resource, not the request body. Ownership checks on every order/conversation/file access. No `if (role === 'OWNER')` in handlers |
| Input | Schema validation (zod/class-validator) on every endpoint and socket event; strict types; reject unknown fields; canonical output DTOs (never return raw entities) |
| Injection | Parameterised queries only (Prisma/`$queryRaw` with bindings); no string-built SQL; ORM-level identifier allow-lists for sort/filter params |
| XSS / content | API is JSON-only; clients render text as text; markdown/HTML in user content is escaped; admin web has a strict CSP |
| CSRF | Bearer tokens in memory (not cookies) for mobile; admin web uses `SameSite=Strict` refresh cookie + CSRF token double-submit on refresh endpoint only |
| Rate limiting | Global per-IP, per-user, and per-endpoint classes (auth, OTP, upload, order-create, message-send) via Redis token bucket; exponential lockout on auth failures |
| Idempotency | `Idempotency-Key` required on order create, payment intent, and any external-effect POST; stored request hash + response for 24 h |
| Files | §22 controls (AV scan, magic bytes, signed URLs, private bucket) |
| Secrets | Managed secret store (SSM/Vault), injected as env at runtime; nothing in git; `.env.example` only; rotation runbook; CI secret scanning + pre-commit gitleaks |
| Data | Encryption at rest (managed DB + bucket SSE); column-level encryption for business KYC documents; PII access by admins is permission-gated and audited |
| Audit | Append-only `audit_log` for privileged/state-changing actions, with actor, IP, user agent, before/after diff for admin edits |
| Abuse | Order-spam limits per customer, no-show tracking, message flood limits, duplicate-account signals, review anti-abuse (V2) |
| Dependencies | Lockfiles, Dependabot, `npm audit` in CI, prefer packages published ≥7 days |
| Ops | Least-privilege IAM, private subnets for DB/Redis, bastion-less access via SSM, WAF at the edge, no SSH keys on app hosts |

### 24.2 Threat model (STRIDE-style highlights)

| Asset / surface | Threat | Mitigation |
|---|---|---|
| Customer account | OTP brute force / SIM-swap takeover | Attempt caps, per-phone throttle, device binding, re-verify on sensitive change, notify on new device |
| Shop account | Credential stuffing → fake order manipulation | Argon2id, breach-password check, MFA for owners (V2), session listing, lockout |
| Order | Tampering with price/total by client | Server-side snapshot + recompute; client totals are display-only |
| Order | Replay/duplicate placement | Idempotency keys, unique constraint on `(cart_id)` conversion |
| Inventory | Two customers ordering the last item | Row-level lock + conditional decrement; reservation with expiry; explicit `unavailable` path in packing |
| Chat | IDOR reading another user's conversation | Membership check on every read/join; opaque UUIDs |
| Files | Malicious PDF delivered to a shop device | AV scan before availability, MIME/magic validation, signed short-lived URLs, no public bucket |
| Files | Unauthorised download of someone's document | Authorised URL issuance only; TTL 5 min; access audited |
| Location data | Tracking/stalking risk via customer coordinates | Store what's needed, coarse precision where sufficient, never expose customer coordinates to shops (only address text on demand for pickup identification) |
| Admin | Privilege abuse / mass data export | Permission granularity, audited exports, no silent impersonation, 4-eyes on suspend/delete (V2) |
| Payments (V2) | Webhook forgery, double capture | Signature verification, idempotent handlers, ledger reconciliation |
| Platform | DoS via expensive geo/search queries | Radius and page-size caps, query timeouts, caching, per-IP limits, WAF |
| Real-time | Socket flood, unauthorised room join | Handshake auth, join authorisation, per-connection event budgets |

**Note:** applicable data-protection law (e.g. India's DPDP Act, GDPR if EU users) is
implemented as controls here, but **legal review is required** before launch —
particularly for pharmacy/prescription data, which is why pharmacies are gated behind
a legal review milestone rather than launched blind.

---

## 25. Scalability Strategy

### 25.1 Load model

| Stage | MAU | Businesses | Orders/day | Peak orders/s | Msgs/day |
|-------|-----|-----------|-----------|---------------|----------|
| S1 MVP | 10k | 200 | 1k | 5 | 20k |
| S2 | 100k | 10k | 20k | 40 | 400k |
| S3 | 1M | 100k | 250k | 400 | 5M |
| S4 | 10M | 1M | 3M | 3,000 | 60M |

### 25.2 Evolution ladder (what to add, and the trigger)

| Change | Trigger |
|--------|---------|
| Vertical scale DB, add read replica, PgBouncer | primary CPU > 60% sustained, or replica-safe read share > 40% |
| Horizontal API pods + autoscaling | p95 latency drift at > 60% CPU |
| Redis caching for discovery/catalog | repeated identical geo/catalog queries > 30% of reads |
| Extract **WebSocket gateway** service | connection count > ~20k/instance or WS load distorting API latency |
| Partition `messages` and `notifications` by month | table > 100 M rows or vacuum/index pain |
| Introduce Kafka/NATS as the event backbone | > 2 consumer groups needing replay, or outbox pump lag > 5 s |
| Extract **Notification** service | notification volume > 1 M/day or provider fan-out complexity |
| OpenSearch for search | catalog > 5 M SKUs or ranking needs beyond FTS |
| Extract **Chat** service (own store) | message write volume dominating DB IOPS |
| Read models / CQRS for analytics | analytics queries impacting OLTP; move to warehouse + dbt |
| Shard/partition by city or business | single primary write ceiling (~S4); city is the natural shard key since orders never cross cities |
| Multi-region | latency SLOs in a second geography or DR requirement |

**Guiding rule:** every item above is *unlocked by an existing seam* (module boundary,
outbox `publish()`, provider port). Nothing on this ladder requires re-modelling the
domain — that is the entire point of doing §16 carefully now.

### 25.3 Cost/complexity guardrail

MVP infrastructure is intentionally: 2 API containers, 1 worker, managed Postgres,
managed Redis, a bucket, a CDN. Anything beyond that must be justified by a trigger in
the table above, in writing, in an ADR.

---

## 26. Architectural Decision Records (summary)

| # | Decision | Alternatives | Why | Future impact |
|---|----------|--------------|-----|---------------|
| ADR-01 | Modular monolith, NestJS | Microservices now; bare Express | Boundaries without distributed-systems tax; one team, one deploy | Modules extract along existing interfaces |
| ADR-02 | PostgreSQL + PostGIS as single store | Mongo; Postgres + Elastic + geo store | Relational+geo+FTS in one engine; transactions where correctness matters | Add OpenSearch/partitioning by trigger |
| ADR-03 | Transactional outbox for side effects | Direct calls in request; dual writes | Kills lost/ghost notifications; at-least-once + dedupe | Kafka replaces the pump, handlers unchanged |
| ADR-04 | Explicit order state machine in shared package | Free-form status field | Prevents illegal states; client/server agree on affordances | New states are additive with guards |
| ADR-05 | `branch_product` availability, not product-level | Availability on product | Multi-branch is a launch-adjacent requirement | Multi-branch/franchise needs no rewrite |
| ADR-06 | Three inventory modes (availability / threshold / tracked) | Mandatory quantity tracking | Small shops won't maintain counts; stale data destroys trust | Forecasting reads the same ledger |
| ADR-07 | Pay-at-store in V1 behind a payment abstraction | Online payments in V1 | Removes payment failure from the core loop; no PCI scope | Providers added as adapters; order logic untouched |
| ADR-08 | Order ⇄ conversation are one integrated experience | Separate chat feature | Chat is where trust and quoting happen; system messages come from order events | Delivery/AI agents join the same thread |
| ADR-09 | Socket.IO + Redis adapter; REST is the source of truth | Raw WS; long polling; SSE | Rooms/reconnect/scale-out for free; reconciliation keeps mobile honest | Gateway extracts first |
| ADR-10 | Direct-to-storage uploads with mandatory AV scan | Upload through API; serve public URLs | Keeps API light; strangers' files reach shop devices | Video/audio reuse the pipeline |
| ADR-11 | Permission-based RBAC with resource scoping | Role checks in handlers | New roles/plans need no handler edits | Delivery partner + admin sub-roles drop in |
| ADR-12 | React Native (2 apps) + React admin, shared TS packages | Flutter; single app with role switch; native | Shared contracts and design system; distinct operational UX per audience | Web customer app can reuse shared packages |
| ADR-13 | Freemium first, monetisation isolated in a Billing/Plan module | Commission from day one | Commission is unenforceable with pay-at-store and hides orders | Pricing experiments never touch the domain |
| ADR-14 | Prisma + raw SQL escape hatch | TypeORM; Knex; raw only | Type-safety + migrations, with SQL where it matters | Repository layer isolates a future swap |
| ADR-15 | Idempotency keys on all external-effect writes | Client-side dedupe | Mobile retries are guaranteed to happen | Prereq for payments and delivery |
| ADR-16 | Single `user` + `user_credential` + scoped `user_role` | Separate customer/shop/admin user tables | One human, many hats; OAuth becomes a row | Delivery partner = new type + role |

Each ADR gets its own file under `docs/adr/` as it is implemented, in the standard
*context / decision / consequences* format.

---

## 27. Future Upgrade Strategy (monolith → services)

Extraction order and the seam each one uses:

1. **WebSocket gateway** — already a separate transport concern; consumes Redis pub/sub.
2. **Notification service** — already event-driven; owns templates + delivery log.
3. **Media service** — already stateless around storage + scan queue.
4. **Search service** — read-only projection; can rebuild from Postgres.
5. **Chat service** — owns `conversations`/`messages`; the hardest one, hence last of
   the "easy" set; requires an API for order system-messages.
6. **Ordering/Inventory stay together** in the core for as long as possible — they
   share transactional invariants, and splitting them buys distributed transactions
   nobody wants.

Mechanics: introduce the event backbone → move the module behind an HTTP/gRPC client
implementing the *existing* interface → dual-write/dual-read behind a flag → cut over →
delete the in-process module. Database split follows the code split (schema-per-module
first, then separate cluster), never the reverse.

---

Continue to [Part 3 — Database](./03-database.md), [Part 4 — API](./04-api.md),
[Part 5 — Testing, DevOps, Risks](./05-testing-devops-risks.md).
