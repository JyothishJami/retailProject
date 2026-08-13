import { Injectable, Logger } from '@nestjs/common';
import type { OtpChannel } from '@prisma/client';

import { AppConfig } from '../../../config/app-config';

export interface OtpMessage {
  destination: string;
  channel: OtpChannel;
  code: string;
  expiresInSeconds: number;
}

/**
 * Port for the SMS/email provider (docs §17). Phase 2 ships the development
 * adapter; a Twilio/MSG91 adapter binds to the same token later without the
 * auth flow changing.
 */
export abstract class OtpSender {
  abstract send(message: OtpMessage): Promise<void>;
}

/**
 * Development adapter. It logs that a code was sent and, only when an explicit
 * dev code is configured, that the code is the fixed one — a real generated code
 * is never written to the logs.
 */
@Injectable()
export class LoggingOtpSender extends OtpSender {
  private readonly logger = new Logger(LoggingOtpSender.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async send(message: OtpMessage): Promise<void> {
    const usingFixedCode = this.config.get('OTP_DEV_CODE') !== undefined;
    this.logger.log(
      {
        channel: message.channel,
        destination: maskDestination(message.destination),
        expiresInSeconds: message.expiresInSeconds,
        ...(usingFixedCode ? { code: message.code } : {}),
      },
      'OTP dispatched (development sender)',
    );
  }
}

/** Keeps enough of the destination to debug with, not enough to identify a person. */
export function maskDestination(destination: string): string {
  const at = destination.indexOf('@');
  if (at > 0) {
    return `${destination.slice(0, 1)}***${destination.slice(at)}`;
  }
  return `${destination.slice(0, 3)}***${destination.slice(-2)}`;
}
