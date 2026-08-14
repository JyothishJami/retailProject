import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Parses (and thereby narrows and strips) a payload with the zod schema that
 * documents it. Failures surface as `ZodError`, which the global filter renders
 * as `VALIDATION_FAILED` with per-field details.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
