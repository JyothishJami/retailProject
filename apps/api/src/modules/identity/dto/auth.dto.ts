import { z } from 'zod';

/** E.164: leading '+', no leading zero, 8–15 digits total. */
export const phoneE164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'must be an E.164 phone number, e.g. +919876543210');

export const otpRequestSchema = z.object({
  phone: phoneE164,
  purpose: z.enum(['LOGIN', 'REGISTER', 'VERIFY_PHONE']).default('LOGIN'),
});
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const deviceSchema = z.object({
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  pushToken: z.string().trim().min(1).max(512).optional(),
  appVersion: z.string().trim().min(1).max(32).optional(),
  osVersion: z.string().trim().min(1).max(64).optional(),
});

export const otpVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'must be a numeric code'),
  device: deviceSchema.optional(),
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20),
});
export type RefreshDto = z.infer<typeof refreshSchema>;
