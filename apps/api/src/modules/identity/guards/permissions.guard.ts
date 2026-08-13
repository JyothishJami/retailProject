import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, ErrorCode, type Permission } from '@quickpick/shared';

import { actorOf, type RequestWithActor } from '../actor';
import { AccessService } from '../rbac/access.service';
import { PERMISSIONS_METADATA_KEY } from '../rbac/permissions.decorator';

/**
 * Coarse permission gate: rejects a caller who does not hold the required
 * permission in any scope. Scope itself is checked by the handler against the
 * resource it loaded (`AccessService.assertCan`), because request-supplied ids
 * are not evidence of ownership.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly Permission[]>(
      PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const actor = actorOf(context.switchToHttp().getRequest<RequestWithActor>());
    if (!actor) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication required.');
    }

    const missing = required.filter((permission) => !this.access.holdsAnywhere(actor, permission));
    if (missing.length > 0) {
      throw new DomainError(ErrorCode.FORBIDDEN, `Missing permission ${missing.join(', ')}.`);
    }
    return true;
  }
}
