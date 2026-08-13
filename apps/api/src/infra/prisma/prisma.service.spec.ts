import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import type { AppConfig } from '../../config/config.module';

import { PrismaService } from './prisma.service';

type Handlers = Record<string, (event: never) => void>;

function build(slowQueryMs: number): { service: PrismaService; handlers: Handlers } {
  const handlers: Handlers = {};
  jest
    .spyOn(PrismaClient.prototype, '$on')
    .mockImplementation((event: unknown, handler: unknown): void => {
      handlers[event as string] = handler as (payload: never) => void;
    });

  const config = {
    get: (key: string) =>
      ({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        DB_SLOW_QUERY_MS: slowQueryMs,
      })[key],
  } as unknown as AppConfig;

  return { service: new PrismaService(config), handlers };
}

describe('PrismaService', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports a slow query without its parameters', () => {
    const { handlers } = build(500);

    handlers.query?.({
      query: 'SELECT 1',
      params: '["+919876543210"]',
      duration: 750,
      target: 'quaint',
      timestamp: new Date(),
    } as never);

    expect(warn).toHaveBeenCalledWith({ durationMs: 750, query: 'SELECT 1' }, 'Slow query');
  });

  it('stays quiet for a query below the threshold', () => {
    const { handlers } = build(500);

    handlers.query?.({ query: 'SELECT 1', duration: 12 } as unknown as never);

    expect(warn).not.toHaveBeenCalled();
  });

  it('forwards engine warnings and errors to the logger', () => {
    const { handlers } = build(500);
    const event = { message: 'engine said something', target: 'quaint' } as Prisma.LogEvent;

    handlers.warn?.(event as never);
    handlers.error?.(event as never);

    expect(warn).toHaveBeenCalledWith('engine said something');
    expect(error).toHaveBeenCalledWith('engine said something');
  });

  it('connects and disconnects with the module lifecycle', async () => {
    const { service } = build(500);
    const connect = jest
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue(undefined as never);
    const disconnect = jest
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined as never);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
