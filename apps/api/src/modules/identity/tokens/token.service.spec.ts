import { JwtService } from '@nestjs/jwt';
import { DomainError } from '@quickpick/shared';

import type { AppConfig } from '../../../config/config.module';

import { TokenService, hashRefreshToken } from './token.service';

const values: Record<string, unknown> = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
};

function makeService(overrides: Record<string, unknown> = {}): TokenService {
  const config = {
    get: (key: string) => ({ ...values, ...overrides })[key],
  } as unknown as AppConfig;
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  const claims = { sub: 'user-1', sid: 'session-1', fid: 'family-1' };

  it('round-trips access-token claims', () => {
    const service = makeService();

    expect(service.verifyAccessToken(service.signAccessToken(claims))).toMatchObject(claims);
  });

  it('rejects a token signed with another secret', () => {
    const token = makeService({ JWT_ACCESS_SECRET: 'z'.repeat(32) }).signAccessToken(claims);

    expect(() => makeService().verifyAccessToken(token)).toThrow(DomainError);
  });

  it('rejects an expired token', () => {
    const service = makeService({ ACCESS_TOKEN_TTL_SECONDS: 60 });
    const token = service.signAccessToken(claims);

    jest.useFakeTimers().setSystemTime(Date.now() + 61_000);
    try {
      expect(() => service.verifyAccessToken(token)).toThrow(/Invalid or expired/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a token that carries no session claim', () => {
    const token = new JwtService().sign(
      { sub: 'user-1' },
      { secret: values.JWT_ACCESS_SECRET as string, issuer: 'quickpick', audience: 'quickpick' },
    );

    expect(() => makeService().verifyAccessToken(token)).toThrow(DomainError);
  });

  it('rejects a token minted for a different audience', () => {
    const token = new JwtService().sign(claims, {
      secret: values.JWT_ACCESS_SECRET as string,
      issuer: 'someone-else',
      audience: 'someone-else',
    });

    expect(() => makeService().verifyAccessToken(token)).toThrow(DomainError);
  });

  it('issues unguessable refresh tokens stored only as digests', () => {
    const service = makeService();

    const first = service.issueRefreshToken();
    const second = service.issueRefreshToken();

    expect(first.token).not.toEqual(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(43);
    expect(first.hash).toBe(hashRefreshToken(first.token));
    expect(first.hash).not.toContain(first.token);
  });

  it('derives the refresh expiry from the configured lifetime', () => {
    const service = makeService({ REFRESH_TOKEN_TTL_DAYS: 2 });
    const from = new Date('2026-01-01T00:00:00.000Z');

    expect(service.refreshTokenExpiry(from).toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(service.accessTokenTtlSeconds).toBe(900);
  });
});
