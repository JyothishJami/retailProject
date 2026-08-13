import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validateEnv, type Env } from './env.schema';

/** Typed accessor over Nest's ConfigService so call sites never stringly-type keys. */
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // .env files are a developer convenience only; deployed environments get
      // real environment variables from the platform's secret store.
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: AppConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => new AppConfig(config),
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
