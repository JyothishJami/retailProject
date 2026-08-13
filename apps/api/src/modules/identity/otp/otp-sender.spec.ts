import { Logger } from '@nestjs/common';

import type { AppConfig } from '../../../config/config.module';

import { LoggingOtpSender, maskDestination } from './otp-sender';

const message = {
  destination: '+919876543210',
  channel: 'SMS' as const,
  code: '123456',
  expiresInSeconds: 300,
};

function senderWith(devCode: string | undefined): LoggingOtpSender {
  return new LoggingOtpSender({ get: () => devCode } as unknown as AppConfig);
}

describe('maskDestination', () => {
  it('keeps only a hint of a phone number', () => {
    expect(maskDestination('+919876543210')).toBe('+91***10');
  });

  it('keeps only the domain of an email address', () => {
    expect(maskDestination('customer@example.com')).toBe('c***@example.com');
  });
});

describe('LoggingOtpSender', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  it('never logs a generated code, and masks the destination', async () => {
    await senderWith(undefined).send(message);

    expect(log.mock.calls[0][0]).toEqual({
      channel: 'SMS',
      destination: '+91***10',
      expiresInSeconds: 300,
    });
  });

  it('logs the code only when a fixed development code is configured', async () => {
    await senderWith('123456').send(message);

    expect(log.mock.calls[0][0]).toMatchObject({ code: '123456' });
  });
});
