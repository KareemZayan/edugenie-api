import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UserRole } from '../../common/enums/user-role.enum';

/** Normalized identity passed from Google to AuthService.loginWithGoogle. */
export interface GoogleUser {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  /** Role to use when CREATING a new account (student | instructor only). */
  role: UserRole;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      // Fall back to placeholders so the app still boots when Google isn't
      // configured — the endpoints simply won't complete a real OAuth flow
      // until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
      clientID:
        configService.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret:
        configService.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:5000/api/auth/google/callback',
      scope: ['email', 'profile'],
      // Gives validate() the request so it can read the role the user chose,
      // which Google round-trips back to the callback in `state`.
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account did not provide an email'), undefined);
      return;
    }

    // The requested role is carried in the OAuth `state` param. Only
    // student/instructor are allowed (privileged roles never come from Google).
    const requested = String(req.query?.state ?? '').toLowerCase();
    const role =
      requested === UserRole.INSTRUCTOR
        ? UserRole.INSTRUCTOR
        : UserRole.STUDENT;

    const user: GoogleUser = {
      googleId: profile.id,
      email: email.toLowerCase(),
      firstName: profile.name?.givenName ?? '',
      lastName: profile.name?.familyName ?? '',
      avatar: profile.photos?.[0]?.value ?? null,
      role,
    };
    done(null, user);
  }
}
