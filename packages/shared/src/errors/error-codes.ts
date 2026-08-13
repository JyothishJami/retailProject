/**
 * Stable, machine-readable error codes returned in the `error.code` field of the
 * problem-details envelope. Clients branch on these, never on message text, so
 * codes are append-only: never rename or reuse one.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',

  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',

  ORDER_INVALID_TRANSITION: 'ORDER_INVALID_TRANSITION',
  ORDER_ACTOR_NOT_PERMITTED: 'ORDER_ACTOR_NOT_PERMITTED',
  ORDER_ALREADY_TERMINAL: 'ORDER_ALREADY_TERMINAL',

  CART_EMPTY: 'CART_EMPTY',
  CART_BRANCH_MISMATCH: 'CART_BRANCH_MISMATCH',
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  PRICE_CHANGED: 'PRICE_CHANGED',
  BRANCH_CLOSED: 'BRANCH_CLOSED',

  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  FILE_NOT_SCANNED: 'FILE_NOT_SCANNED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  issue: string;
}

/** Wire shape of every non-2xx API response body. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
}

/** Base class for errors that map onto a documented API error code. */
export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}
