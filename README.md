# retailProject — QuickPick

A local commerce **pre-order and pickup** platform: customers order from nearby shops
before arriving, chat with the shop in real time, and collect the order when it is
packed and ready.

> **Order before you arrive. Pick up when it's ready.**

## Status

Phase 0 — product discovery and architecture. No application code yet.

**Start here: [docs/README.md](./docs/README.md)** — the complete Product Discovery &
Architecture Document (product scope, domain model, database schema, API design,
security, scalability, testing, DevOps, risks, and the phased build sequence).

## Planned stack

Modular-monolith backend on **NestJS + TypeScript**, **PostgreSQL 16 + PostGIS**,
**Redis** (cache, queues, socket fan-out), **Socket.IO** for real time, S3-compatible
object storage, **React Native** customer and shop apps, and a **React** admin web app
in a pnpm/Turborepo monorepo. Rationale and alternatives: [ADR table](./docs/02-architecture.md#26-architectural-decision-records-summary).

## Applications

| App | Users | Purpose |
|-----|-------|---------|
| Customer app | Shoppers | Discover shops, browse catalog, cart, pre-order, chat, pickup |
| Shop app | Owners and staff | Catalog, availability, order queue, packing, prep time, hand-over |
| Admin web | Platform staff | Verification, monitoring, configuration, analytics, audit |
