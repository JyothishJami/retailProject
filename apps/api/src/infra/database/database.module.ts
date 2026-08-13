import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

import { AppConfig } from '../../config/config.module';

import { PG_POOL } from './database.tokens';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Pool =>
        new Pool({
          connectionString: config.get('DATABASE_URL'),
          max: config.get('DATABASE_POOL_MAX'),
          // Keep client-side timeouts below the load balancer's so a stuck
          // query surfaces as an error instead of a hung request.
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
