import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/validation/zod.pipe';

import { CurrentActor, type Actor } from './actor';
import {
  AuthService,
  type AuthResult,
  type RequestContext,
  type SessionSummary,
  type TokenPair,
} from './auth.service';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type OtpRequestDto,
  type OtpVerifyDto,
  type RefreshDto,
} from './dto/auth.dto';
import type { OtpChallengeIssued } from './otp/otp.service';
import { Public } from './rbac/permissions.decorator';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequestDto,
    @Req() request: Request,
  ): Promise<OtpChallengeIssued> {
    return this.auth.requestPhoneOtp(body.phone, body.purpose, contextOf(request));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerifyDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.verifyPhoneOtp(body.challengeId, body.code, body.device, contextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto,
    @Req() request: Request,
  ): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken, contextOf(request));
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentActor() actor: Actor): Promise<void> {
    await this.auth.logout(actor.sessionId);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentActor() actor: Actor): Promise<{ revoked: number }> {
    return this.auth.logoutAll(actor.userId);
  }

  @ApiBearerAuth()
  @Get('sessions')
  listSessions(@CurrentActor() actor: Actor): Promise<SessionSummary[]> {
    return this.auth.listSessions(actor.userId, actor.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(actor.userId, sessionId);
  }
}

function contextOf(request: Request): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
  };
}
