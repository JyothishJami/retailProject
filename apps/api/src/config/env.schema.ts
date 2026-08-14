import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

const csvList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.string()));

/**
 * Fail-fast configuration contract. The process refuses to boot on an invalid
 * environment so that a missing secret surfaces at deploy time rather than as a
 * 500 on the first request that needs it.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().default('api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CORS_ORIGINS: csvList.default(''),

    DATABASE_URL: nonEmpty.startsWith('postgres'),
    /** Queries slower than this are logged as warnings with their SQL text. */
    DB_SLOW_QUERY_MS: z.coerce.number().int().min(1).default(500),
    REDIS_URL: nonEmpty.startsWith('redis'),

    // 32 bytes minimum: short HS256 secrets are brute-forceable offline.
    JWT_ACCESS_SECRET: nonEmpty.min(32),
    JWT_REFRESH_SECRET: nonEmpty.min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    /** How long a destination must wait between OTP requests. */
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(60),
    /** OTP requests allowed per destination per hour. */
    OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).default(5),
    /**
     * Development escape hatch: when set, every OTP is this code and nothing is
     * sent. Refused in production by the check below.
     */
    OTP_DEV_CODE: z
      .string()
      .regex(/^\d{4,8}$/)
      .optional(),

    S3_ENDPOINT: nonEmpty,
    S3_REGION: nonEmpty.default('us-east-1'),
    S3_BUCKET: nonEmpty,
    S3_ACCESS_KEY_ID: nonEmpty,
    S3_SECRET_ACCESS_KEY: nonEmpty,
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    ORDER_ACCEPT_SLA_SECONDS: z.coerce.number().int().min(60).default(600),
    ORDER_PICKUP_EXPIRY_HOURS: z.coerce.number().int().min(1).default(24),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'access and refresh secrets must differ in production',
        });
      }
      if (env.OTP_DEV_CODE !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_DEV_CODE'],
          message: 'must not be set in production',
        });
      }
      if (env.CORS_ORIGINS.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'must list at least one allowed origin in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Nest `ConfigModule.validate` hook. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
