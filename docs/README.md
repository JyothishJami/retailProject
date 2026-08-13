# QuickPick — Product Discovery & Architecture Document

Working name: **QuickPick** (placeholder, trademark check pending).
Promise: **order before you arrive, pick up when it's ready.**

This is the Phase 0 deliverable: the complete product and architecture document that
implementation phases will follow. Nothing here is code — implementation begins on
"START PHASE 1".

## Contents

| Part | File | Covers (numbered per the master plan) |
|------|------|----------------------------------------|
| 1 | [01-product-discovery.md](./01-product-discovery.md) | 1 vision · 2 problem · 3 target users · 4 personas · 5 value proposition · 6 use cases · 7 functional requirements · 8 non-functional requirements · 9 customer journey · 10 shop-owner journey · 11 admin journey · 12 feature hierarchy · 13 MVP scope · 14 roadmap · 15 business models |
| 2 | [02-architecture.md](./02-architecture.md) | 16 domain model · 17 system architecture · 18 stack evaluation · 19 order state machine · 20 prep-time engine · 21 real-time · 22 files/media · 23 notifications · 24 security & threat model · 25 scalability · 26 ADRs · 27 monolith→services strategy |
| 3 | [03-database.md](./03-database.md) | 28–41 full PostgreSQL/PostGIS schema, indexes, query shapes, concurrency & consistency, retention/privacy |
| 4 | [04-api.md](./04-api.md) | 42–48 REST conventions, rate limits, endpoint catalogue, authorisation matrix, real-time contract, contract testing |
| 5 | [05-testing-devops-risks.md](./05-testing-devops-risks.md) | 49 testing strategy · 50 DevOps & observability · 51 risks · 52 edge cases · 53 development sequence · 54 open questions |

## Decisions at a glance

| Area | Decision |
|------|----------|
| Architecture | Modular monolith (NestJS + TypeScript), extractable modules, transactional outbox |
| Database | PostgreSQL 16 + PostGIS (relational + geo + full-text in one engine) |
| Real-time | Socket.IO + Redis adapter; REST remains the source of truth |
| Clients | React Native (customer app, shop app) + React admin web; shared TS contract packages |
| Storage | S3-compatible object storage, pre-signed uploads, mandatory AV scan |
| Payments | Pay-at-store in V1 behind a payment abstraction |
| Inventory | Three tracking modes; append-only ledger |
| Monetisation | Freemium first, isolated in a Billing/Plan module |

The reasoning, alternatives, and scalability impact for each of these is in Part 2
§26 (ADR table).

## Open questions

See Part 5 §54 — launch city/categories, provider and cloud choices, brand name,
SLA defaults, free-tier caps, support model, legal review owner.
