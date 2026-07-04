import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import * as express from 'express';
import { LoginDto } from './dto/login.dto';
import type { ApiResponse } from '../common/interfaces/api-response.interface';
import type { AuthResponse } from './interfaces/auth-response.interface';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { RedeemHandoffCodeDto } from './dto/redeem-handoff-code.dto';
import { AcceptInviteDto, ValidateInviteDto } from './dto/accept-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto, ResendVerificationDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Req } from '@nestjs/common'; // add to existing import
import { extractClientIp } from './utils/login-device.util';
import { setAuthCookies, clearAuthCookies } from './utils/cookie.util';
import { ConfigService } from '@nestjs/config';
import type { GoogleUser } from './strategies/google.strategy';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { UserRole } from '../common/enums/user-role.enum';

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
@ApiTags('Auth') // 5 requests per 15 mins
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // ── Google OAuth ──────────────────────────────────────────────────────────

  /**
   * Step 1. The browser hits this; the Google passport guard immediately
   * 302-redirects to Google's consent screen. No JSON is returned.
   */
  @Get('google')
  @SkipThrottle()
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary:
      'Start Google sign-in — 302 redirects to Google. Pass ?role=instructor or ?role=student to choose the role for new accounts (default student).',
  })
  googleAuth(): void {
    // Intentionally empty: GoogleOAuthGuard performs the redirect to Google and
    // forwards the chosen role as the OAuth `state` parameter.
  }

  /**
   * Step 2. Google redirects back here with a `code`. The guard exchanges it and
   * populates req.user; we find-or-create the account, mint a single-use
   * exchange token, and 302-redirect to the frontend with it. We never return
   * the JWT as JSON here (the browser is mid-redirect) — the frontend swaps the
   * token for a JWT via POST /auth/verify-exchange-token.
   */
  @Get('google/callback')
  @SkipThrottle()
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary:
      'Google OAuth callback — 302 redirects to the frontend with a one-time ?token=',
  })
  async googleCallback(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ): Promise<void> {
    const studentApp =
      this.configService.get<string>('STUDENT_APP_URL') ||
      'http://localhost:3000';
    const dashboardApp =
      this.configService.get<string>('DASHBOARD_URL') ||
      'http://localhost:4200';

    try {
      const { exchangeToken, user } = await this.authService.loginWithGoogle(
        req.user as GoogleUser,
      );

      // Route each role to its own app's auth-callback page: instructors to the
      // dashboard, students to the student app. That page reads the ?token= and
      // exchanges it for a session (POST /auth/verify-exchange-token), then
      // routes on to the role's home. An explicit GOOGLE_SUCCESS_REDIRECT
      // overrides this for every role.
      const successRedirect =
        this.configService.get<string>('GOOGLE_SUCCESS_REDIRECT') ||
        (user.role === UserRole.INSTRUCTOR
          ? `${dashboardApp}/auth-callback`
          : `${studentApp}/auth-callback`);

      res.redirect(
        `${successRedirect}?token=${encodeURIComponent(exchangeToken)}` +
          `&role=${encodeURIComponent(user.role)}`,
      );
    } catch (err) {
      this.logger.error(
        'Google sign-in failed',
        err instanceof Error ? err.stack : String(err),
      );
      res.redirect(`${studentApp}/login?error=google_auth_failed`);
    }
  }

  @Post('register')
  @ApiOperation({ summary: 'Register' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: CreateUserDto })
  async register(
    @Body() createUserDto: CreateUserDto,
  ): Promise<ApiResponse<AuthResponse>> {
    const result = await this.authService.register(createUserDto);
    return {
      success: true,
      data: { message: result.message },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Login' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: LoginDto })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const ip = extractClientIp(request);
    const userAgent = request.headers['user-agent'] || '';

    const {
      token,
      user: userData,
      isExchangeToken,
      refreshToken,
      refreshTtlMs,
    } = await this.authService.login(loginDto, ip, userAgent);

    if (!isExchangeToken) {
      setAuthCookies(response, {
        accessToken: token,
        refreshToken,
        refreshTtlMs,
      });
    }

    return {
      success: true,
      data: {
        message: 'Login successful',
        user: userData,
        exchangeToken: token,
      },
    };
  }

  @Post('verify-exchange-token')
  @ApiOperation({ summary: 'Verify exchange token' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ schema: { type: 'string' } })
  async verifyExchangeToken(
    @Body('token') token: string,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const {
      token: jwtToken,
      user: userData,
      refreshToken,
      refreshTtlMs,
    } = await this.authService.verifyExchangeToken(
      token,
      extractClientIp(request),
      request.headers['user-agent'] || '',
    );

    setAuthCookies(response, {
      accessToken: jwtToken,
      refreshToken,
      refreshTtlMs,
    });

    return {
      success: true,
      data: {
        message: 'Exchange token verified successfully',
        user: userData,
        token: jwtToken,
      },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({
    summary: 'Logout — clears cookies and revokes the session server-side',
  })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  async logout(
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    // Revoke the refresh session server-side so the cookie can't be replayed.
    const refreshCookie = (request.cookies as Record<string, string>)?.[
      'refreshToken'
    ];
    await this.authService.revokeRefreshToken(refreshCookie);

    clearAuthCookies(response);
    return {
      success: true,
      data: {
        message: 'Logout successful',
      },
    };
  }

  /**
   * Rotates the refresh token and mints a fresh 15-min access JWT. Deliberately
   * NOT behind JwtAuthGuard: this is called precisely when the access token has
   * expired — auth comes from the httpOnly refresh cookie instead.
   */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary:
      'Exchange the refresh-token cookie for a new access + refresh pair',
  })
  @SwaggerApiResponse({ status: 200, description: 'Session refreshed.' })
  @SwaggerApiResponse({
    status: 401,
    description: 'Invalid/expired/reused refresh token.',
  })
  async refresh(
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const refreshCookie = (request.cookies as Record<string, string>)?.[
      'refreshToken'
    ];

    try {
      const { accessToken, refreshToken, refreshTtlMs, user } =
        await this.authService.refresh(
          refreshCookie,
          extractClientIp(request),
          request.headers['user-agent'] || '',
        );

      setAuthCookies(response, { accessToken, refreshToken, refreshTtlMs });
      return {
        success: true,
        data: { message: 'Session refreshed', user },
      };
    } catch (err) {
      // A dead refresh token means the session is over — drop both cookies so
      // the client stops retrying with them.
      clearAuthCookies(response);
      throw err;
    }
  }

  /** Revokes every live refresh session for the current user ("log out everywhere"). */
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  async logoutAll(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse & { revoked: number }>> {
    const { revoked } = await this.authService.revokeAllSessions(user.userId);
    clearAuthCookies(response);
    return {
      success: true,
      data: { message: 'All sessions revoked', revoked },
    };
  }

  @Post('handoff-code')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate handoff code' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async generateHandoffCode(
    @CurrentUser()
    user: {
      userId?: string;
      id?: string;
      _id?: string;
      role: string;
    },
  ) {
    console.log('generateHandoffCode - user payload:', user);
    const userId = user.userId || user.id || user._id;
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    const code = await this.authService.generateHandoffCode(userId, user.role);
    return { code, expiresIn: 30 };
  }

  @Post('redeem-code')
  @ApiOperation({ summary: 'Redeem handoff code' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: RedeemHandoffCodeDto })
  async redeemHandoffCode(
    @Body() dto: RedeemHandoffCodeDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { userId, userRole, token, refreshToken, refreshTtlMs } =
      await this.authService.redeemHandoffCode(
        dto.code,
        extractClientIp(request),
        request.headers['user-agent'] || '',
      );

    setAuthCookies(res, { accessToken: token, refreshToken, refreshTtlMs });

    return {
      success: true,
      data: { userId, userRole },
    };
  }

  @Post('validate-invite')
  @ApiOperation({ summary: 'Validate admin invite token' })
  async validateInvite(
    @Body() dto: ValidateInviteDto,
  ): Promise<
    ApiResponse<{ email: string; firstName: string; lastName: string }>
  > {
    const data = await this.authService.validateInvite(dto.token);
    return { success: true, data };
  }

  // Accepts an admin invitation, provisions the account, and logs the new admin
  // in by setting the session cookie.
  @HttpCode(HttpStatus.OK)
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept admin invite' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const { token, user, refreshToken, refreshTtlMs } =
      await this.authService.acceptInvite(
        dto,
        extractClientIp(request),
        request.headers['user-agent'] || '',
      );

    setAuthCookies(response, {
      accessToken: token,
      refreshToken,
      refreshTtlMs,
    });

    return {
      success: true,
      data: {
        message: 'Invitation accepted',
        user,
      },
    };
  }

  // ── Email verification + password reset (Phase 4) ─────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify an email-verification token' })
  @ApiBody({ type: VerifyEmailDto })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const ip = extractClientIp(request);
    const userAgent = request.headers['user-agent'] || '';
    const { message, token, isExchangeToken, refreshToken, refreshTtlMs, user } =
      await this.authService.verifyEmail(dto.token, ip, userAgent);

    // Staff/instructors get their session cookies now; students finalize at
    // verify-exchange-token — the same handshake as login.
    if (!isExchangeToken && token) {
      setAuthCookies(response, {
        accessToken: token,
        refreshToken,
        refreshTtlMs,
      });
    }

    return {
      success: true,
      data: { message, user, exchangeToken: token },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the email-verification link' })
  @ApiBody({ type: ResendVerificationDto })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.authService.resendVerification(dto.email);
    return { success: true, data: result };
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset link' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.authService.forgotPassword(dto.email);
    return { success: true, data: result };
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset a password with a valid token' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.authService.resetPassword(
      dto.token,
      dto.password,
    );
    return { success: true, data: result };
  }
}
