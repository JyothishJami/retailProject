# retailProject — QuickPick

A local commerce **pre-order and pickup** platform: customers order from nearby shops
before arriving, chat with the shop in real time, and collect the order when it is
packed and ready.

> **Order before you arrive. Pick up when it's ready.**

## Status

Phase 1 — monorepo foundation: the API boots with validated config, structured logs,
health probes, and the shared order state machine. No business modules yet.

**Design docs: [docs/README.md](./docs/README.md)** — the complete Product Discovery &
Architecture Document (product scope, domain model, database schema, API design,
security, scalability, testing, DevOps, risks, and the phased build sequence).

## Quickstart

Requires Node 20 (see [.nvmrc](./.nvmrc)), pnpm 9, and Docker.

```bash
pnpm install
pnpm services:up                      # Postgres/PostGIS, Redis, MinIO
cp apps/api/.env.example apps/api/.env
pnpm --filter @quickpick/api dev       # http://localhost:3000/docs
```

Probes: `GET /healthz` (liveness, no dependencies) and `GET /readyz` (Postgres + Redis,
503 when a dependency is unreachable). Everything else lives under `/api/v1`.

```bash
pnpm lint && pnpm typecheck && pnpm test:cov && pnpm build
pnpm --filter @quickpick/api test:e2e
```

## Layout

| Path              | Contents                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `apps/api`        | NestJS modular monolith (config, logging, health, error envelope)  |
| `packages/shared` | Order state machine, enums, error codes, pagination, socket events |
| `packages/config` | Shared Jest preset                                                 |
| `infra/docker`    | Local Postgres/PostGIS, Redis, MinIO stack                         |

## Planned stack

Modular-monolith backend on **NestJS + TypeScript**, **PostgreSQL 16 + PostGIS**,
**Redis** (cache, queues, socket fan-out), **Socket.IO** for real time, S3-compatible
object storage, **React Native** customer and shop apps, and a **React** admin web app
in a pnpm/Turborepo monorepo. Rationale and alternatives: [ADR table](./docs/02-architecture.md#26-architectural-decision-records-summary).

## Applications

| App          | Users            | Purpose                                                           |
| ------------ | ---------------- | ----------------------------------------------------------------- |
| Customer app | Shoppers         | Discover shops, browse catalog, cart, pre-order, chat, pickup     |
| Shop app     | Owners and staff | Catalog, availability, order queue, packing, prep time, hand-over |
| Admin web    | Platform staff   | Verification, monitoring, configuration, analytics, audit         |
