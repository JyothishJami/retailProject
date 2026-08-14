import { ErrorCode, Permission, RoleCode } from '@quickpick/shared';

import { createPrismaMock, type PrismaMock } from '../../../../test/support/prisma-mock';
import type { Actor, ActorGrant } from '../actor';

import { AccessService } from './access.service';

function actorWith(...grants: ActorGrant[]): Actor {
  return { userId: 'user-1', sessionId: 'session-1', grants };
}

const managerOfBranch: ActorGrant = {
  roleCode: RoleCode.MANAGER,
  businessId: 'business-1',
  branchId: 'branch-1',
  permissions: [Permission.ORDER_ACCEPT],
};

const ownerOfBusiness: ActorGrant = {
  roleCode: RoleCode.OWNER,
  businessId: 'business-1',
  branchId: null,
  permissions: [Permission.ORDER_ACCEPT],
};

const platformAdmin: ActorGrant = {
  roleCode: RoleCode.SUPER_ADMIN,
  businessId: null,
  branchId: null,
  permissions: [Permission.ORDER_ACCEPT],
};

describe('AccessService.can', () => {
  const service = new AccessService(createPrismaMock());

  it('lets a branch grant act on its own branch only', () => {
    const actor = actorWith(managerOfBranch);

    expect(service.can(actor, Permission.ORDER_ACCEPT, { branchId: 'branch-1' })).toBe(true);
    expect(service.can(actor, Permission.ORDER_ACCEPT, { branchId: 'branch-2' })).toBe(false);
    expect(service.can(actor, Permission.ORDER_ACCEPT, { businessId: 'business-1' })).toBe(false);
  });

  it('lets a business grant act on any branch of that business', () => {
    const actor = actorWith(ownerOfBusiness);

    expect(
      service.can(actor, Permission.ORDER_ACCEPT, {
        businessId: 'business-1',
        branchId: 'branch-9',
      }),
    ).toBe(true);
    expect(service.can(actor, Permission.ORDER_ACCEPT, { businessId: 'business-2' })).toBe(false);
  });

  it('lets a platform grant act everywhere', () => {
    const actor = actorWith(platformAdmin);

    expect(service.can(actor, Permission.ORDER_ACCEPT, { businessId: 'anything' })).toBe(true);
    expect(service.can(actor, Permission.ORDER_ACCEPT)).toBe(true);
  });

  it('denies a permission the grant does not carry, whatever the scope', () => {
    const actor = actorWith(platformAdmin);

    expect(service.can(actor, Permission.PRODUCT_WRITE, { businessId: 'business-1' })).toBe(false);
    expect(service.holdsAnywhere(actor, Permission.PRODUCT_WRITE)).toBe(false);
    expect(service.holdsAnywhere(actor, Permission.ORDER_ACCEPT)).toBe(true);
  });

  it('assertCan throws FORBIDDEN outside the grant scope', () => {
    const actor = actorWith(managerOfBranch);

    expect(() =>
      service.assertCan(actor, Permission.ORDER_ACCEPT, { branchId: 'branch-1' }),
    ).not.toThrow();
    expect(() =>
      service.assertCan(actor, Permission.ORDER_ACCEPT, { branchId: 'branch-2' }),
    ).toThrow(/Missing permission order.accept/);
  });
});

describe('AccessService.assertCanForBranch', () => {
  let prisma: PrismaMock;
  let service: AccessService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AccessService(prisma);
  });

  it('derives the business scope from the stored branch, not from the caller', async () => {
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-9', businessId: 'business-1' });

    await expect(
      service.assertCanForBranch(actorWith(ownerOfBusiness), Permission.ORDER_ACCEPT, 'branch-9'),
    ).resolves.toBeUndefined();
  });

  it('refuses a branch that belongs to another business', async () => {
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-9', businessId: 'business-2' });

    await expect(
      service.assertCanForBranch(actorWith(ownerOfBusiness), Permission.ORDER_ACCEPT, 'branch-9'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('reports a missing branch as not found', async () => {
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(
      service.assertCanForBranch(actorWith(platformAdmin), Permission.ORDER_ACCEPT, 'gone'),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe('AccessService.loadActorBySession', () => {
  let prisma: PrismaMock;
  let service: AccessService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AccessService(prisma);
  });

  it('flattens role grants into permissions with their scope', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        status: 'ACTIVE',
        deletedAt: null,
        roles: [
          {
            businessId: 'business-1',
            branchId: 'branch-1',
            role: {
              code: RoleCode.MANAGER,
              permissions: [{ permission: { code: Permission.ORDER_ACCEPT } }],
            },
          },
        ],
      },
    });

    await expect(service.loadActorBySession('session-1')).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      grants: [
        {
          roleCode: RoleCode.MANAGER,
          businessId: 'business-1',
          branchId: 'branch-1',
          permissions: [Permission.ORDER_ACCEPT],
        },
      ],
    });
  });

  it('excludes expired grants at the query level', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: { id: 'user-1', status: 'ACTIVE', deletedAt: null, roles: [] },
    });

    const actor = await service.loadActorBySession('session-1');

    expect(actor?.grants).toEqual([]);
    const roleFilter = prisma.session.findFirst.mock.calls[0][0].select.user.select.roles.where;
    expect(roleFilter.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });

  it('returns no actor for a revoked session, or a blocked or deleted user', async () => {
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await expect(service.loadActorBySession('session-1')).resolves.toBeNull();

    prisma.session.findFirst.mockResolvedValueOnce({
      id: 'session-1',
      user: { id: 'user-1', status: 'BLOCKED', deletedAt: null, roles: [] },
    });
    await expect(service.loadActorBySession('session-1')).resolves.toBeNull();

    prisma.session.findFirst.mockResolvedValueOnce({
      id: 'session-1',
      user: { id: 'user-1', status: 'ACTIVE', deletedAt: new Date(), roles: [] },
    });
    await expect(service.loadActorBySession('session-1')).resolves.toBeNull();
  });
});
