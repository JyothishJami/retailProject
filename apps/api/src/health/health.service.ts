import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { PrismaService } from '../infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../infra/redis/redis.tokens';

export type DependencyState = 'up' | 'down';

export interface DependencyCheck {
  status: DependencyState;
  latencyMs: number;
  error?: string;
}

export interface ReadinessReport {
  status: DependencyState;
  checks: Record<'postgres' | 'redis', DependencyCheck>;
}

const CHECK_TIMEOUT_MS = 2_000;

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Readiness deliberately probes dependencies while liveness does not: a
   * database blip should drain traffic from the instance, not have the
   * orchestrator kill and restart a healthy process.
   */
  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis] = await Promise.all([
      this.check('postgres', async () => {
        await this.prisma.$queryRawUnsafe('SELECT 1');
      }),
      this.check('redis', async () => {
        await this.redis.ping();
      }),
    ]);

    const checks = { postgres, redis };
    const status: DependencyState = Object.values(checks).every((check) => check.status === 'up')
      ? 'up'
      : 'down';
    return { status, checks };
  }

  private async check(label: string, probe: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await withTimeout(probe(), label);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn({ dependency: label, err: message }, 'dependency check failed');
      return { status: 'down', latencyMs: Date.now() - startedAt, error: message };
    }
  }
}
