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
    @Body() loginDto: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    // 1. Verify credentials and Generate Token
    const { token, user: userData } = await this.authService.login(loginDto);
    // 3. Set the JWT in an HttpOnly cookie
    response.cookie('jwt', token, {
      httpOnly: true, // Prevents JavaScript from reading it (XSS protection)
      secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day expiration
    });
    // 4. Return the user info (so Next.js knows what role they are for the redirect!)
    return {
      message: 'Login successful',
      user: userData,
       accessToken: token,
    };
  }
}
