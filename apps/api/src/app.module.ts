import { Module } from '@nestjs/common';

import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';

/**
 * Composition root of the modular monolith (ADR-1). Feature modules
 * (identity, catalog, orders, chat, …) are registered here as they land; each
 * one owns its data and exposes a narrow public surface to the others.
 */
@Module({
  imports: [AppConfigModule, LoggingModule, DatabaseModule, RedisModule, HealthModule],
})
export class AppModule {}
