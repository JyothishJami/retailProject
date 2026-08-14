import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppConfig } from './app-config';
import { validateEnv, type Env } from './env.schema';

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
