import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AppConfig } from '../../config/app-config';

/**
 * The single database client. Feature modules depend on this service rather
 * than constructing their own client, so connection limits stay predictable
 * and slow queries are reported in one place.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      datasources: { db: { url: config.get('DATABASE_URL') } },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    const slowQueryMs = config.get('DB_SLOW_QUERY_MS');

    // Query text only — parameters are omitted because they carry OTP hashes,
    // phone numbers, and addresses.
    this.$on('query' as never, (event: Prisma.QueryEvent) => {
      if (event.duration >= slowQueryMs) {
        this.logger.warn({ durationMs: event.duration, query: event.query }, 'Slow query');
      }
    });
    this.$on('warn' as never, (event: Prisma.LogEvent) => {
      this.logger.warn(event.message);
    });
    this.$on('error' as never, (event: Prisma.LogEvent) => {
      this.logger.error(event.message);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
