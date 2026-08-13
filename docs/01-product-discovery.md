# QuickPick — Product Discovery

> Part 1 of the Product Discovery & Architecture Document.
> Covers: vision, problem, users, personas, value proposition, use cases,
> functional/non-functional requirements, journeys, feature hierarchy, MVP scope,
> roadmap, business model.

---

## 1. Refined Product Vision

**Product promise:** *Order before you arrive. Pick up when it's ready.*

QuickPick is a **local commerce operating platform**. Phase one sells one concrete
outcome to two sides of a transaction:

- **Customer:** never stand in a shop queue again. The trip to the shop happens
  *after* the order is packed, not before.
- **Shop:** convert idle counter time into pre-batched work, with a written record
  of what the customer wants, so the counter is not the bottleneck.

**What QuickPick is not (deliberately, for V1):**

- Not a delivery marketplace. No fleet, no rider economics, no 10-minute promise.
- Not a generic e-commerce catalog aggregator. Inventory truth stays with the shop.
- Not a payments company. V1 is *pay at store*.

**WHY this framing:** the defensible wedge is *waiting-time removal*, which requires
only two things a local shop already has (products and a person who packs them) and
one thing it lacks (a structured, real-time channel to the customer). Delivery,
payments, and catalog breadth are all *additive* later and each one, if pulled into
V1, multiplies operational surface area (fleet ops, PCI scope, catalog data quality)
before the core loop is proven.

**Long-term vision:** the domain is deliberately
`Business → Branch → Catalog → Inventory → Customer → Order → Conversation → Pickup`,
never `Grocery → Item → Basket`. This lets the same platform serve pharmacies,
print shops, bakeries, hardware stores, and repair shops, and lets a fourth
application (delivery partner) attach to the existing `Order` and `Pickup`
aggregates without a schema rewrite.

---

## 2. Problem Statement

**Core problem:** in local retail, the customer's time and the shopkeeper's time are
consumed *simultaneously and serially* at the counter.

Decomposed:

| # | Problem | Who suffers | Cost today |
|---|---------|-------------|-----------|
| P1 | Customer travels before knowing availability | Customer | Wasted trip |
| P2 | Customer must verbally enumerate items at counter | Both | 3–10 min per order |
| P3 | Shopkeeper serves one customer at a time | Both | Queue forms |
| P4 | No visibility into wait time | Customer | Uncertainty, abandonment |
| P5 | Item unavailability discovered at the counter | Both | Trip wasted / substitution friction |
| P6 | Document businesses (print/xerox) need file transfer | Both | WhatsApp/USB workarounds |
| P7 | No structured customer↔shop channel | Both | Phone calls, no record, disputes |
| P8 | Shop cannot batch or plan work | Shop | Under-utilised staff off-peak, overload at peak |

**Problems explicitly out of scope for V1:** last-mile logistics, credit/khata
ledgers, POS replacement, GST/accounting compliance.

**Success statement:** a customer's in-shop time drops from *"arrive → search →
queue → wait → pay → leave"* to *"arrive → verify → pay → leave"*, and the shop's
per-order counter time drops because picking happened before arrival.

---

## 3. Target Users

**Geography strategy:** launch **one city, 2–3 dense neighbourhoods**. Local
commerce is a *density* business: a customer only cares that *their* three shops are
on the platform. City-wide or multi-city launch dilutes density and kills retention.

### Demand side (customers)

- Urban/semi-urban smartphone users, 18–45.
- High-frequency local buyers: weekly grocery/general-store runs.
- Time-poor segments: working professionals, students, parents.
- Document-need segment: students and small offices using print/xerox shops.

### Supply side (businesses)

- Single-branch owner-operated shops (1–5 staff) — the **beachhead**.
- Small local chains (2–10 branches) — the **expansion** segment; they drive the
  multi-branch, staff-role, and analytics requirements.
- Category priority for launch: **general/grocery stores** (frequency) +
  **print/xerox** (highest pain, simplest inventory) + **pharmacies** (high
  availability anxiety, but needs prescription handling — see risks).

### Internal

- Platform operations, support, finance, and moderation staff (Super Admin app).

---

## 4. User Personas

### 4.1 Ravi — Working Professional (Customer)
- 31, software engineer, orders from a general store 2× per week.
- **Job:** "restock the house without losing 40 minutes."
- **Pain:** evening queue at 7 pm; frequently a brand is out of stock.
- **Needs:** reliable availability, an accurate ETA, one-tap repeat of last order.
- **Kills adoption if:** ETA is wrong twice, or the shop ignores the order.

### 4.2 Priya — Student (Customer, document orders)
- 20, needs 5 B&W copies of an assignment printed before a 9 am class.
- **Job:** "get a file to the shop and know the price before I walk over."
- **Needs:** upload PDF in chat, confirm copies/colour, get a quoted price.
- **Kills adoption if:** file upload fails on a weak connection.

### 4.3 Suresh — Shop Owner (single branch)
- 44, owns a general store, runs the counter himself, moderate digital literacy.
- **Job:** "more orders without more chaos."
- **Pain:** cannot look at a screen mid-rush; typing is slow.
- **Needs:** loud alert on new order, 2-tap accept + ETA, a packing checklist he can
  tick while walking the aisles, offline-tolerant behaviour.
- **Kills adoption if:** the app demands data entry he cannot sustain (this is why
  **catalog onboarding is a product problem, not a support problem** — see risks).

### 4.4 Anita — Branch Manager (small chain)
- 35, manages 3 branches, needs per-branch inventory and staff accountability.
- **Needs:** role-scoped staff logins, per-branch order queues, prep-time and
  cancellation analytics.

### 4.5 Karthik — Packer (staff)
- 22, only touches orders and packing.
- **Needs:** a single screen: queue → checklist → mark ready. Nothing else visible.

### 4.6 Meera — Platform Operations Admin
- **Needs:** verify/approve businesses, monitor stuck orders, resolve complaints,
  full audit trail, and impersonation-free debugging tools.

---

## 5. Value Proposition

**Customer:** *Skip the queue. Know before you go.*
- Zero wasted trips (availability is checked before travel).
- A written, timestamped record of the order and the conversation.
- Cost: nothing. No delivery fee, no minimum order — the customer still walks over.

**Shop:** *Serve more customers with the same counter.*
- Orders arrive structured and pre-read; picking is batched.
- Chat replaces phone calls and creates a dispute record.
- Prep-time control means the shop sets expectations, not the customer.
- Cost: near-zero to start (freemium) — see business model.

**Platform:** owns the *pre-arrival intent* layer of local retail — the highest-value
data in local commerce (who wants what, where, when) — without owning inventory,
logistics, or payment risk.

**Why a customer chooses QuickPick over WhatsApp (the real competitor):**
structured catalog + availability, an enforced state machine with ETAs and
notifications, order history/repeat, and a shop-side packing workflow. WhatsApp has
distribution but no state, no catalog, and no accountability.

---

## 6. Core Use Cases

| ID | Use case | Actor | Priority |
|----|----------|-------|----------|
| UC-01 | Register/login with phone + OTP | Customer | MUST |
| UC-02 | Set location (GPS / search / map / saved) | Customer | MUST |
| UC-03 | Discover nearby open businesses, ranked | Customer | MUST |
| UC-04 | Search businesses and products | Customer | MUST |
| UC-05 | Browse categories and products with availability | Customer | MUST |
| UC-06 | Build a cart scoped to one branch | Customer | MUST |
| UC-07 | Place a pre-order (idempotent) | Customer | MUST |
| UC-08 | Chat with the shop on the order thread, send files | Both | MUST |
| UC-09 | Receive ETA, delay, and ready notifications | Customer | MUST |
| UC-10 | Cancel order (within allowed states) | Customer | MUST |
| UC-11 | Register a business and get verified/approved | Shop | MUST |
| UC-12 | Manage catalog + per-branch availability | Shop | MUST |
| UC-13 | Accept/reject an order and set prep time | Shop | MUST |
| UC-14 | Work a packing checklist and mark ready | Shop | MUST |
| UC-15 | Verify customer at pickup and hand over | Shop | MUST |
| UC-16 | Quote a document order (price + prep time) in chat | Shop | MUST |
| UC-17 | Approve/suspend businesses, monitor orders | Admin | MUST |
| UC-18 | Rate and review a completed order | Customer | SHOULD (V2) |
| UC-19 | QR/OTP pickup verification | Both | SHOULD (V2) |
| UC-20 | Staff accounts with role-scoped permissions | Shop | SHOULD (V2) |
| UC-21 | Online payment + refunds | Customer | COULD (V2/V3) |
| UC-22 | Digital queue position | Customer | FUTURE (V3) |
| UC-23 | AI prep-time prediction / assistant | Both | FUTURE (V4) |
| UC-24 | Delivery partner assignment and tracking | New actor | FUTURE (V3) |

---

## 7. Functional Requirements

Numbered by module. `[V1]` = MVP, `[V2]`/`[V3]`/`[V4]` = later.

### FR-A Authentication & Identity
- FR-A1 `[V1]` Phone + OTP registration/login for customers; email + password for
  shop and admin users.
- FR-A2 `[V1]` Access token (short-lived JWT) + refresh token with **rotation and
  reuse detection**.
- FR-A3 `[V1]` Logout (single device) and logout-all (revoke session family).
- FR-A4 `[V1]` Password reset via verified email; OTP rate limiting and lockout.
- FR-A5 `[V1]` Session/device registry: device id, platform, last seen, push token.
- FR-A6 `[V2]` MFA (TOTP) for admin and business owner accounts.
- FR-A7 `[V3]` Social/OAuth login. Architecture must not assume a single credential
  type (see identity model in Part 2).

### FR-B Users, Profile, Addresses
- FR-B1 `[V1]` Customer profile: name, phone, email, avatar.
- FR-B2 `[V1]` Multiple saved addresses/locations with labels and coordinates.
- FR-B3 `[V1]` Notification preferences per channel and per event category.
- FR-B4 `[V2]` Account deletion request + data export (privacy obligations).

### FR-C Business & Branch Management
- FR-C1 `[V1]` Business registration with documents; states
  `DRAFT → PENDING_VERIFICATION → APPROVED → SUSPENDED/REJECTED`.
- FR-C2 `[V1]` Branch: address, geo point, business hours, holidays, pickup
  instructions, contact, open/closed override.
- FR-C3 `[V1]` One business → many branches; every operational entity
  (inventory, orders, staff) is **branch-scoped**.
- FR-C4 `[V2]` Staff invitation, roles (`OWNER/MANAGER/PACKER/CASHIER/STAFF`) and
  per-branch scoping.
- FR-C5 `[V1]` Business categories (grocery, pharmacy, print, …) managed by admin.

### FR-D Catalog
- FR-D1 `[V1]` Platform-level `product_categories` tree (admin-curated) +
  business-level custom categories.
- FR-D2 `[V1]` Products owned by a **business**, exposed per **branch** via
  `branch_products` (branch price override + availability).
- FR-D3 `[V1]` Product fields: name, description, images, unit, brand, SKU, MRP,
  price, tax rate, discount, active flag.
- FR-D4 `[V2]` Variants (size/colour/weight) as first-class sellable units.
- FR-D5 `[V1]` Catalog onboarding accelerators: CSV import + copy-from-master-catalog
  (a curated FMCG catalog seeded by the platform). **This is a MUST for supply-side
  activation, not a nice-to-have.**
- FR-D6 `[V1]` Non-catalog / custom line items (required by print shops and by
  "shopkeeper adds an item during chat").

### FR-E Inventory
- FR-E1 `[V1]` Per-branch availability model with three levels of rigour, chosen by
  the shop: `AVAILABILITY_ONLY` (in/out toggle), `LOW_STOCK_THRESHOLD`,
  `TRACKED_QUANTITY`. **WHY:** most small shops will never maintain true stock
  counts; forcing quantity tracking guarantees stale data and lost trust.
- FR-E2 `[V1]` Inventory transactions ledger (append-only) for every change with
  reason: `MANUAL_ADJUST`, `RESERVE`, `RELEASE`, `CONSUME`, `IMPORT`.
- FR-E3 `[V1]` Soft reservation on order acceptance for `TRACKED_QUANTITY` items,
  with expiry.
- FR-E4 `[V2]` Low-stock alerts; inventory history views.
- FR-E5 `[V3]` Forecasting and reorder suggestions (reads the ledger; no schema
  change required).

### FR-F Location & Discovery
- FR-F1 `[V1]` Resolve current location (GPS), reverse-geocode to a display address.
- FR-F2 `[V1]` Location search (geocoding provider) and map pin selection.
- FR-F3 `[V1]` Nearby branches within radius using PostGIS, filtered by
  `APPROVED` + open/closed + business category.
- FR-F4 `[V1]` Ranking: open-now, distance, then rating/reliability score.
- FR-F5 `[V1]` Full-text search over businesses and products (PostgreSQL FTS +
  trigram for typo tolerance).
- FR-F6 `[V3]` Service areas, geofencing, delivery zones.

### FR-G Cart
- FR-G1 `[V1]` One **active cart per (customer, branch)**; multiple parallel carts
  across branches are allowed but an order is always single-branch.
- FR-G2 `[V1]` Add/remove/update quantity; server-side price and availability
  re-validation on every mutation and again at checkout.
- FR-G3 `[V1]` Price snapshotting: cart items store the price seen by the customer;
  a change is surfaced as an explicit diff to accept.
- FR-G4 `[V1]` Cart expiry (configurable, default 24 h) via a scheduled job.

### FR-H Orders
- FR-H1 `[V1]` Place order with an **idempotency key**; server returns the same
  order for a repeated key.
- FR-H2 `[V1]` Formal state machine (Part 2 §11) with guarded transitions, actor
  authorisation, and a full `order_status_history` audit.
- FR-H3 `[V1]` Prep-time set on acceptance; delay events add time and notify.
- FR-H4 `[V1]` Packing checklist per order item (`packed`, `substituted`,
  `unavailable`) with customer confirmation for substitutions.
- FR-H5 `[V1]` Cancellation rules: customer may cancel until `PACKING`; shop may
  reject until `ACCEPTED`; admin may force-cancel any state with a reason.
- FR-H6 `[V1]` Auto-expiry: no shop response within N minutes → `EXPIRED` + notify.
- FR-H7 `[V1]` Order history, order detail, repeat order.
- FR-H8 `[V1]` Pickup verification by order code (6-char) in V1; QR/OTP in V2.

### FR-I Conversations (chat)
- FR-I1 `[V1]` Every order auto-creates a conversation with the customer and the
  branch as members; a branch-level (non-order) conversation is also supported.
- FR-I2 `[V1]` Message types: `TEXT`, `IMAGE`, `FILE`, `SYSTEM`, `PRODUCT_REF`,
  `ORDER_REF`, `QUOTE`.
- FR-I3 `[V1]` Client-generated message id for idempotent send + optimistic UI;
  states `SENDING → SENT → DELIVERED → READ`.
- FR-I4 `[V1]` Typing indicator, presence, unread counts, per-conversation read
  cursors.
- FR-I5 `[V1]` System messages emitted by order state transitions (single source of
  truth: the order event, not the UI).
- FR-I6 `[V2]` Replies, edit/delete windows, reactions.
- FR-I7 `[V4]` Voice notes, calls, AI assistant participation.

### FR-J Files & Media
- FR-J1 `[V1]` Direct-to-object-storage upload via pre-signed URL; server only
  issues and confirms.
- FR-J2 `[V1]` MIME + extension + magic-byte validation, size caps per type,
  per-user upload rate limits.
- FR-J3 `[V1]` Access exclusively through short-lived signed download URLs
  authorised by conversation/order membership.
- FR-J4 `[V1]` Async post-processing pipeline: virus scan, image transcode/thumbnail,
  PDF page count (needed for print quoting). File is `QUARANTINED` until scanned.
- FR-J5 `[V2]` Retention policy + hard delete; `[V3]` video/audio.

### FR-K Notifications
- FR-K1 `[V1]` Channels: in-app, push (FCM). `[V2]` SMS (OTP uses SMS from V1),
  email (transactional from V1).
- FR-K2 `[V1]` Template + event catalogue; every order event maps to zero or more
  notifications.
- FR-K3 `[V1]` Per-user, per-category preferences and quiet hours.
- FR-K4 `[V1]` Delivery log with provider ids and status; retry with backoff;
  dedupe key so a retried event never double-notifies.

### FR-L Payments
- FR-L1 `[V1]` `PAY_AT_STORE` only; a `payments` record still exists so the order
  never learns about payment specifics.
- FR-L2 `[V2]` Provider abstraction (UPI/cards/wallet), webhook ingestion,
  idempotent state machine, refunds.
- FR-L3 `[V2]` Commission/settlement ledger.

### FR-M Reviews
- FR-M1 `[V2]` Post-completion rating (overall + availability + speed) and text.
- FR-M2 `[V2]` Anti-abuse: only the ordering customer, one review per order, edit
  window, rate limits, moderation queue, shop right-of-reply.

### FR-N Admin
- FR-N1 `[V1]` Dashboard: users, businesses, orders, funnel, stuck orders.
- FR-N2 `[V1]` Business verification/approval/suspension with reason + audit.
- FR-N3 `[V1]` User and business management, order monitoring, force-cancel.
- FR-N4 `[V1]` Category management, platform configuration (feature flags, limits).
- FR-N5 `[V1]` Audit log browser; `[V2]` complaints, reports, finance views.
- FR-N6 `[V1]` Permission-based RBAC (no hard-coded role checks in handlers).

---

## 8. Non-Functional Requirements

| ID | Requirement | Target (V1) | Notes |
|----|-------------|-------------|-------|
| NFR-1 | API latency | p95 < 300 ms, p99 < 800 ms (reads) | excluding third-party calls |
| NFR-2 | Nearby search latency | p95 < 400 ms at 100k branches | PostGIS + GIST index |
| NFR-3 | Real-time delivery | p95 < 1 s message fan-out | Socket.IO + Redis adapter |
| NFR-4 | Availability | 99.5% V1 → 99.9% at scale | single region V1 |
| NFR-5 | Durability | RPO ≤ 5 min, RTO ≤ 1 h | PITR backups |
| NFR-6 | Order correctness | zero lost/duplicate orders | idempotency + transactions |
| NFR-7 | Notification reliability | ≥ 99% of order events notified ≤ 30 s | at-least-once + dedupe |
| NFR-8 | Scale headroom V1 | 50k MAU, 2k businesses, 20 orders/s peak | one app tier + one primary DB |
| NFR-9 | Security | OWASP ASVS L2 targets, no secrets in code | see Part 2 §24 |
| NFR-10 | Privacy | data minimisation, retention policy, export/delete | legal review required |
| NFR-11 | Observability | structured logs, RED metrics, traces on every request | correlation id end-to-end |
| NFR-12 | Accessibility | WCAG 2.1 AA for admin web; large touch targets on mobile | |
| NFR-13 | Offline tolerance | client queues writes; all mutations idempotent | shop app must survive 30 s dropouts |
| NFR-14 | i18n | English + one regional language at launch; no hard-coded strings | |
| NFR-15 | Maintainability | ≥ 70% unit coverage on domain modules, 100% on order state machine | CI-enforced |
| NFR-16 | Deployability | trunk-based, < 15 min pipeline, zero-downtime deploy | |

---

## 9. Customer Journey (annotated)

| Step | UX requirement | Backend | Failure / edge case |
|------|----------------|---------|---------------------|
| Open app | Skeleton, no blocking splash | `GET /config` (feature flags) | Offline → cached config |
| Register/login | Phone → OTP, autofill, resend timer | OTP issue/verify, rate limit, lockout | SMS not delivered → resend + fallback channel |
| Select location | GPS permission rationale before prompt | reverse geocode | Permission denied → manual search/map |
| Discover | Cards: open/closed, distance, ETA band | PostGIS radius query | No shops nearby → "notify me when we launch here" capture |
| Search | Debounced, typo-tolerant | FTS + trigram | Zero results → category suggestions |
| Open business | Hours, pickup instructions, closed banner | branch detail + availability summary | Branch closed → allow scheduled order (V2), else block |
| Browse products | Out-of-stock greyed, not hidden | branch catalog, paginated | Stale availability → revalidate in cart |
| Add to cart | Optimistic, per-branch cart | cart mutation revalidates price/stock | Item went out of stock → inline notice, suggest alternative |
| Review cart | Item-level price diff shown | checkout preflight | Price changed → explicit accept |
| Place order | One tap, disabled after tap, idempotency key | order create txn + conversation + events | Duplicate submit → same order returned |
| Conversation created | Order thread opens with system message | event → system message | — |
| Shop accepts/rejects | Push + in-app + thread message | state transition guard | No response in N min → `EXPIRED` |
| ETA received | Countdown + absolute time | prep-time event | Delay → new ETA + notification |
| Preparing / packing | Progress states, item-level checklist visible | status history | Item unavailable → substitution approval flow |
| Ready for pickup | High-priority push, pickup code + instructions | ready event | Push fails → in-app + SMS fallback |
| Travel & arrive | "I've arrived" button | `CUSTOMER_ARRIVED` | Customer never arrives → no-show timer, reminder, then `EXPIRED` |
| Verification | Show code/QR | verify + hand over | Code mismatch → staff fallback with reason logged |
| Completed | Receipt summary | `COMPLETED`, release reservations | — |
| Review | 2-tap rating, optional text | review create (V2) | Skipped → no nagging |

## 10. Shop-Owner Journey (annotated)

| Step | UX requirement | Backend | Edge case |
|------|----------------|---------|-----------|
| Register | Minimal form; documents later | business `DRAFT` | Abandoned → nurture reminders |
| Verification | Clear checklist and status | doc upload, `PENDING_VERIFICATION` | Rejected → reason + resubmit |
| Admin approval | SLA visible to shop | admin action + audit | Approval backlog → ops metric |
| Create branch | Map pin drag, hours editor | branch + geo point | Wrong pin → discovery breaks; require pin confirmation |
| Catalog build | **Master-catalog search + CSV import + camera-first product add** | catalog write, import job | Manual entry fatigue → the #1 churn driver |
| Configure availability | Choose tracking mode; bulk in/out toggle | inventory config | Stale stock → nudge to review daily |
| Receive order | **Persistent loud alert until acknowledged** | push (high priority) + socket | App backgrounded/killed → push wakes; SMS fallback for owner |
| Review / accept / reject | 2 taps + prep-time chips (5/10/15/30 min) | guarded transition | Accidental reject → short undo window |
| Prepare | Order queue sorted by promised-ready time | — | Overload → suggest larger ETA |
| Packing checklist | Big rows, tick while walking | item packing state | Item missing → substitute/remove flow notifies customer |
| Mark ready | Single primary action | `READY_FOR_PICKUP` + notify | Notification failure → visible retry |
| Customer arrives | Arrival list at top | `CUSTOMER_ARRIVED` | Arrives early → "not ready yet" screen with ETA |
| Verify & hand over | Enter/scan code | verify + `HANDED_OVER` | Wrong customer → mismatch logged |
| Complete | Auto after hand-over + payment recorded | `COMPLETED` | Payment dispute → complaint flow |

## 11. Admin Journey (annotated)

1. **Login** (email + password, MFA in V2, IP-aware session logging).
2. **Dashboard** — platform KPIs and an *operational* panel first: stuck orders,
   unacknowledged orders, failed notifications, verification backlog.
3. **Verification queue** — inspect documents, approve/reject with reason.
4. **Business management** — suspend, edit, re-verify, view branch health.
5. **User management** — search, block, reset, view sessions/devices.
6. **Order monitoring** — filter by state/age, view full history and conversation
   metadata (message *content* access is permission-gated and audited).
7. **Catalog governance** — product category tree, master catalog curation.
8. **Complaints & moderation** (V2) — reviews, abusive content, refunds.
9. **Finance** (V2) — commissions, settlements, payment failures.
10. **Configuration** — feature flags, limits, cities, launch toggles.
11. **Audit logs** — every privileged action, immutable, exportable.

**Principle:** admins get **no silent impersonation**. Any "act as user" capability is
explicit, time-boxed, consented where legally required, and audited.

---

## 12. Complete Feature Hierarchy

```text
QuickPick Platform
├── Identity & Access
│   ├── Registration (phone/OTP, email/password)
│   ├── Login, logout, logout-all
│   ├── Token issuance + refresh rotation
│   ├── Sessions & devices
│   ├── Password reset, OTP throttling, lockout
│   ├── RBAC (roles → permissions)
│   └── MFA (V2), OAuth (V3)
├── Customer
│   ├── Profile, avatar, preferences
│   ├── Addresses & saved locations
│   ├── Location engine (GPS, search, map)
│   ├── Discovery (nearby, filters, ranking, search)
│   ├── Catalog browse (categories, product detail, availability)
│   ├── Cart (per branch, validation, expiry)
│   ├── Checkout & order placement (idempotent)
│   ├── Order tracking (states, ETA, delay, ready)
│   ├── Conversations (text, images, files, quotes)
│   ├── Pickup (code → QR/OTP in V2)
│   ├── Order history & repeat
│   ├── Notifications & preferences
│   └── Reviews (V2), favourites (V2), coupons (V2)
├── Business
│   ├── Registration & verification
│   ├── Business profile, media, hours, holidays
│   ├── Branches (geo, pickup instructions, open/closed)
│   ├── Staff & roles (V2)
│   ├── Catalog (categories, products, variants V2, import)
│   ├── Inventory (modes, adjustments, ledger, alerts V2)
│   ├── Order queue (accept/reject, prep time, delay)
│   ├── Packing checklist & substitutions
│   ├── Ready / hand-over / completion
│   ├── Conversations & quoting (documents)
│   ├── Dashboard & analytics (V2 advanced)
│   └── Settings & notification preferences
├── Platform Admin
│   ├── Dashboard & operational alerts
│   ├── Verification queue
│   ├── Users / businesses / orders management
│   ├── Category & master-catalog governance
│   ├── Locations & city launch toggles
│   ├── Complaints & moderation (V2)
│   ├── Payments, commissions, refunds (V2)
│   ├── Analytics & reports
│   ├── Admin RBAC & staff management
│   ├── Platform configuration / feature flags
│   └── Audit logs
└── Cross-cutting
    ├── Real-time gateway (orders, chat, presence)
    ├── Notification service (in-app, push, SMS, email)
    ├── File & media service (signed URLs, scanning)
    ├── Search
    ├── Events & outbox
    ├── Jobs & schedulers (expiry, reminders, retries)
    ├── Observability (logs, metrics, traces, health)
    ├── Feature flags & configuration
    └── Audit & compliance
```

---

## 13. MVP Scope (V1) — and what is explicitly excluded

**Included** (all `[V1]` items in §7). The MVP is complete only if this loop works
end-to-end for one shop and one customer:

```text
customer registers → sets location → finds shop → adds products → places order
→ shop is alerted → accepts with ETA → chats → packs → marks ready
→ customer notified → arrives → code verified → handed over → completed
```

**Excluded from V1, with reasons:**

| Excluded | Why |
|----------|-----|
| Online payments | PCI/settlement scope + refund ops; *pay at store* already works and removes payment failure from the critical path |
| Delivery | New actor, new economics, new liability |
| Product variants | Adds catalog complexity for <10% of V1 SKUs; modelled but not built |
| Reviews/ratings | Needs volume to be meaningful and moderation to be safe |
| Staff accounts | Beachhead is owner-operated; owner login suffices |
| QR pickup | 6-char code is 95% of the value at 5% of the work |
| Coupons/promotions | Growth lever, not a core-loop requirement |
| Elasticsearch, Kafka, microservices | Premature; PostgreSQL + outbox covers V1 scale |
| Web customer app | Mobile-first audience; the shop web dashboard is the exception |

**MVP success criteria (go/no-go for V2):**
- ≥ 60% of orders accepted within 3 minutes.
- ≥ 85% of accepted orders reach `COMPLETED`.
- Median ETA absolute error ≤ 5 minutes.
- ≥ 40% of customers place a second order within 14 days.
- ≥ 50% of onboarded shops are still receiving orders in week 4.

---

## 14. Future Roadmap

**V2 — Trust & operations** (payments, QR/OTP pickup, reviews & ratings, staff
accounts + RBAC, multi-branch management, favourites, repeat order, coupons, push at
scale, low-stock alerts, business analytics, MFA for privileged accounts, complaints
& moderation).

**V3 — Efficiency & expansion** (delivery partner app + live tracking, digital queue,
smart prep-time estimates from history, inventory forecasting, loyalty, advanced
search via OpenSearch, recommendations, service areas/geofencing, scheduled orders,
second city).

**V4 — Intelligence & integrations** (AI customer/shop assistants, AI prep-time and
inventory prediction, fraud/abuse detection, POS + accounting integrations, franchise
and enterprise merchant management, multi-city/multi-country, marketplace ads).

Each version is gated on the previous version's success metrics, not on a calendar.

---

## 15. Business Model Analysis

| Model | Fit for MVP | Fit at scale | Risk |
|-------|-------------|--------------|------|
| A. Commission per order | ❌ | ⚠️ | Requires payment capture to enforce; with *pay at store* it is unenforceable and creates order-hiding incentives (shops route customers off-platform) |
| B. Monthly subscription (business) | ⚠️ | ✅ | Simple and predictable, but a hard sell before value is proven |
| C. Freemium | ✅ | ✅ | Free tier capped (orders/month, 1 branch, basic analytics); low friction, monetise the shops that succeed |
| D. Premium analytics | ❌ | ✅ | Good expansion revenue, worthless at low volume |
| E. Payment processing fee | ❌ | ⚠️ | Only viable after online payments; thin margins |
| F. Delivery commission | ❌ | ✅ | Strong V3 revenue, needs the delivery product |
| G. Promoted businesses | ❌ | ✅ | High-margin, but needs demand density or it degrades trust |
| H. Hybrid | ⚠️ | ✅ | The end state |

**Recommendation**

- **MVP:** free for everyone (Model C free tier). The only goal is proving the loop
  and density. Monetisation now would corrupt the funnel data.
- **Early growth:** Model C → B. Freemium with a capped free tier; paid tier unlocks
  multi-branch, staff accounts, analytics, and higher order volume. Subscription is
  chosen over commission because it is **enforceable without payment capture** and
  aligns incentives (shops want more orders, not fewer reported orders).
- **Scale:** Hybrid (H): subscription tiers + commission *only on
  online-paid/delivered orders* (where the platform actually captures money and
  provides logistics) + promoted placement + premium analytics.

**Architectural guardrail:** monetisation must live in a **Billing/Plan module**
consulted through a `PlanPolicy` service (entitlements + limits). No order, catalog,
or chat code may branch on plan or commission logic; it asks
`canPlaceOrder(branch)` / `entitlement(business, feature)`. This keeps every pricing
experiment out of the domain core.

---

Continue to [Part 2 — Architecture](./02-architecture.md).
