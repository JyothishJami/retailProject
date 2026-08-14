# Prisma schema and migrations

`schema.prisma` is the V1 subset of [docs/03-database.md](../../../docs/03-database.md).
Migrations are **forward-only**: never edit an applied migration, add a new one.

```bash
pnpm --filter @quickpick/api db:migrate      # apply pending migrations (deploy)
pnpm --filter @quickpick/api db:seed         # idempotent roles/permissions/reference data
pnpm --filter @quickpick/api prisma:generate # regenerate the client
```

## Things Prisma cannot express

The tail of `migrations/20260813000000_init_core_domain/migration.sql` creates objects the
schema language has no syntax for, and they are load-bearing:

| Object                                                                                      | Why it exists                                                        |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `product.search_vector` generated column                                                    | Full-text search that cannot drift from its row (a trigger can)      |
| partial unique `cart_one_active_per_customer_branch`                                        | FR-G1 in the database, so two devices cannot create two active carts |
| partial indexes on unread notifications / unpublished outbox rows / live (non-deleted) rows | The hot queries never scan tombstones                                |
| `CHECK` constraints on money and quantities                                                 | A negative price must not be able to reach an invoice                |
| `order_number_seq`                                                                          | Collision-free human-readable order numbers                          |

Because Prisma does not model generated columns, `prisma migrate diff` reports one phantom
change against a correct database:

```sql
ALTER TABLE "product" ALTER COLUMN "search_vector" DROP DEFAULT;
```

Delete that statement if a future `migrate dev` writes it into a migration — applying it
fails, since a generated column has no default to drop.
