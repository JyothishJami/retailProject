import 'reflect-metadata';

import { Logger } from '@nestjs/common';

import { createApp } from './bootstrap';
import { AppConfig } from './config/config.module';

async function main(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfig);
  const port = config.get('PORT');

  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on port ${port} (${config.get('NODE_ENV')})`);
}

void main();
