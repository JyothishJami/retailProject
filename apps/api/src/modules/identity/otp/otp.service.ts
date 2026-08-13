import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { OtpChallenge, OtpChannel, OtpPurpose } from '@prisma/client';
import { DomainError, ErrorCode } from '@quickpick/shared';
import * as argon2 from 'argon2';

import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import { OtpSender } from './otp-sender';

export interface OtpRequestInput {
  destination: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  ip?: string | undefined;
}

export interface OtpChallengeIssued {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly sender: OtpSender,
  ) {}

  /**
   * Issues a challenge for a destination. The response is identical whether or
   * not an account exists, so the endpoint cannot be used to enumerate users.
   */
  async request(input: OtpRequestInput): Promise<OtpChallengeIssued> {
    const now = new Date();
    const cooldownSec = this.config.get('OTP_RESEND_COOLDOWN_SECONDS');
    const ttlSec = this.config.get('OTP_TTL_SECONDS');

    await this.assertWithinLimits(input.destination, input.purpose, now, cooldownSec);

    const code = this.generateCode();
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        destination: input.destination,
        channel: input.channel,
        purpose: input.purpose,
        codeHash: await argon2.hash(code),
        maxAttempts: this.config.get('OTP_MAX_ATTEMPTS'),
        expiresAt: new Date(now.getTime() + ttlSec * 1_000),
        ...(input.ip !== undefined ? { ip: input.ip } : {}),
      },
      select: { id: true },
    });

    await this.sender.send({
      destination: input.destination,
      channel: input.channel,
      code,
      expiresInSeconds: ttlSec,
    });

    return { challengeId: challenge.id, expiresInSec: ttlSec, resendAfterSec: cooldownSec };
  }

  /**
   * Consumes a challenge. Attempts are counted in the database before the code
   * is compared, so parallel guesses cannot slip past the attempt ceiling.
   */
  async verify(challengeId: string, code: string): Promise<OtpChallenge> {
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });

    if (!challenge || challenge.consumedAt !== null) {
      throw new DomainError(ErrorCode.OTP_INVALID, 'Invalid or already used verification code.');
    }
    if (challenge.expiresAt <= now) {
      await this.consume(challenge.id);
      throw new DomainError(ErrorCode.OTP_EXPIRED, 'Verification code has expired.');
    }

    const attempted = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
    if (attempted.count === 0) {
      await this.consume(challenge.id);
      throw new DomainError(
        ErrorCode.ACCOUNT_LOCKED,
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (!(await argon2.verify(challenge.codeHash, code))) {
      if (challenge.attempts + 1 >= challenge.maxAttempts) {
        await this.consume(challenge.id);
      }
      throw new DomainError(ErrorCode.OTP_INVALID, 'Invalid or already used verification code.');
    }

    await this.consume(challenge.id);
    return { ...challenge, consumedAt: now, attempts: challenge.attempts + 1 };
  }

  private async consume(id: string): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  private async assertWithinLimits(
    destination: string,
    purpose: OtpPurpose,
    now: Date,
    cooldownSec: number,
  ): Promise<void> {
    const [recent, lastIssued] = await Promise.all([
      this.prisma.otpChallenge.count({
        where: {
          destination,
          purpose,
          createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1_000) },
        },
      }),
      this.prisma.otpChallenge.findFirst({
        where: { destination, purpose },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    if (recent >= this.config.get('OTP_MAX_PER_HOUR')) {
      throw new DomainError(ErrorCode.OTP_RATE_LIMITED, 'Too many code requests. Try again later.');
    }
    if (lastIssued && now.getTime() - lastIssued.createdAt.getTime() < cooldownSec * 1_000) {
      throw new DomainError(
        ErrorCode.OTP_RATE_LIMITED,
        'A code was just sent. Wait before requesting another.',
      );
    }
  }

  private generateCode(): string {
    const configured = this.config.get('OTP_DEV_CODE');
    if (configured !== undefined) {
      return configured;
    }
    const length = this.config.get('OTP_LENGTH');
    return randomInt(0, 10 ** length)
      .toString()
      .padStart(length, '0');
  }
}
