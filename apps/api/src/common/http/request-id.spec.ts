import type { Request } from 'express';

import { REQUEST_ID_HEADER, requestIdOf } from './request-id';

const requestWith = (fields: Partial<Request> & { id?: unknown }): Request =>
  ({ headers: {}, ...fields }) as Request;

describe('requestIdOf', () => {
  it('prefers the id assigned by pino-http', () => {
    const request = requestWith({
      id: 'pino-id',
      headers: { [REQUEST_ID_HEADER]: 'header-id' },
    });

    expect(requestIdOf(request)).toBe('pino-id');
  });

  it('falls back to the inbound header when no id was assigned', () => {
    expect(requestIdOf(requestWith({ headers: { [REQUEST_ID_HEADER]: 'header-id' } }))).toBe(
      'header-id',
    );
  });

  it('ignores empty and non-string candidates', () => {
    expect(
      requestIdOf(requestWith({ id: '', headers: { [REQUEST_ID_HEADER]: 'header-id' } })),
    ).toBe('header-id');
    expect(requestIdOf(requestWith({ id: 42, headers: { [REQUEST_ID_HEADER]: ['a', 'b'] } }))).toBe(
      'unknown',
    );
  });

  it('returns a placeholder when nothing correlates the request', () => {
    expect(requestIdOf(requestWith({}))).toBe('unknown');
  });
});
