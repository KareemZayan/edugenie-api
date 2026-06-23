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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } }) // 5 requests per 15 mins
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto): Promise<ApiResponse<AuthResponse>> {
    const result = await this.authService.register(createUserDto);
    return {
      success: true,
      data: { message: result.message }
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const { token, user: userData, isExchangeToken } = await this.authService.login(loginDto);

    if (!isExchangeToken) {
      response.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
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
      }
    };
  }

  @Post('verify-exchange-token')
  async verifyExchangeToken(
    @Body('token') token: string,
    @Res({ passthrough: true }) response: express.Response,
  ): Promise<ApiResponse<AuthResponse>> {
    const { token: jwtToken, user: userData } = await this.authService.verifyExchangeToken(token);

    response.cookie('jwt', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      success: true,
      data: {
        message: 'Exchange token verified successfully',
        user: userData,
        token: jwtToken,
      }
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) response: any): ApiResponse<AuthResponse> {
    response.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      path: '/',
    });
    return {
      success: true,
      data: {
        message: 'Logout successful',
      }
    };
  }

  @Post('handoff-code')
  @UseGuards(JwtAuthGuard)
  async generateHandoffCode(
    @CurrentUser() user: { userId: string; role: string },
    @Res() res: express.Response
  ) {
    const userId = user.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    const code = await this.authService.generateHandoffCode(
      userId, user.role
    );
    return res.json({ code, expiresIn: 30 });
  }

  @Post('redeem-code')
  async redeemHandoffCode(
    @Body() dto: RedeemHandoffCodeDto,
    @Res() res: express.Response
  ) {
    const { userId, userRole, token } = await this.authService.redeemHandoffCode(dto.code);

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      data: { userId, userRole }
    });
  }
}
