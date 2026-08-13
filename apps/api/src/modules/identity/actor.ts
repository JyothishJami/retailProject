import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission, RoleCode } from '@quickpick/shared';
import type { Request } from 'express';

/**
 * One row of `user_role`: the permissions a user holds *and where they hold
 * them*. A grant with no scope ids is platform-wide.
 */
export interface ActorGrant {
  roleCode: RoleCode;
  businessId: string | null;
  branchId: string | null;
  permissions: readonly Permission[];
}

/** The authenticated caller, resolved once per request by the access-token guard. */
export interface Actor {
  userId: string;
  sessionId: string;
  grants: readonly ActorGrant[];
}

export const ACTOR_REQUEST_KEY = 'actor';

export type RequestWithActor = Request & { [ACTOR_REQUEST_KEY]?: Actor };

export function actorOf(request: RequestWithActor): Actor | undefined {
  return request[ACTOR_REQUEST_KEY];
}

export function actorFromContext(_data: unknown, context: ExecutionContext): Actor | undefined {
  return actorOf(context.switchToHttp().getRequest<RequestWithActor>());
}

/** `@CurrentActor() actor: Actor` in a controller signature. */
export const CurrentActor = createParamDecorator(actorFromContext);
