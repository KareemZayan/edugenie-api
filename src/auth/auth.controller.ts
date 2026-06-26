import { ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse, ApiBody, ApiCookieAuth, ApiBearerAuth } from "@nestjs/swagger";
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import * as express from 'express';
import { LoginDto } from './dto/login.dto';
import type { ApiResponse } from '../common/interfaces/api-response.interface';
import type { AuthResponse } from './interfaces/auth-response.interface';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { RedeemHandoffCodeDto } from './dto/redeem-handoff-code.dto';
import { AcceptInviteDto, ValidateInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Req } from '@nestjs/common'; // add to existing import
import { extractClientIp } from './utils/login-device.util';

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
@ApiTags('Auth') // 5 requests per 15 mins
export class AuthController {
  constructor(private authService: AuthService) {}

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
