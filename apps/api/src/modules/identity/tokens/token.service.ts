import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DomainError, ErrorCode } from '@quickpick/shared';

import { AppConfig } from '../../../config/app-config';

export const TOKEN_ISSUER = 'quickpick';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id, so a revoked session invalidates its access tokens too. */
  sid: string;
  /** Session family id, shared by every rotation of one login. */
  fid: string;
}

export interface RefreshToken {
  /** Returned to the client once and never stored. */
  token: string;
  /** What the `session` row keeps. */
  hash: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS');
  }

  get refreshTokenTtlMs(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1_000;
  }

  signAccessToken(claims: AccessTokenClaims): string {
    return this.jwt.sign(claims, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.accessTokenTtlSeconds,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_ISSUER,
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        issuer: TOKEN_ISSUER,
        audience: TOKEN_ISSUER,
      });
      if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
        throw new Error('missing subject or session claim');
      }
      return claims;
    } catch {
      // The reason is deliberately not echoed to the client.
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Invalid or expired access token.');
    }
  }

  /**
   * Refresh tokens are 256 bits of randomness, so they are stored as a plain
   * SHA-256 digest rather than a password hash: there is nothing to brute-force,
   * and lookup on rotation must be a single indexed equality match.
   */
  issueRefreshToken(): RefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashRefreshToken(token) };
  }

  refreshTokenExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + this.refreshTokenTtlMs);
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
