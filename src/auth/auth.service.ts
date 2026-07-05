import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/schema/user.schema';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import * as bcrypt from 'bcrypt';
import { UserSerializer } from '../users/serializers/user.serializer';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ExchangeToken,
  ExchangeTokenDocument,
} from './schemas/exchange-token.schema';
import {
  HandoffCode,
  HandoffCodeDocument,
} from './schemas/handoff-code.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import {
  AdminInvite,
  AdminInviteDocument,
} from '../superadmin/schema/admin-invite.schema';
import * as crypto from 'crypto';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import type { GoogleUser } from './strategies/google.strategy';
import {
  getFingerprint,
  parseDevice,
  getLocationFromIp,
} from './utils/login-device.util';

// Refresh-token session lifetimes. The horizon is FIXED per session: rotations
// carry the original expiresAt forward, so a session can never outlive the
// lifetime chosen at login (no infinite sliding renewal).
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// A rotated token replayed within this window is a benign race (two tabs /
// parallel serverless proxy invocations refreshing at once), not theft.
const ROTATION_GRACE_MS = 30 * 1000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTtlMs: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    private mailService: MailService,
    private configService: ConfigService,
    @InjectModel(ExchangeToken.name)
    private exchangeTokenModel: Model<ExchangeTokenDocument>,
    @InjectModel(HandoffCode.name)
    private handoffCodeModel: Model<HandoffCodeDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(AdminInvite.name)
    private adminInviteModel: Model<AdminInviteDocument>,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // SECURITY: public registration may only create student/instructor
    // accounts. admin/superadmin are provisioned via the invite flow only.
    const role =
      createUserDto.role === UserRole.INSTRUCTOR
        ? UserRole.INSTRUCTOR
        : UserRole.STUDENT;

    await this.usersService.createUser({
      ...createUserDto,
      role,
      password: hashedPassword,
    });

    // Welcome + email-verification link. Guarded so a mail failure never fails
    // the registration itself.
    try {
      await this.issueEmailVerification(
        createUserDto.email,
        createUserDto.firstName,
        role,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send verification email to ${createUserDto.email}: ${
          (err as Error)?.message
        }`,
      );
    }

    return {
      message: 'User registered successfully',
    };
  }

  // ── Email verification + password reset (Phase 4) ─────────────────────────

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Where a role's email links (verify / password-reset) should open.
   * Students AND instructors sign in on the student web app, so both land
   * there; only admins/superadmins use the dashboard. Keep this in sync with
   * where each role actually authenticates.
   */
  private appBaseUrlForRole(role: UserRole): string {
    const student =
      this.configService.get<string>('STUDENT_APP_URL') ||
      'http://localhost:3000';
    const dashboard =
      this.configService.get<string>('DASHBOARD_URL') ||
      'http://localhost:4200';
    return role === UserRole.ADMIN || role === UserRole.SUPERADMIN
      ? dashboard
      : student;
  }

  /** Generates + stores a verification token and emails the welcome/verify link. */
  private async issueEmailVerification(
    email: string,
    firstName: string,
    role: UserRole,
  ): Promise<void> {
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresInHours = 24;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await this.usersService.setEmailVerificationCode(
      email,
      this.hashToken(raw),
      expiresAt,
    );
    const verifyUrl = `${this.appBaseUrlForRole(role)}/verify-email?token=${raw}`;
    await this.mailService.sendWelcomeVerifyEmail({
      to: email,
      firstName,
      verifyUrl,
      expiresInHours,
    });
  }

  /**
   * Confirms an email-verification token AND signs the user in, so a freshly
   * verified user lands authenticated instead of being bounced to the login
   * form. Returns the same session shape as `login`.
   */
  async verifyEmail(
    rawToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{
    message: string;
    token: string;
    isExchangeToken: boolean;
    refreshToken?: string;
    refreshTtlMs?: number;
    user: UserSerializer;
  }> {
    const user = await this.usersService.consumeEmailVerification(
      this.hashToken(rawToken),
    );
    if (!user) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }

    // A deactivated account can verify its email but must not get a session.
    if (user.isDeleted || user.status !== UserStatus.ACTIVE) {
      return {
        message: 'Email verified successfully',
        token: '',
        isExchangeToken: true,
        user: this.serializeUser(user),
      };
    }

    // rememberMe:false — a fresh device arriving straight from an email link.
    const session = await this.issueSession(user, {
      rememberMe: false,
      ip,
      userAgent,
    });
    return {
      message: 'Email verified successfully',
      ...session,
      user: this.serializeUser(user),
    };
  }

  /** Re-sends a verification link. Response is generic to avoid leaking accounts. */
  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (user && !user.isVerified) {
      try {
        await this.issueEmailVerification(
          user.email,
          user.firstName,
          user.role,
        );
      } catch (err) {
        this.logger.error(
          `Resend verification failed: ${(err as Error)?.message}`,
        );
      }
    }
    return {
      message:
        'If an unverified account exists for that email, a new verification link has been sent.',
    };
  }

  /** Starts a password reset. Always returns a generic message (no account leak). */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresInMinutes = 60;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const user = await this.usersService.setPasswordResetCode(
      email,
      this.hashToken(raw),
      expiresAt,
    );
    if (user) {
      const resetUrl = `${this.appBaseUrlForRole(user.role)}/reset-password?token=${raw}`;
      try {
        await this.mailService.sendPasswordResetEmail({
          to: user.email,
          firstName: user.firstName,
          resetUrl,
          expiresInMinutes,
        });
      } catch (err) {
        this.logger.error(
          `Password reset email failed: ${(err as Error)?.message}`,
        );
      }
    }
    return {
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };
  }

  /** Completes a password reset with a valid token. */
  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const newHash = await bcrypt.hash(newPassword, 10);
    const user = await this.usersService.consumePasswordReset(
      this.hashToken(rawToken),
      newHash,
    );
    if (!user) {
      throw new BadRequestException(
        'This reset link is invalid or has expired.',
      );
    }
    try {
      await this.mailService.sendPasswordChangedEmail({
        to: user.email,
        firstName: user.firstName,
      });
    } catch (err) {
      this.logger.error(
        `Password-changed email failed: ${(err as Error)?.message}`,
      );
    }
    return { message: 'Your password has been reset. You can now log in.' };
  }

  async generateExchangeToken(
    userId: Types.ObjectId,
    rememberMe = false,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.exchangeTokenModel.create({ userId, token, rememberMe });
    return token;
  }

  // ── Rotating refresh tokens ────────────────────────────────────────────────

  /** Signs the short-lived access JWT with the payload shape every guard expects. */
  private signAccessToken(
    user: {
      _id: Types.ObjectId | string;
      role: string;
      firstName: string;
      lastName: string;
      avatar?: string | null;
    },
    roleOverride?: string,
  ): string {
    return this.jwtService.sign({
      id: user._id,
      role: roleOverride ?? user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar ?? null,
    });
  }

  /**
   * Serializes a Mongoose user document into the API response shape.
   * `Document.toObject()` is typed `any` by Mongoose, so we assert the plain
   * object back to the serializer's input shape to keep the call type-safe.
   */
  private serializeUser(user: User): UserSerializer {
    return new UserSerializer(user.toObject() as Partial<UserSerializer>);
  }

  /**
   * Creates a refresh token (hash-at-rest) and returns the raw value.
   * A fresh `family` starts a new session chain; passing an existing family +
   * expiresAt continues a chain on rotation (fixed session horizon).
   */
  private async issueRefreshToken(params: {
    userId: Types.ObjectId;
    family?: string;
    expiresAt?: Date;
    rememberMe?: boolean;
    ip?: string;
    userAgent?: string;
  }): Promise<{ raw: string; family: string; expiresAt: Date }> {
    const raw = crypto.randomBytes(32).toString('hex');
    const family = params.family ?? crypto.randomUUID();
    const expiresAt =
      params.expiresAt ??
      new Date(
        Date.now() +
          (params.rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_MS),
      );

    await this.refreshTokenModel.create({
      userId: params.userId,
      tokenHash: this.hashToken(raw),
      family,
      device: parseDevice(params.userAgent ?? ''),
      ip: params.ip ?? '',
      expiresAt,
    });

    return { raw, family, expiresAt };
  }

  /** Starts a brand-new session chain and signs the matching access token. */
  private async issueTokenPair(
    user: {
      _id: Types.ObjectId;
      role: string;
      firstName: string;
      lastName: string;
      avatar?: string | null;
    },
    opts: { rememberMe?: boolean; ip?: string; userAgent?: string } = {},
  ): Promise<IssuedTokens> {
    const { raw, expiresAt } = await this.issueRefreshToken({
      userId: user._id,
      rememberMe: opts.rememberMe,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return {
      accessToken: this.signAccessToken(user),
      refreshToken: raw,
      refreshTtlMs: expiresAt.getTime() - Date.now(),
    };
  }

  /**
   * Rotates a refresh token: revokes the presented one, issues a successor in
   * the same family, and signs a fresh access JWT.
   *
   * Reuse of an already-rotated token OUTSIDE the grace window means the token
   * leaked (someone replayed a stale copy) — the entire family is revoked so
   * both the thief's and the victim's copies die together.
   */
  async refresh(
    rawToken: string,
    ip: string,
    userAgent: string,
  ): Promise<IssuedTokens & { user: UserSerializer }> {
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const doc = await this.refreshTokenModel.findOne({
      tokenHash: this.hashToken(rawToken),
    });
    if (!doc) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (doc.expiresAt.getTime() <= Date.now()) {
      // TTL monitor may lag; treat as expired either way.
      throw new UnauthorizedException('Refresh token expired');
    }

    let benignRace = false;
    if (doc.revokedAt) {
      if (Date.now() - doc.revokedAt.getTime() < ROTATION_GRACE_MS) {
        // Two tabs (or parallel serverless proxy invocations) refreshed with
        // the same token at once. The loser lands here milliseconds later —
        // not theft. Issue it its own successor in the same family.
        benignRace = true;
      } else {
        await this.revokeFamily(doc.family);
        this.logger.warn(
          `Refresh-token reuse detected for user ${doc.userId.toString()} — family revoked`,
        );
        throw new UnauthorizedException('Session revoked');
      }
    }

    if (!benignRace) {
      // Atomic rotate: if another request revoked it between the read and this
      // write, fall back to the benign-race path instead of double-rotating.
      const rotated = await this.refreshTokenModel.findOneAndUpdate(
        { _id: doc._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      if (!rotated) {
        benignRace = true;
      }
    }

    const user = await this.usersService.findById(doc.userId.toString());
    if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
      await this.revokeFamily(doc.family);
      throw new UnauthorizedException('Account is no longer active');
    }

    const { raw, expiresAt } = await this.issueRefreshToken({
      userId: doc.userId,
      family: doc.family,
      expiresAt: doc.expiresAt, // fixed horizon — rotation never extends the session
      ip,
      userAgent,
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: raw,
      refreshTtlMs: expiresAt.getTime() - Date.now(),
      user: this.serializeUser(user),
    };
  }

  private async revokeFamily(family: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  /** Server-side logout: kills the presented session chain. Silent no-op if absent. */
  async revokeRefreshToken(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const doc = await this.refreshTokenModel.findOne({
      tokenHash: this.hashToken(rawToken),
    });
    if (doc) {
      await this.revokeFamily(doc.family);
    }
  }

  /** "Log out everywhere": revokes every live session for the user. */
  async revokeAllSessions(userId: string): Promise<{ revoked: number }> {
    const result = await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return { revoked: result.modifiedCount };
  }

  /**
   * Complete a Google OAuth sign-in: find-or-create the account, then mint a
   * single-use exchange token (the same one the student SSO flow uses). The
   * controller redirects to the frontend with this token; the frontend swaps it
   * for a real JWT via POST /auth/verify-exchange-token.
   */
  async loginWithGoogle(
    googleUser: GoogleUser,
  ): Promise<{ exchangeToken: string; user: User }> {
    const user = await this.usersService.findOrCreateGoogleUser(googleUser);

    // SECURITY: deactivated/suspended/blocked accounts must not be able to log in.
    if (user.isDeleted) {
      throw new ForbiddenException({ message: 'This account has been deactivated.', deactivated: true });
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({
        message: 'This account has been blocked for violating platform policies.',
        isBlocked: true,
      });
    }
    if (user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException({
        message: 'This account has been deactivated. Please contact support.',
        deactivated: true,
      });
    }

    const exchangeToken = await this.generateExchangeToken(user._id);
    return { exchangeToken, user };
  }

  async verifyExchangeToken(
    token: string,
    ip = '',
    userAgent = '',
  ): Promise<IssuedTokens & { token: string; user: UserSerializer }> {
    const exchangeToken = await this.exchangeTokenModel.findOneAndDelete({
      token,
    });
    if (!exchangeToken) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.usersService.findById(exchangeToken.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.issueTokenPair(user, {
      rememberMe: exchangeToken.rememberMe,
      ip,
      userAgent,
    });

    return {
      ...tokens,
      token: tokens.accessToken,
      user: this.serializeUser(user),
    };
  }

  async login(
    loginDto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<{
    token: string;
    user: UserSerializer;
    isExchangeToken: boolean;
    refreshToken?: string;
    refreshTtlMs?: number;
  }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isDeleted) {
      throw new ForbiddenException('This account has been deactivated.');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // SECURITY: deactivated/suspended/blocked accounts must not be able to log in.
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({
        message: 'This account has been blocked for violating platform policies.',
        isBlocked: true,
      });
    }
    if (user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException({
        message: 'This account has been deactivated. Please contact support.',
        deactivated: true,
      });
    }

    // The email must be verified before the first sign-in. The `code` lets the
    // client detect this specific case and offer a "resend verification" action.
    if (!user.isVerified) {
      throw new ForbiddenException({
        message:
          'Please verify your email to sign in. Check your inbox for the verification link we sent you.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const { token, isExchangeToken, refreshToken, refreshTtlMs } =
      await this.issueSession(user, {
        rememberMe: loginDto.rememberMe,
        ip,
        userAgent,
      });

    // Don't block the login response on geo lookups / notification creation
    this.checkLoginDevice(user, ip, userAgent).catch((err) =>
      this.logger.error('Login device check failed', err),
    );

    return {
      token,
      isExchangeToken,
      refreshToken,
      refreshTtlMs,
      user: this.serializeUser(user),
    };
  }

  /**
   * Mints a session for an already-authenticated user. Students receive a
   * single-use exchange token (cookies are finalized at verify-exchange-token);
   * staff/instructors receive an access + refresh token pair directly. Shared
   * by `login` and `verifyEmail` so both sign-in paths behave identically.
   */
  private async issueSession(
    user: User,
    opts: { rememberMe?: boolean; ip: string; userAgent: string },
  ): Promise<{
    token: string;
    isExchangeToken: boolean;
    refreshToken?: string;
    refreshTtlMs?: number;
  }> {
    if (user.role === UserRole.STUDENT) {
      const token = await this.generateExchangeToken(
        user._id,
        opts.rememberMe ?? false,
      );
      return { token, isExchangeToken: true };
    }
    const tokens = await this.issueTokenPair(user, {
      rememberMe: opts.rememberMe,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return {
      token: tokens.accessToken,
      isExchangeToken: false,
      refreshToken: tokens.refreshToken,
      refreshTtlMs: tokens.refreshTtlMs,
    };
  }

  private async checkLoginDevice(
    user: User,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const fingerprint = getFingerprint(userAgent);

    // First login ever recorded for this user — just store baseline, no notification
    if (!user.lastLoginFingerprint) {
      await this.usersService.updateLastLogin(user._id, {
        fingerprint,
        ip,
        device: parseDevice(userAgent),
        location: await getLocationFromIp(ip),
      });
      return;
    }

    // Same device/IP as last time — nothing to do
    if (user.lastLoginFingerprint === fingerprint) {
      return;
    }

    // New device/IP detected
    const device = parseDevice(userAgent);
    const location = await getLocationFromIp(ip);

    await this.usersService.updateLastLogin(user._id, {
      fingerprint,
      ip,
      device,
      location,
    });

    const message = `A new login was detected from ${location} on ${device}. If this wasn't you, secure your account.`;

    await this.notificationsService.create(
      user._id,
      'New Login Detected',
      message,
      NotificationType.NEW_LOGIN_ATTEMPT,
    );

    // TODO: wire to real mailer once email infra is set up
    this.logger.warn(`[EMAIL STUB] Would email ${user.email}: ${message}`);
  }

  async generateHandoffCode(userId: string, userRole: string): Promise<string> {
    const code = crypto.randomBytes(16).toString('hex');
    await this.handoffCodeModel.create({
      code,
      userId: new Types.ObjectId(userId),
      userRole,
      used: false,
      expiresAt: new Date(Date.now() + 30 * 1000),
    });
    return code;
  }

  async redeemHandoffCode(
    code: string,
    ip = '',
    userAgent = '',
  ): Promise<
    IssuedTokens & { userId: string; userRole: string; token: string }
  > {
    const doc = await this.handoffCodeModel.findOne({ code });
    if (!doc) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (doc.expiresAt < new Date()) {
      throw new UnauthorizedException('Code has expired');
    }
    if (doc.used) {
      throw new UnauthorizedException('Code has already been used');
    }

    const updated = await this.handoffCodeModel.findOneAndUpdate(
      { code, used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new UnauthorizedException('Code is no longer valid');
    }

    const user = await this.usersService.findById(updated.userId.toString());
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Keep the role captured at handoff time (matches the old payload shape).
    const accessToken = this.signAccessToken(user, updated.userRole);
    const { raw, expiresAt } = await this.issueRefreshToken({
      userId: updated.userId,
      ip,
      userAgent,
    });

    return {
      userId: updated.userId.toString(),
      userRole: updated.userRole,
      token: accessToken,
      accessToken,
      refreshToken: raw,
      refreshTtlMs: expiresAt.getTime() - Date.now(),
    };
  }

  private hashInviteToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /** Returns the invitee details for a valid, unexpired, unaccepted token. */
  async validateInvite(
    token: string,
  ): Promise<{ email: string; firstName: string; lastName: string }> {
    const invite = await this.adminInviteModel.findOne({
      tokenHash: this.hashInviteToken(token),
      acceptedAt: null,
    });

    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This invitation is invalid or has expired',
      );
    }

    return {
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
    };
  }

  /**
   * Accepts an admin invitation: verifies the single-use token, provisions the
   * admin account, marks the invite consumed, and issues a session token.
   */
  async acceptInvite(
    dto: AcceptInviteDto,
    ip = '',
    userAgent = '',
  ): Promise<IssuedTokens & { token: string; user: UserSerializer }> {
    const invite = await this.adminInviteModel.findOne({
      tokenHash: this.hashInviteToken(dto.token),
      acceptedAt: null,
    });

    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This invitation is invalid or has expired',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createInvitedUser({
      firstName: invite.firstName,
      lastName: invite.lastName,
      email: invite.email,
      role: invite.role,
      passwordHash,
    });

    invite.acceptedAt = new Date();
    await invite.save();

    const tokens = await this.issueTokenPair(user, { ip, userAgent });

    return {
      ...tokens,
      token: tokens.accessToken,
      user: this.serializeUser(user),
    };
  }
}
