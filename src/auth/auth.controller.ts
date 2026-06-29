import { ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse, ApiBody, ApiCookieAuth, ApiBearerAuth } from "@nestjs/swagger";
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Req } from '@nestjs/common'; // add to existing import
import { extractClientIp } from './utils/login-device.util';
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

      // Route each role to its own app: instructors land on the dashboard
      // profile, students on the student auth-callback. The page reads the
      // ?token= and exchanges it for a session. An explicit
      // GOOGLE_SUCCESS_REDIRECT overrides this for every role.
      const successRedirect =
        this.configService.get<string>('GOOGLE_SUCCESS_REDIRECT') ||
        (user.role === UserRole.INSTRUCTOR
          ? `${dashboardApp}/profile`
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
    console.log('DEBUG (API): register endpoint received:', createUserDto);
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
    } = await this.authService.login(loginDto, ip, userAgent);

    if (!isExchangeToken) {
      response.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
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
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    console.log('verify-exchange-token called with token:', token);
    const { token: jwtToken, user: userData } =
      await this.authService.verifyExchangeToken(token);
    console.log('jwtToken to be set in cookie:', jwtToken);

    response.cookie('jwt', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
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
  @ApiOperation({ summary: 'Logout' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  logout(@Res({ passthrough: true }) response: any): ApiResponse<AuthResponse> {
    response.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    return {
      success: true,
      data: {
        message: 'Logout successful',
      },
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
    const code = await this.authService.generateHandoffCode(
      userId as string,
      user.role,
    );
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
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { userId, userRole, token } =
      await this.authService.redeemHandoffCode(dto.code);

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      data: { userId, userRole },
    };
  }

  @Post('validate-invite')
  @ApiOperation({ summary: 'Validate admin invite token' })
  async validateInvite(
    @Body() dto: ValidateInviteDto,
  ): Promise<ApiResponse<{ email: string; firstName: string; lastName: string }>> {
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
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const { token, user } = await this.authService.acceptInvite(dto);

    response.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      data: {
        message: 'Invitation accepted',
        user,
      },
    };
  }
}
