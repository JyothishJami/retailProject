import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { HealthController } from './health.controller';
import type { HealthService, ReadinessReport } from './health.service';

const reportWith = (status: ReadinessReport['status']): ReadinessReport => ({
  status,
  checks: {
    postgres: { status, latencyMs: 1 },
    redis: { status, latencyMs: 1 },
  },
});

describe('HealthController', () => {
  const readiness = jest.fn<Promise<ReadinessReport>, []>();
  const controller = new HealthController({ readiness } as unknown as HealthService);
  const responseStub = (): { res: Response; status: jest.Mock } => {
    const status = jest.fn();
    return { res: { status } as unknown as Response, status };
  };

  it('reports liveness without touching dependencies', () => {
    expect(controller.liveness()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
    });
    expect(readiness).not.toHaveBeenCalled();
  });

  it('returns 200 with the report when every dependency is up', async () => {
    const healthy = reportWith('up');
    readiness.mockResolvedValue(healthy);
    const { res, status } = responseStub();

    await expect(controller.readiness(res)).resolves.toBe(healthy);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('returns 503 so orchestrators stop routing traffic when a dependency is down', async () => {
    readiness.mockResolvedValue(reportWith('down'));
    const { res, status } = responseStub();

    await controller.readiness(res);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
