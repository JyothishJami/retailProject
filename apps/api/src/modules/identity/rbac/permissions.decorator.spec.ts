import type { ExecutionContext } from '@nestjs/common';
import { Permission } from '@quickpick/shared';

import { ACTOR_REQUEST_KEY, actorFromContext, type Actor } from '../actor';

import {
  PERMISSIONS_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  Public,
  RequirePermissions,
} from './permissions.decorator';

const actor: Actor = { userId: 'user-1', sessionId: 'session-1', grants: [] };

describe('route metadata decorators', () => {
  it('marks a class as public', () => {
    @Public()
    class OpenController {}

    expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, OpenController)).toBe(true);
  });

  it('records the permissions a handler declares', () => {
    class OrdersController {
      @RequirePermissions(Permission.ORDER_ACCEPT, Permission.ORDER_REJECT)
      accept(): void {}
    }

    expect(
      Reflect.getMetadata(PERMISSIONS_METADATA_KEY, OrdersController.prototype.accept),
    ).toEqual([Permission.ORDER_ACCEPT, Permission.ORDER_REJECT]);
  });
});

describe('actorFromContext', () => {
  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('reads the actor the guard attached', () => {
    expect(actorFromContext(undefined, contextFor({ [ACTOR_REQUEST_KEY]: actor }))).toBe(actor);
  });

  it('is undefined on a public route', () => {
    expect(actorFromContext(undefined, contextFor({}))).toBeUndefined();
  });
});
