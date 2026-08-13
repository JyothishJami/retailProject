import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { LoggingOtpSender, OtpSender } from './otp/otp-sender';
import { OtpService } from './otp/otp.service';
import { AccessService } from './rbac/access.service';
import { TokenService } from './tokens/token.service';

/**
 * Identity and access. The two guards are global and ordered: authenticate,
 * then check declared permissions. Routes opt out with `@Public()`.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    AccessService,
    { provide: OtpSender, useClass: LoggingOtpSender },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AccessService, TokenService],
})
export class IdentityModule {}
