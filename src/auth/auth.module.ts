import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MongooseModule } from '@nestjs/mongoose';
import {
  ExchangeToken,
  ExchangeTokenSchema,
} from './schemas/exchange-token.schema';
import { HandoffCode, HandoffCodeSchema } from './schemas/handoff-code.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import {
  AdminInvite,
  AdminInviteSchema,
} from '../superadmin/schema/admin-invite.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExchangeToken.name, schema: ExchangeTokenSchema },
      { name: HandoffCode.name, schema: HandoffCodeSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: AdminInvite.name, schema: AdminInviteSchema },
    ]),
    UsersModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        // Short-lived on purpose: sessions are kept alive by the rotating
        // refresh token (POST /auth/refresh), not by a long JWT.
        // Keep in sync with ACCESS_TOKEN_TTL_MS in utils/cookie.util.ts.
        signOptions: { expiresIn: '2h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
