import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Permission, RoleCode } from '@quickpick/shared';

import { ACTOR_REQUEST_KEY, type Actor } from '../actor';
import type { AccessService } from '../rbac/access.service';
import type { TokenService } from '../tokens/token.service';

import { AccessTokenGuard, bearerTokenOf } from './access-token.guard';
import { PermissionsGuard } from './permissions.guard';

const actor: Actor = {
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
};

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => (): void => undefined,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(value);
  return reflector;
}

describe('bearerTokenOf', () => {
  it('accepts a bearer header regardless of case', () => {
    expect(bearerTokenOf('Bearer abc')).toBe('abc');
    expect(bearerTokenOf('bearer abc')).toBe('abc');
  });

  it('rejects a missing, malformed or non-bearer header', () => {
    for (const header of [undefined, '', 'abc', 'Basic abc', 'Bearer']) {
      expect(() => bearerTokenOf(header)).toThrow(/Bearer token required/);
    }
  });
});

describe('AccessTokenGuard', () => {
  const verifyAccessToken = jest.fn();
  const loadActorBySession = jest.fn();
  const tokens = { verifyAccessToken } as unknown as TokenService;
  const access = { loadActorBySession } as unknown as AccessService;

  beforeEach(() => jest.clearAllMocks());

  it('lets a @Public() route through without touching the token', async () => {
    const guard = new AccessTokenGuard(reflectorReturning(true), tokens, access);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('attaches the resolved actor to the request', async () => {
    const guard = new AccessTokenGuard(reflectorReturning(false), tokens, access);
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer token' } };
    verifyAccessToken.mockReturnValue({ sub: 'user-1', sid: 'session-1', fid: 'family-1' });
    loadActorBySession.mockResolvedValue(actor);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request[ACTOR_REQUEST_KEY]).toBe(actor);
    expect(loadActorBySession).toHaveBeenCalledWith('session-1');
  });

  it('rejects a request with no bearer token', async () => {
    const guard = new AccessTokenGuard(reflectorReturning(false), tokens, access);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
      code: ErrorCode.UNAUTHENTICATED,
    });
  });

  it('rejects a token whose session has been revoked', async () => {
    const guard = new AccessTokenGuard(reflectorReturning(false), tokens, access);
    verifyAccessToken.mockReturnValue({ sub: 'user-1', sid: 'session-1', fid: 'family-1' });
    loadActorBySession.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer token' } })),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHENTICATED });
  });

  it('rejects a token whose subject does not match the session owner', async () => {
    const guard = new AccessTokenGuard(reflectorReturning(false), tokens, access);
    verifyAccessToken.mockReturnValue({ sub: 'someone-else', sid: 'session-1', fid: 'family-1' });
    loadActorBySession.mockResolvedValue(actor);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer token' } })),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHENTICATED });
  });
});

describe('PermissionsGuard', () => {
  const access = {
    holdsAnywhere: (subject: Actor, permission: Permission) =>
      subject.grants.some((grant) => grant.permissions.includes(permission)),
  } as unknown as AccessService;

  it('allows a route that declares no permissions', () => {
    expect(
      new PermissionsGuard(reflectorReturning(undefined), access).canActivate(contextFor({})),
    ).toBe(true);
    expect(new PermissionsGuard(reflectorReturning([]), access).canActivate(contextFor({}))).toBe(
      true,
    );
  });

  it('allows a caller holding the declared permission in some scope', () => {
    const guard = new PermissionsGuard(reflectorReturning([Permission.ORDER_ACCEPT]), access);

    expect(guard.canActivate(contextFor({ [ACTOR_REQUEST_KEY]: actor }))).toBe(true);
  });

  it('rejects an unauthenticated caller on a guarded route', () => {
    const guard = new PermissionsGuard(reflectorReturning([Permission.ORDER_ACCEPT]), access);

    expect(() => guard.canActivate(contextFor({}))).toThrow(/Authentication required/);
  });

  it('names the missing permission when the caller lacks it', () => {
    const guard = new PermissionsGuard(reflectorReturning([Permission.PRODUCT_WRITE]), access);

    expect(() => guard.canActivate(contextFor({ [ACTOR_REQUEST_KEY]: actor }))).toThrow(
      /Missing permission product.write/,
    );
  });
});
