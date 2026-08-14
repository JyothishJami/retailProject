import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@quickpick/shared';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/infra/redis/redis.tokens';
import { OtpSender } from '../src/modules/identity/otp/otp-sender';
import { TokenService } from '../src/modules/identity/tokens/token.service';

import { createPrismaMock, type PrismaMock } from './support/prisma-mock';

/**
 * Exercises the documented HTTP contract of the auth endpoints end to end
 * (validation, status codes, error codes, bearer authentication) against a
 * Prisma double — database behaviour is covered by the unit suites.
 */
describe('auth endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaMock;
  let tokens: TokenService;
  const sentCodes: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping: jest.fn(), quit: jest.fn() })
      .overrideProvider(OtpSender)
      .useValue({
        send: (message: { code: string }): Promise<void> => {
          sentCodes.push(message.code);
          return Promise.resolve();
        },
      })
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    sentCodes.length = 0;
    jest.clearAllMocks();
  });

  function accessTokenFor(sessionId: string, userId = 'user-1'): string {
    return tokens.signAccessToken({ sub: userId, sid: sessionId, fid: 'family-1' });
  }

  function activeSession(sessionId: string, userId = 'user-1'): Record<string, unknown> {
    return {
      id: sessionId,
      user: { id: userId, status: 'ACTIVE', deletedAt: null, roles: [] },
    };
  }

  describe('POST /api/v1/auth/otp/request', () => {
    it('issues a challenge and sends the code out of band', async () => {
      prisma.otpChallenge.count.mockResolvedValue(0);
      prisma.otpChallenge.findFirst.mockResolvedValue(null);
      prisma.otpChallenge.create.mockResolvedValue({ id: 'challenge-1' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+919876543210', purpose: 'LOGIN' })
        .expect(202);

      expect(response.body).toEqual({
        challengeId: 'challenge-1',
        expiresInSec: expect.any(Number),
        resendAfterSec: expect.any(Number),
      });
      expect(sentCodes).toHaveLength(1);
      expect(response.body.code).toBeUndefined();
    });

    it('rejects a phone number that is not E.164', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '9876543210', purpose: 'LOGIN' })
        .expect(400);

      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('answers an unknown refresh token with 401 and no detail', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);

      expect(response.body.error.code).toBe(ErrorCode.REFRESH_TOKEN_INVALID);
    });

    it('answers a replayed refresh token with REFRESH_REUSE_DETECTED', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        deviceId: null,
        familyId: 'family-1',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      });
      prisma.session.updateMany.mockResolvedValue({ count: 2 });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);

      expect(response.body.error.code).toBe(ErrorCode.REFRESH_REUSE_DETECTED);
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'family-1', revokedAt: null } }),
      );
    });
  });

  describe('authenticated routes', () => {
    it('rejects a request with no bearer token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/sessions').expect(401);

      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('rejects a token whose session was revoked', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('authorization', `Bearer ${accessTokenFor('session-1')}`)
        .expect(401);
    });

    it('lists the caller sessions and flags the current one', async () => {
      prisma.session.findFirst.mockResolvedValue(activeSession('session-1'));
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'session-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          lastUsedAt: null,
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
          ip: '203.0.113.4',
          userAgent: 'jest',
          device: null,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('authorization', `Bearer ${accessTokenFor('session-1')}`)
        .expect(200);

      expect(response.body).toEqual([expect.objectContaining({ id: 'session-1', current: true })]);
    });

    it('logs out the calling session', async () => {
      prisma.session.findFirst.mockResolvedValue(activeSession('session-1'));
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('authorization', `Bearer ${accessTokenFor('session-1')}`)
        .expect(204);

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-1', revokedAt: null } }),
      );
    });

    it('rejects a session id that is not a uuid', async () => {
      prisma.session.findFirst.mockResolvedValue(activeSession('session-1'));

      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions/not-a-uuid')
        .set('authorization', `Bearer ${accessTokenFor('session-1')}`)
        .expect(400);
    });
  });
});
