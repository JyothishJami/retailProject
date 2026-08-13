import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { HealthService, type ReadinessReport } from './health.service';

@ApiTags('health')
// Probes are version-neutral and unprefixed: orchestrator config must not break
// when the API version changes.
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — process is up and the event loop responds' })
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness probe — Postgres and Redis are reachable' })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    res.status(report.status === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
