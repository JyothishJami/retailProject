import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfig } from '../../config/app-config';
import { REQUEST_ID_HEADER } from '../http/request-id';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Structured JSON in every deployed environment so logs are queryable;
          // pretty output is a local-only convenience.
          transport: config.get('LOG_PRETTY')
            ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss.l' } }
            : undefined,
          // Trust an inbound request id from the edge proxy so one id spans the
          // whole trace, but never let a client inject arbitrary content.
          genReqId: (req: IncomingMessage, res: ServerResponse): string => {
            const inbound = req.headers[REQUEST_ID_HEADER];
            const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
            const id =
              candidate && /^[A-Za-z0-9._-]{1,128}$/.test(candidate) ? candidate : randomUUID();
            res.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          // Health probes would otherwise dominate log volume.
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === '/healthz' || req.url === '/readyz',
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["idempotency-key"]',
              'req.body.password',
              'req.body.otp',
              'req.body.token',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          customProps: () => ({ service: 'api' }),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
