import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainError, ErrorCode } from '@quickpick/shared';
import { z } from 'zod';

import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status: number;
  body: { error: { code: string; message: string; details?: unknown; requestId: string } };
}

function hostFor(requestId?: string): { host: ArgumentsHost; captured: Captured } {
  const captured = { status: 0, body: undefined } as unknown as Captured;
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured['body']) {
      captured.body = body;
    },
  };
  const request = { url: '/api/v1/orders', headers: {}, ...(requestId ? { id: requestId } : {}) };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps a domain error onto its documented status and echoes the request id', () => {
    const { host, captured } = hostFor('req-1');

    filter.catch(
      new DomainError(ErrorCode.ORDER_INVALID_TRANSITION, 'Cannot pack an accepted order.', [
        { field: 'status', issue: 'expected PACKING' },
      ]),
      host,
    );

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body.error).toEqual({
      code: ErrorCode.ORDER_INVALID_TRANSITION,
      message: 'Cannot pack an accepted order.',
      details: [{ field: 'status', issue: 'expected PACKING' }],
      requestId: 'req-1',
    });
  });

  it('falls back to 400 for a domain code without an explicit status', () => {
    const { host, captured } = hostFor('req-2');

    filter.catch(new DomainError(ErrorCode.INTERNAL_ERROR, 'unmapped'), host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('flattens Zod issues into field-level details', () => {
    const { host, captured } = hostFor('req-3');
    const parsed = z.object({ quantity: z.number().int() }).safeParse({ quantity: 1.5 });

    filter.catch(parsed.success ? new Error('unreachable') : parsed.error, host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(captured.body.error.details).toEqual([
      { field: 'quantity', issue: expect.stringContaining('integer') },
    ]);
  });

  it('translates Nest HTTP exceptions, including array messages', () => {
    const notFound = hostFor('req-4');
    filter.catch(new NotFoundException('Order not found'), notFound.host);
    expect(notFound.captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(notFound.captured.body.error).toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Order not found',
    });

    const forbidden = hostFor('req-5');
    filter.catch(new ForbiddenException(['a', 'b']), forbidden.host);
    expect(forbidden.captured.body.error.message).toBe('a; b');
  });

  it('handles HTTP exceptions carrying a string or message-less payload', () => {
    const plain = hostFor('req-6');
    filter.catch(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT), plain.host);
    expect(plain.captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(plain.captured.body.error).toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'teapot',
    });

    const objectPayload = hostFor('req-7');
    filter.catch(
      new HttpException({ statusCode: 409, reason: 'stale' }, HttpStatus.CONFLICT),
      objectPayload.host,
    );
    expect(objectPayload.captured.body.error).toMatchObject({
      code: ErrorCode.CONFLICT,
      message: 'Http Exception',
    });
  });

  it('hides internals of unexpected errors and still returns a request id', () => {
    const { host, captured } = hostFor();
    const internals = filter as unknown as { logger: { error: (...args: unknown[]) => void } };
    jest.spyOn(internals.logger, 'error').mockImplementation(() => undefined);

    filter.catch(new Error('password=hunter2 in connection string'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.error).toEqual({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
      requestId: 'unknown',
    });
  });
});
