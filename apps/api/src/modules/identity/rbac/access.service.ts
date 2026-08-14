import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode, type Permission } from '@quickpick/shared';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { Actor, ActorGrant } from '../actor';

/**
 * Where a permission is being exercised. Callers pass what the *loaded resource*
 * says, never ids copied from the request body — otherwise a caller could name
 * someone else's branch and borrow their own permissions to act on it.
 */
export interface Scope {
  businessId?: string | null;
  branchId?: string | null;
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the caller from their session in one query. Roles are read per
   * request rather than embedded in the access token so that revoking a role
   * takes effect immediately instead of at the next token refresh.
   */
  async loadActorBySession(sessionId: string): Promise<Actor | null> {
    const now = new Date();
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            roles: {
              where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              select: {
                businessId: true,
                branchId: true,
                role: {
                  select: {
                    code: true,
                    permissions: { select: { permission: { select: { code: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.user.deletedAt !== null || session.user.status !== 'ACTIVE') {
      return null;
    }

    return {
      userId: session.user.id,
      sessionId: session.id,
      grants: session.user.roles.map((grant) => ({
        roleCode: grant.role.code as ActorGrant['roleCode'],
        businessId: grant.businessId,
        branchId: grant.branchId,
        permissions: grant.role.permissions.map((entry) => entry.permission.code as Permission),
      })),
    };
  }

  /** Does the caller hold this permission in *any* scope? Cheap pre-filter for guards. */
  holdsAnywhere(actor: Actor, permission: Permission): boolean {
    return actor.grants.some((grant) => grant.permissions.includes(permission));
  }

  /**
   * A grant authorizes an action when it carries the permission and its scope
   * contains the resource: platform grants contain everything, business grants
   * contain their branches, branch grants contain only themselves.
   */
  can(actor: Actor, permission: Permission, scope: Scope = {}): boolean {
    return actor.grants.some((grant) => {
      if (!grant.permissions.includes(permission)) {
        return false;
      }
      if (grant.branchId !== null) {
        return grant.branchId === scope.branchId;
      }
      if (grant.businessId !== null) {
        return grant.businessId === scope.businessId;
      }
      return true;
    });
  }

  assertCan(actor: Actor, permission: Permission, scope: Scope = {}): void {
    if (!this.can(actor, permission, scope)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `Missing permission ${permission} for the requested resource.`,
      );
    }
  }

  /**
   * Branch-scoped check that also honours business-wide grants: the owner of a
   * business may act on any of its branches without a per-branch grant.
   */
  async assertCanForBranch(actor: Actor, permission: Permission, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, businessId: true },
    });
    if (!branch) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'Branch not found.');
    }
    this.assertCan(actor, permission, { branchId: branch.id, businessId: branch.businessId });
  }
}
