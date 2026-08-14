import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { DomainError, ErrorCode, type ApiErrorBody, type ErrorDetail } from '@quickpick/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { requestIdOf } from '../http/request-id';

/** Maps domain error codes onto HTTP status codes in one place. */
const STATUS_BY_CODE: Partial<Record<ErrorCode, HttpStatus>> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: HttpStatus.CONFLICT,
  [ErrorCode.OTP_RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.OTP_INVALID]: HttpStatus.BAD_REQUEST,
  [ErrorCode.OTP_EXPIRED]: HttpStatus.GONE,
  // 423 Locked: the documented status for a temporarily locked account.
  [ErrorCode.ACCOUNT_LOCKED]: 423 as HttpStatus,
  [ErrorCode.REFRESH_TOKEN_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.REFRESH_REUSE_DETECTED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.ORDER_INVALID_TRANSITION]: HttpStatus.CONFLICT,
  [ErrorCode.ORDER_ALREADY_TERMINAL]: HttpStatus.CONFLICT,
  [ErrorCode.ORDER_ACTOR_NOT_PERMITTED]: HttpStatus.FORBIDDEN,
  [ErrorCode.CART_EMPTY]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.CART_BRANCH_MISMATCH]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.ITEM_UNAVAILABLE]: HttpStatus.CONFLICT,
  [ErrorCode.PRICE_CHANGED]: HttpStatus.CONFLICT,
  [ErrorCode.BRANCH_CLOSED]: HttpStatus.CONFLICT,
  [ErrorCode.UPLOAD_REJECTED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.FILE_NOT_SCANNED]: HttpStatus.CONFLICT,
};

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

interface NormalizedError {
  status: number;
  code: ErrorCode | string;
  message: string;
  details?: ErrorDetail[];
}

function normalize(exception: unknown): NormalizedError {
  if (exception instanceof DomainError) {
    return {
      status: STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed.',
      details: exception.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      })),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? exception.message);
    return {
      status,
      code: CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR,
      message: Array.isArray(message) ? message.join('; ') : message,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    // Never leak an unexpected error's message: it may contain SQL or secrets.
    message: 'An unexpected error occurred.',
  };
}

/**
 * Single exit point for error responses so that every failure — expected or not —
 * carries a stable code and the request id the client can quote to support.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = requestIdOf(request);
    const normalized = normalize(exception);

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, requestId, path: request.url }, 'unhandled exception');
    }

    const body: ApiErrorBody = {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {}),
        requestId,
      },
    };
    response.status(normalized.status).json(body);
  }
}
