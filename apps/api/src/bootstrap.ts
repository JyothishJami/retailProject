import { VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfig } from './config/config.module';

/**
 * Applies the HTTP contract (prefix, versioning, error envelope, CORS, headers).
 * Tests call this too, so the e2e suite exercises the same pipeline as production.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfig);

  app.use(helmet());
  app.setGlobalPrefix(config.get('API_PREFIX'), { exclude: ['healthz', 'readyz'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = config.get('CORS_ORIGINS');
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('QuickPick API')
        .setDescription('Pre-order and pickup platform API')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  return app;
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  return configureApp(app);
}
