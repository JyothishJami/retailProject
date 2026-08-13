import { ZodError, z } from 'zod';

import { ZodValidationPipe } from './zod.pipe';

const schema = z.object({ phone: z.string().min(3) });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed payload with unknown keys stripped', () => {
    expect(pipe.transform({ phone: '+911234567890', extra: 'ignored' })).toEqual({
      phone: '+911234567890',
    });
  });

  it('surfaces a ZodError for the global filter to render', () => {
    expect(() => pipe.transform({ phone: 'x' })).toThrow(ZodError);
  });
});
