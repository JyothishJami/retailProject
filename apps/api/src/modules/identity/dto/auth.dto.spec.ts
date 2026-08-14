import { otpRequestSchema, otpVerifySchema, phoneE164, refreshSchema } from './auth.dto';

describe('phoneE164', () => {
  it('accepts an international number and trims surrounding space', () => {
    expect(phoneE164.parse('  +919876543210 ')).toBe('+919876543210');
  });

  it('rejects local, zero-prefixed, too short and non-numeric forms', () => {
    for (const value of ['9876543210', '+09876543210', '+9198765', '+91 98765 43210', 'abc']) {
      expect(phoneE164.safeParse(value).success).toBe(false);
    }
  });
});

describe('otpRequestSchema', () => {
  it('defaults the purpose to LOGIN', () => {
    expect(otpRequestSchema.parse({ phone: '+919876543210' })).toEqual({
      phone: '+919876543210',
      purpose: 'LOGIN',
    });
  });

  it('rejects an unknown purpose', () => {
    expect(
      otpRequestSchema.safeParse({ phone: '+919876543210', purpose: 'ANYTHING' }).success,
    ).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  const challengeId = '0f1d0f3e-1b1a-4c5d-8e9f-0a1b2c3d4e5f';

  it('accepts a numeric code with an optional device', () => {
    expect(
      otpVerifySchema.parse({
        challengeId,
        code: '123456',
        device: { platform: 'ANDROID', appVersion: '1.0.0' },
      }),
    ).toMatchObject({ device: { platform: 'ANDROID' } });
  });

  it('rejects a non-uuid challenge, a non-numeric code and an unknown platform', () => {
    expect(otpVerifySchema.safeParse({ challengeId: 'nope', code: '123456' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ challengeId, code: '12a456' }).success).toBe(false);
    expect(
      otpVerifySchema.safeParse({ challengeId, code: '123456', device: { platform: 'WATCH' } })
        .success,
    ).toBe(false);
  });
});

describe('refreshSchema', () => {
  it('requires a token of plausible length', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'short' }).success).toBe(false);
    expect(refreshSchema.parse({ refreshToken: 'x'.repeat(43) }).refreshToken).toHaveLength(43);
  });
});
