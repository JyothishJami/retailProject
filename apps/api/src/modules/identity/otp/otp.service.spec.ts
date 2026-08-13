import { DomainError, ErrorCode } from '@quickpick/shared';
import * as argon2 from 'argon2';

import { createPrismaMock, type PrismaMock } from '../../../../test/support/prisma-mock';
import type { AppConfig } from '../../../config/config.module';

import type { OtpSender } from './otp-sender';
import { OtpService } from './otp.service';

const defaults: Record<string, unknown> = {
  OTP_LENGTH: 6,
  OTP_TTL_SECONDS: 300,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_PER_HOUR: 5,
  OTP_DEV_CODE: undefined,
};

function makeService(overrides: Record<string, unknown> = {}): {
  service: OtpService;
  prisma: PrismaMock;
  send: jest.Mock;
} {
  const prisma = createPrismaMock();
  const send = jest.fn().mockResolvedValue(undefined);
  const config = {
    get: (key: string) => ({ ...defaults, ...overrides })[key],
  } as unknown as AppConfig;
  const service = new OtpService(prisma, config, { send } as unknown as OtpSender);
  return { service, prisma, send };
}

function challengeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'challenge-1',
    destination: '+919876543210',
    purpose: 'LOGIN',
    channel: 'SMS',
    codeHash: 'unset',
    attempts: 0,
    maxAttempts: 5,
    expiresAt: new Date(Date.now() + 300_000),
    consumedAt: null,
    ...overrides,
  };
}

describe('OtpService.request', () => {
  it('stores only a hash of the code and hands the plaintext to the sender', async () => {
    const { service, prisma, send } = makeService();
    prisma.otpChallenge.count.mockResolvedValue(0);
    prisma.otpChallenge.findFirst.mockResolvedValue(null);
    prisma.otpChallenge.create.mockResolvedValue({ id: 'challenge-1' });

    const issued = await service.request({
      destination: '+919876543210',
      channel: 'SMS',
      purpose: 'LOGIN',
      ip: '203.0.113.4',
    });

    expect(issued).toEqual({ challengeId: 'challenge-1', expiresInSec: 300, resendAfterSec: 60 });
    const created = prisma.otpChallenge.create.mock.calls[0][0].data;
    const sent = send.mock.calls[0][0];
    expect(sent.code).toMatch(/^\d{6}$/);
    expect(created.codeHash).not.toContain(sent.code);
    expect(await argon2.verify(created.codeHash, sent.code)).toBe(true);
    expect(created.ip).toBe('203.0.113.4');
  });

  it('refuses a resend inside the cooldown window', async () => {
    const { service, prisma, send } = makeService();
    prisma.otpChallenge.count.mockResolvedValue(1);
    prisma.otpChallenge.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) });

    await expect(
      service.request({ destination: '+919876543210', channel: 'SMS', purpose: 'LOGIN' }),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_RATE_LIMITED });
    expect(send).not.toHaveBeenCalled();
    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
  });

  it('refuses more than the hourly allowance', async () => {
    const { service, prisma } = makeService({ OTP_MAX_PER_HOUR: 2 });
    prisma.otpChallenge.count.mockResolvedValue(2);
    prisma.otpChallenge.findFirst.mockResolvedValue(null);

    await expect(
      service.request({ destination: '+919876543210', channel: 'SMS', purpose: 'LOGIN' }),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_RATE_LIMITED });
  });

  it('uses the configured development code when one is set', async () => {
    const { service, prisma, send } = makeService({ OTP_DEV_CODE: '123456' });
    prisma.otpChallenge.count.mockResolvedValue(0);
    prisma.otpChallenge.findFirst.mockResolvedValue(null);
    prisma.otpChallenge.create.mockResolvedValue({ id: 'challenge-1' });

    await service.request({ destination: '+919876543210', channel: 'SMS', purpose: 'LOGIN' });

    expect(send.mock.calls[0][0].code).toBe('123456');
  });
});

describe('OtpService.verify', () => {
  it('accepts the right code once and consumes the challenge', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValue(
      challengeRow({ codeHash: await argon2.hash('123456') }),
    );
    prisma.otpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const challenge = await service.verify('challenge-1', '123456');

    expect(challenge.destination).toBe('+919876543210');
    expect(prisma.otpChallenge.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
  });

  it('rejects an unknown or already-used challenge', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValueOnce(null);
    await expect(service.verify('missing', '123456')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });

    prisma.otpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ consumedAt: new Date(), codeHash: await argon2.hash('123456') }),
    );
    await expect(service.verify('challenge-1', '123456')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
  });

  it('reports expiry distinctly and consumes the challenge', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValue(
      challengeRow({
        expiresAt: new Date(Date.now() - 1_000),
        codeHash: await argon2.hash('123456'),
      }),
    );
    prisma.otpChallenge.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verify('challenge-1', '123456')).rejects.toMatchObject({
      code: ErrorCode.OTP_EXPIRED,
    });
    expect(prisma.otpChallenge.updateMany).toHaveBeenCalledTimes(1);
  });

  it('counts a wrong code as an attempt and hides which part failed', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValue(
      challengeRow({ codeHash: await argon2.hash('123456') }),
    );
    prisma.otpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const error = await service.verify('challenge-1', '000000').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(ErrorCode.OTP_INVALID);
    expect(prisma.otpChallenge.updateMany.mock.calls[0][0].data).toEqual({
      attempts: { increment: 1 },
    });
  });

  it('burns the challenge on the final wrong attempt', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValue(
      challengeRow({ attempts: 4, codeHash: await argon2.hash('123456') }),
    );
    prisma.otpChallenge.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verify('challenge-1', '000000')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(prisma.otpChallenge.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
  });

  it('locks out once the attempt ceiling is reached', async () => {
    const { service, prisma } = makeService();
    prisma.otpChallenge.findUnique.mockResolvedValue(
      challengeRow({ attempts: 5, codeHash: await argon2.hash('123456') }),
    );
    // The guarded increment matches nothing once attempts >= maxAttempts.
    prisma.otpChallenge.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verify('challenge-1', '123456')).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_LOCKED,
    });
  });
});
