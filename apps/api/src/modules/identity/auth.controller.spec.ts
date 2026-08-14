import type { Request } from 'express';

import type { Actor } from './actor';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const actor: Actor = { userId: 'user-1', sessionId: 'session-1', grants: [] };

function requestWith(userAgent: unknown = 'jest'): Request {
  return { ip: '203.0.113.4', headers: { 'user-agent': userAgent } } as unknown as Request;
}

describe('AuthController', () => {
  const auth = {
    requestPhoneOtp: jest.fn(),
    verifyPhoneOtp: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    listSessions: jest.fn(),
    revokeSession: jest.fn(),
  };
  const controller = new AuthController(auth as unknown as AuthService);

  beforeEach(() => jest.clearAllMocks());

  it('passes the caller IP and user agent to the OTP request', async () => {
    await controller.requestOtp({ phone: '+919876543210', purpose: 'LOGIN' }, requestWith());

    expect(auth.requestPhoneOtp).toHaveBeenCalledWith('+919876543210', 'LOGIN', {
      ip: '203.0.113.4',
      userAgent: 'jest',
    });
  });

  it('omits a user agent that is not a plain header value', async () => {
    await controller.requestOtp({ phone: '+919876543210', purpose: 'LOGIN' }, requestWith(['a']));

    expect(auth.requestPhoneOtp).toHaveBeenCalledWith('+919876543210', 'LOGIN', {
      ip: '203.0.113.4',
    });
  });

  it('forwards the verification payload including the device', async () => {
    const device = { platform: 'IOS' as const };

    await controller.verifyOtp({ challengeId: 'c1', code: '123456', device }, requestWith());

    expect(auth.verifyPhoneOtp).toHaveBeenCalledWith('c1', '123456', device, {
      ip: '203.0.113.4',
      userAgent: 'jest',
    });
  });

  it('forwards a refresh request', async () => {
    await controller.refresh({ refreshToken: 'token' }, requestWith());

    expect(auth.refresh).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ ip: '203.0.113.4' }),
    );
  });

  it('acts on the calling session for logout, list and logout-all', async () => {
    await controller.logout(actor);
    await controller.logoutAll(actor);
    await controller.listSessions(actor);
    await controller.revokeSession(actor, 'session-2');

    expect(auth.logout).toHaveBeenCalledWith('session-1');
    expect(auth.logoutAll).toHaveBeenCalledWith('user-1');
    expect(auth.listSessions).toHaveBeenCalledWith('user-1', 'session-1');
    expect(auth.revokeSession).toHaveBeenCalledWith('user-1', 'session-2');
  });
});
