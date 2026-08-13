import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://quickpick:quickpick@localhost:5432/quickpick',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'quickpick-media',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio12345',
};

describe('validateEnv', () => {
  it('applies documented defaults', () => {
    const env = validateEnv({ ...base });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      LOG_PRETTY: false,
      CORS_ORIGINS: [],
      ACCESS_TOKEN_TTL_SECONDS: 900,
      ORDER_ACCEPT_SLA_SECONDS: 600,
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('coerces numeric strings and splits CSV lists', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example , https://b.example,',
      LOG_PRETTY: 'true',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.LOG_PRETTY).toBe(true);
  });

  it('reports every problem at once with the offending keys', () => {
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: 'short', DATABASE_URL: 'mysql://x' }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = base;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('labels root-level failures explicitly', () => {
    expect(() => validateEnv([] as unknown as Record<string, unknown>)).toThrow(/\(root\)/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });

  it('demands distinct token secrets and explicit CORS origins in production', () => {
    const shared = 'c'.repeat(32);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: shared,
        JWT_REFRESH_SECRET: shared,
        CORS_ORIGINS: 'https://app.example',
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);

    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);

    expect(
      validateEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example' })
        .NODE_ENV,
    ).toBe('production');
  });
});
