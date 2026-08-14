import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { DevicePlatform, Prisma, User } from '@prisma/client';
import { DomainError, ErrorCode, RoleCode } from '@quickpick/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { OtpService, type OtpChallengeIssued } from './otp/otp.service';
import { TokenService, hashRefreshToken } from './tokens/token.service';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface DeviceInput {
  platform: DevicePlatform;
  pushToken?: string | undefined;
  appVersion?: string | undefined;
  osVersion?: string | undefined;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds, per the documented response shape. */
  expiresIn: number;
}

export interface AuthResult extends TokenPair {
  user: { id: string; fullName: string | null; phone: string | null; userType: string };
  isNewUser: boolean;
}

export interface SessionSummary {
  id: string;
  current: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  device: { id: string; platform: DevicePlatform; appVersion: string | null } | null;
}

/** Why a session row stopped being usable — kept for support and audit. */
const RevokedReason = {
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  ROTATED: 'ROTATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
  REVOKED_BY_USER: 'REVOKED_BY_USER',
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  requestPhoneOtp(
    phone: string,
    purpose: 'LOGIN' | 'REGISTER' | 'VERIFY_PHONE',
    context: RequestContext,
  ): Promise<OtpChallengeIssued> {
    return this.otp.request({
      destination: phone,
      channel: 'SMS',
      purpose,
      ip: context.ip,
    });
  }

  /**
   * Verifying a code both authenticates and, for an unknown phone number,
   * registers: the customer journey has no separate sign-up step (FR-A).
   */
  async verifyPhoneOtp(
    challengeId: string,
    code: string,
    device: DeviceInput | undefined,
    context: RequestContext,
  ): Promise<AuthResult> {
    const challenge = await this.otp.verify(challengeId, code);
    const existing = await this.prisma.user.findFirst({
      where: { phoneE164: challenge.destination, deletedAt: null },
    });

    if (existing && existing.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.ACCOUNT_LOCKED, 'This account cannot sign in.');
    }

    const user = existing ?? (await this.registerCustomer(challenge.destination));
    const deviceId = device ? await this.upsertDevice(user.id, device) : null;
    const tokens = await this.startSession(user.id, deviceId, context);

    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phoneE164,
        userType: user.userType,
      },
      isNewUser: existing === null,
    };
  }

  /**
   * Single-use rotation. Presenting a token that was already rotated means the
   * token leaked, so the entire family is revoked rather than just the replay.
   */
  async refresh(rawToken: string, context: RequestContext): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(rawToken) },
      select: {
        id: true,
        userId: true,
        deviceId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session) {
      throw new DomainError(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is not valid.');
    }
    if (session.revokedAt !== null) {
      const revoked = await this.revokeFamily(session.familyId, RevokedReason.REUSE_DETECTED);
      this.logger.warn(
        { userId: session.userId, familyId: session.familyId, revokedSessions: revoked },
        'Refresh token reuse detected; session family revoked',
      );
      throw new DomainError(
        ErrorCode.REFRESH_REUSE_DETECTED,
        'Refresh token was already used. All sessions for this login have been revoked.',
      );
    }
    if (session.expiresAt <= new Date()) {
      throw new DomainError(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token has expired.');
    }

    const refresh = this.tokens.issueRefreshToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Guarded update: two concurrent refreshes with the same token race here,
      // and exactly one of them wins.
      const claimed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: RevokedReason.ROTATED,
          lastUsedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new DomainError(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is not valid.');
      }
      return tx.session.create({
        data: {
          userId: session.userId,
          deviceId: session.deviceId,
          familyId: session.familyId,
          parentSessionId: session.id,
          refreshTokenHash: refresh.hash,
          expiresAt: this.tokens.refreshTokenExpiry(),
          ...contextColumns(context),
        },
        select: { id: true, familyId: true },
      });
    });

    return {
      accessToken: this.tokens.signAccessToken({
        sub: session.userId,
        sid: rotated.id,
        fid: rotated.familyId,
      }),
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTokenTtlSeconds,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RevokedReason.LOGOUT },
    });
  }

  /** Revokes every live session of the user, including the caller's own. */
  async logoutAll(userId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RevokedReason.LOGOUT_ALL },
    });
    return { revoked: result.count };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
        device: { select: { id: true, platform: true, appVersion: true } },
      },
    });

    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RevokedReason.REVOKED_BY_USER },
    });
    if (result.count === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'Session not found.');
    }
  }

  private async startSession(
    userId: string,
    deviceId: string | null,
    context: RequestContext,
  ): Promise<TokenPair> {
    const refresh = this.tokens.issueRefreshToken();
    const created = await this.prisma.session.create({
      data: {
        userId,
        deviceId,
        // A fresh login starts its own family; rotations inherit this id.
        familyId: randomUUID(),
        refreshTokenHash: refresh.hash,
        expiresAt: this.tokens.refreshTokenExpiry(),
        ...contextColumns(context),
      },
      select: { id: true, familyId: true },
    });

    return {
      accessToken: this.tokens.signAccessToken({
        sub: userId,
        sid: created.id,
        fid: created.familyId,
      }),
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTokenTtlSeconds,
    };
  }

  private async registerCustomer(phone: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          userType: 'CUSTOMER',
          phoneE164: phone,
          phoneVerifiedAt: new Date(),
          status: 'ACTIVE',
          credentials: { create: { type: 'OTP_PHONE' } },
        },
      });

      const role = await tx.role.findUnique({
        where: { code: RoleCode.CUSTOMER },
        select: { id: true },
      });
      if (!role) {
        // The role catalogue is seeded with the schema; missing it is a
        // deployment fault, not a user error.
        throw new DomainError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Role catalogue is not seeded; cannot complete registration.',
        );
      }
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      return user;
    });
  }

  private async upsertDevice(userId: string, device: DeviceInput): Promise<string> {
    const existing = await this.prisma.device.findFirst({
      where: { userId, platform: device.platform, pushToken: device.pushToken ?? null },
      select: { id: true },
    });

    const data: Prisma.DeviceUncheckedCreateInput = {
      userId,
      platform: device.platform,
      pushToken: device.pushToken ?? null,
      appVersion: device.appVersion ?? null,
      osVersion: device.osVersion ?? null,
      lastSeenAt: new Date(),
    };

    if (existing) {
      await this.prisma.device.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await this.prisma.device.create({ data, select: { id: true } });
    return created.id;
  }

  private async revokeFamily(familyId: string, reason: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }
}

function contextColumns(context: RequestContext): { ip?: string; userAgent?: string } {
  return {
    ...(context.ip !== undefined ? { ip: context.ip } : {}),
    ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
  };
}
