import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  cursorPageQuerySchema,
  decodeCursor,
  encodeCursor,
} from './pagination';

describe('cursor pagination', () => {
  it('defaults the page size and coerces numeric query strings', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
    expect(cursorPageQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('caps the page size so a client cannot ask for the whole table', () => {
    expect(cursorPageQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('round-trips an opaque cursor', () => {
    const cursor = encodeCursor({ createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' });
    expect(cursor).not.toContain('{');
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' });
  });

  it('rejects a cursor that does not decode to an object', () => {
    expect(() => decodeCursor(Buffer.from('[1,2]').toString('base64url'))).toThrow(
      'Malformed cursor',
    );
  });
});
