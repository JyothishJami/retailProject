import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Cursor pagination (not offset) so that inserts during paging never duplicate
 * or skip rows, and so deep pages stay index-only.
 */
export const cursorPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export interface CursorPage<T> {
  data: T[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/** Opaque base64url cursor: clients must never construct or parse one. */
export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, string | number> {
  const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Malformed cursor');
  }
  return parsed as Record<string, string | number>;
}
