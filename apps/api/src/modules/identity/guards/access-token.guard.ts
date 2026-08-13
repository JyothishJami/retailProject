import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, ErrorCode } from '@quickpick/shared';

import { ACTOR_REQUEST_KEY, type RequestWithActor } from '../actor';
import { AccessService } from '../rbac/access.service';
import { PUBLIC_METADATA_KEY } from '../rbac/permissions.decorator';
import { TokenService } from '../tokens/token.service';

/**
 * Authenticates every request that is not explicitly `@Public()`. The session
 * behind the token is re-read from the database, so logout and session
 * revocation take effect immediately instead of when the access token expires.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const claims = this.tokens.verifyAccessToken(bearerTokenOf(request.headers.authorization));
    const actor = await this.access.loadActorBySession(claims.sid);
    if (!actor || actor.userId !== claims.sub) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Session is no longer valid.');
    }

    request[ACTOR_REQUEST_KEY] = actor;
    return true;
  }
}

export function bearerTokenOf(header: string | undefined): string {
  const [scheme, token] = (header ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Bearer token required.');
  }
  return token;
}
