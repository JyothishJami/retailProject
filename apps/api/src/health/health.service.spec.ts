import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { HealthService } from './health.service';

// `restoreMocks` resets spies between tests, so re-silence before each one.
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

function makeService(overrides: { query?: jest.Mock; ping?: jest.Mock }): {
  service: HealthService;
  query: jest.Mock;
  ping: jest.Mock;
} {
  const query = overrides.query ?? jest.fn().mockResolvedValue({ rows: [] });
  const ping = overrides.ping ?? jest.fn().mockResolvedValue('PONG');
  const service = new HealthService({ query } as unknown as Pool, { ping } as unknown as Redis);
  return { service, query, ping };
}

describe('HealthService', () => {
  it('reports up when both dependencies answer', async () => {
    const { service, query, ping } = makeService({});

    const report = await service.readiness();

    expect(report.status).toBe('up');
    expect(report.checks.postgres.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports down with the failure reason when Postgres is unreachable', async () => {
    const { service } = makeService({
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const report = await service.readiness();

    expect(report.status).toBe('down');
    expect(report.checks.postgres).toMatchObject({ status: 'down', error: 'connection refused' });
    expect(report.checks.redis.status).toBe('up');
  });

  it('does not hang when a dependency never answers', async () => {
    jest.useFakeTimers();
    const { service } = makeService({ ping: jest.fn().mockReturnValue(new Promise(() => {})) });

    const pending = service.readiness();
    await jest.advanceTimersByTimeAsync(2_000);
    const report = await pending;

    expect(report.status).toBe('down');
    expect(report.checks.redis.error).toMatch(/timed out/);
    jest.useRealTimers();
  });

  it('describes a non-Error rejection instead of leaking undefined', async () => {
    const { service } = makeService({ ping: jest.fn().mockRejectedValue('boom') });

    const report = await service.readiness();

    expect(report.checks.redis.error).toBe('unknown error');
  });
});
