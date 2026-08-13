import { JwtService } from '@nestjs/jwt';
import { ErrorCode, RoleCode } from '@quickpick/shared';

import { createPrismaMock, type PrismaMock } from '../../../test/support/prisma-mock';
import type { AppConfig } from '../../config/config.module';

import { AuthService } from './auth.service';
import type { OtpService } from './otp/otp.service';
import { TokenService, hashRefreshToken } from './tokens/token.service';

const config = {
  get: (key: string) =>
    ({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    })[key],
} as unknown as AppConfig;

interface Harness {
  service: AuthService;
  prisma: PrismaMock;
  tokens: TokenService;
  otpVerify: jest.Mock;
  otpRequest: jest.Mock;
}

function makeHarness(): Harness {
  const prisma = createPrismaMock();
  const tokens = new TokenService(new JwtService(), config);
  const otpRequest = jest.fn();
  const otpVerify = jest.fn();
  const otp = { request: otpRequest, verify: otpVerify } as unknown as OtpService;
  otpVerify.mockResolvedValue({ id: 'c1', destination: '+919876543210', purpose: 'LOGIN' });
  return { service: new AuthService(prisma, otp, tokens), prisma, tokens, otpRequest, otpVerify };
}

const context = { ip: '203.0.113.4', userAgent: 'jest' };

describe('AuthService.requestPhoneOtp', () => {
  it('delegates to the OTP service over SMS', async () => {
    const { service, otpRequest } = makeHarness();
    otpRequest.mockResolvedValue({ challengeId: 'c1', expiresInSec: 300, resendAfterSec: 60 });

    await service.requestPhoneOtp('+919876543210', 'LOGIN', context);

    expect(otpRequest).toHaveBeenCalledWith({
      destination: '+919876543210',
      channel: 'SMS',
      purpose: 'LOGIN',
      ip: '203.0.113.4',
    });
  });
});

describe('AuthService.verifyPhoneOtp', () => {
  it('signs in an existing customer and stores only the refresh digest', async () => {
    const { service, prisma, tokens } = makeHarness();
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      fullName: 'Asha',
      phoneE164: '+919876543210',
      userType: 'CUSTOMER',
      status: 'ACTIVE',
    });
    prisma.session.create.mockResolvedValue({ id: 'session-1', familyId: 'family-1' });

    const result = await service.verifyPhoneOtp('c1', '123456', undefined, context);

    expect(result.isNewUser).toBe(false);
    expect(result.expiresIn).toBe(900);
    expect(tokens.verifyAccessToken(result.accessToken)).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      fid: 'family-1',
    });
    const stored = prisma.session.create.mock.calls[0][0].data;
    expect(stored.refreshTokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(stored.ip).toBe('203.0.113.4');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('registers an unknown phone number as a verified customer', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-2',
      fullName: null,
      phoneE164: '+919876543210',
      userType: 'CUSTOMER',
    });
    prisma.role.findUnique.mockResolvedValue({ id: 'role-customer' });
    prisma.session.create.mockResolvedValue({ id: 'session-2', familyId: 'family-2' });

    const result = await service.verifyPhoneOtp('c1', '123456', undefined, context);

    expect(result.isNewUser).toBe(true);
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      userType: 'CUSTOMER',
      phoneE164: '+919876543210',
      status: 'ACTIVE',
    });
    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { code: RoleCode.CUSTOMER },
      select: { id: true },
    });
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', roleId: 'role-customer' },
    });
  });

  it('fails loudly when the role catalogue was never seeded', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-2' });
    prisma.role.findUnique.mockResolvedValue(null);

    await expect(service.verifyPhoneOtp('c1', '123456', undefined, context)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });

  it('refuses a blocked account', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'BLOCKED' });

    await expect(service.verifyPhoneOtp('c1', '123456', undefined, context)).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_LOCKED,
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('reuses the device row for the same platform and push token', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
    prisma.device.findFirst.mockResolvedValue({ id: 'device-1' });
    prisma.session.create.mockResolvedValue({ id: 'session-1', familyId: 'family-1' });

    await service.verifyPhoneOtp(
      'c1',
      '123456',
      { platform: 'ANDROID', pushToken: 'push-1', appVersion: '1.0.0' },
      context,
    );

    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'device-1' } }),
    );
    expect(prisma.device.create).not.toHaveBeenCalled();
    expect(prisma.session.create.mock.calls[0][0].data.deviceId).toBe('device-1');
  });

  it('creates a device row the first time a device is seen', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
    prisma.device.findFirst.mockResolvedValue(null);
    prisma.device.create.mockResolvedValue({ id: 'device-2' });
    prisma.session.create.mockResolvedValue({ id: 'session-1', familyId: 'family-1' });

    await service.verifyPhoneOtp('c1', '123456', { platform: 'IOS' }, context);

    expect(prisma.session.create.mock.calls[0][0].data.deviceId).toBe('device-2');
  });
});

describe('AuthService.refresh', () => {
  const liveSession = {
    id: 'session-1',
    userId: 'user-1',
    deviceId: 'device-1',
    familyId: 'family-1',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
  };

  it('rotates the token: old session revoked, new session inherits the family', async () => {
    const { service, prisma, tokens } = makeHarness();
    prisma.session.findUnique.mockResolvedValue(liveSession);
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.create.mockResolvedValue({ id: 'session-2', familyId: 'family-1' });

    const pair = await service.refresh('old-token', context);

    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { refreshTokenHash: hashRefreshToken('old-token') } }),
    );
    expect(prisma.session.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedReason: 'ROTATED' },
    });
    expect(prisma.session.create.mock.calls[0][0].data).toMatchObject({
      familyId: 'family-1',
      parentSessionId: 'session-1',
      deviceId: 'device-1',
      refreshTokenHash: hashRefreshToken(pair.refreshToken),
    });
    expect(tokens.verifyAccessToken(pair.accessToken)).toMatchObject({ sid: 'session-2' });
  });

  it('rejects an unknown refresh token', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(service.refresh('nope', context)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_TOKEN_INVALID,
    });
  });

  it('rejects an expired refresh token without rotating', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.findUnique.mockResolvedValue({
      ...liveSession,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(service.refresh('old-token', context)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_TOKEN_INVALID,
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('treats reuse of a rotated token as a leak and revokes the whole family', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.findUnique.mockResolvedValue({ ...liveSession, revokedAt: new Date() });
    prisma.session.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.refresh('old-token', context)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_REUSE_DETECTED,
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'REUSE_DETECTED' },
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('lets exactly one of two concurrent refreshes win the guarded update', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.findUnique.mockResolvedValue(liveSession);
    // The loser's guarded update matches no live row.
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh('old-token', context)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_TOKEN_INVALID,
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('AuthService session management', () => {
  it('revokes only live sessions on logout', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.updateMany.mockResolvedValue({ count: 1 });

    await service.logout('session-1');

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'LOGOUT' },
    });
  });

  it('reports how many sessions logout-all revoked', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.logoutAll('user-1')).resolves.toEqual({ revoked: 4 });
  });

  it('marks the caller own session in the session list', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.findMany.mockResolvedValue([
      { id: 'session-1', device: null },
      { id: 'session-2', device: { id: 'device-1', platform: 'IOS', appVersion: '1.0.0' } },
    ]);

    const sessions = await service.listSessions('user-1', 'session-2');

    expect(sessions.map((session) => session.current)).toEqual([false, true]);
  });

  it('refuses to revoke a session that is not the caller own', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeSession('user-1', 'session-x')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('revokes the caller own session', async () => {
    const { service, prisma } = makeHarness();
    prisma.session.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.revokeSession('user-1', 'session-1')).resolves.toBeUndefined();
    expect(prisma.session.updateMany.mock.calls[0][0].data.revokedReason).toBe('REVOKED_BY_USER');
  });
});
