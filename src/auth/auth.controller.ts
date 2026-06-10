import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // 1. Verify credentials and Generate Token
    const { token, user: userData } = await this.authService.login(loginDto);
    // 3. Set the JWT in an HttpOnly cookie
    response.cookie('jwt', token, {
      httpOnly: true, // Prevents JavaScript from reading it (XSS protection)
      secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
      sameSite: 'none',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 1 day expiration
    });
    return {
      message: 'Login successful',
      user: userData,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      path: '/',
    });
    return {
      message: 'Logout successful',
    };
  }
}
