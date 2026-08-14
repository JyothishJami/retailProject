import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Typed accessor over Nest's ConfigService so call sites never stringly-type keys.
 *
 * Lives outside `config.module.ts` because importing that module evaluates
 * `ConfigModule.forRoot()`, which validates the environment at import time.
 */
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
