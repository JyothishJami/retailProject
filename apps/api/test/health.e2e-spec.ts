import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/infra/redis/redis.tokens';

describe('health probes (e2e)', () => {
  let app: INestApplication;
  const query = jest.fn();
  const ping = jest.fn();

  beforeAll(async () => {
    // Dependencies are stubbed: this suite asserts wiring and HTTP contract, not
    // Postgres/Redis behaviour (that belongs to the Testcontainers suites).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRawUnsafe: query, $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping, quit: jest.fn() })
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue('PONG');
  });

  it('answers liveness without touching dependencies', async () => {
    const response = await request(app.getHttpServer()).get('/healthz').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('answers readiness with per-dependency detail', async () => {
    const response = await request(app.getHttpServer()).get('/readyz').expect(200);

    expect(response.body.status).toBe('up');
    expect(response.body.checks.postgres.status).toBe('up');
    expect(response.body.checks.redis.status).toBe('up');
  });

  it('returns 503 when a dependency is down', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    const response = await request(app.getHttpServer()).get('/readyz').expect(503);

    expect(response.body.checks.postgres).toMatchObject({ status: 'down' });
  });

  it('returns the problem-details envelope with a request id for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(typeof response.body.error.requestId).toBe('string');
  });
});
