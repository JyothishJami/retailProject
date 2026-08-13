import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Reads the id assigned by pino-http, falling back to the raw header. */
export function requestIdOf(request: Request): string {
  const assigned = (request as Request & { id?: unknown }).id;
  if (typeof assigned === 'string' && assigned.length > 0) {
    return assigned;
  }
  const header = request.headers[REQUEST_ID_HEADER];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return 'unknown';
}
