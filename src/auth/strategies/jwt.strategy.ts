import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../common/enums/user-status.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      // Fail fast: never fall back to a hardcoded default secret.
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          let token: string | null = null;
          if (request && request.cookies) {
            token = (request.cookies as Record<string, string>)['jwt'];
          }
          return token || ExtractJwt.fromAuthHeaderAsBearerToken()(request);
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    id: string;
    role: string;
    firstName?: string;
    lastName?: string;
  }) {
    // Re-check the account on every request so deactivation takes effect
    // immediately instead of waiting for the token to expire.
    const authContext = await this.usersService.findAuthContextById(payload.id);
    if (!authContext || authContext.isDeleted) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (authContext.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return {
      userId: payload.id,
      role: authContext.role,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
  }
}
