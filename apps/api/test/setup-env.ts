// Deterministic configuration for the e2e suite: applied before Nest modules are
// imported so ConfigModule validation sees a complete environment.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://quickpick:quickpick@localhost:5432/quickpick_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'quickpick-media',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio12345',
});
