import { PrismaClient } from '@prisma/client';
import { Permission, ROLE_DEFINITIONS } from '@quickpick/shared';

const prisma = new PrismaClient();

/**
 * Seeds the authorization catalogue from the shared constants. Idempotent, so
 * it runs on every deploy: adding a permission to a role in code is enough to
 * grant it, and nothing here touches business data.
 */
async function seedRbac(): Promise<void> {
  for (const code of Object.values(Permission)) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((row) => [
      row.code,
      row.id,
    ]),
  );

  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { code: definition.code },
      update: { name: definition.name, scopeType: definition.scopeType },
      create: { code: definition.code, name: definition.name, scopeType: definition.scopeType },
      select: { id: true },
    });

    const wanted = definition.permissions.map((code) => {
      const permissionId = permissionIds.get(code);
      if (permissionId === undefined) {
        throw new Error(`Permission ${code} was not seeded`);
      }
      return permissionId;
    });

    await prisma.$transaction([
      // Revoked-in-code permissions must disappear from the database too.
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
}

async function main(): Promise<void> {
  await seedRbac();
  const [roles, permissions] = await Promise.all([prisma.role.count(), prisma.permission.count()]);
  console.log(`Seeded ${roles} roles and ${permissions} permissions.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
