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

  /** Students land in the student web app; staff (instructor/admin) in the dashboard. */
  private appBaseUrlForRole(role: UserRole): string {
    const student =
      this.configService.get<string>('STUDENT_APP_URL') ||
      'http://localhost:3000';
    const dashboard =
      this.configService.get<string>('DASHBOARD_URL') ||
      'http://localhost:4200';
    return role === UserRole.STUDENT ? student : dashboard;
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

  /** Confirms an email-verification token. */
  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const user = await this.usersService.consumeEmailVerification(
      this.hashToken(rawToken),
    );
    if (!user) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }
    return { message: 'Email verified successfully' };
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

  async generateExchangeToken(userId: Types.ObjectId): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.exchangeTokenModel.create({ userId, token });
    return token;
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

    // SECURITY: deactivated/suspended accounts must not be able to log in.
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        'This account has been deactivated. Please contact support.',
      );
    }

    const exchangeToken = await this.generateExchangeToken(user._id);
    return { exchangeToken, user };
  }

  async verifyExchangeToken(
    token: string,
  ): Promise<{ token: string; user: UserSerializer }> {
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

    const payload = {
      id: user._id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar ?? null,
    };
    const jwtToken = this.jwtService.sign(payload);

    return {
      token: jwtToken,
      user: new UserSerializer(user.toObject()),
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
  }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // SECURITY: deactivated/suspended accounts must not be able to log in.
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        'This account has been deactivated. Please contact support.',
      );
    }

    let token: string;
    let isExchangeToken = false;

    if (user.role === UserRole.STUDENT) {
      token = await this.generateExchangeToken(user._id);
      isExchangeToken = true;
    } else {
      const payload = {
        id: user._id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar ?? null,
      };
      token = this.jwtService.sign(payload);
    }

    // Don't block the login response on geo lookups / notification creation
    this.checkLoginDevice(user, ip, userAgent).catch((err) =>
      this.logger.error('Login device check failed', err),
    );

    return {
      token,
      isExchangeToken,
      user: new UserSerializer(user.toObject()),
    };
  }

  private async checkLoginDevice(
    user: any,
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
  ): Promise<{ userId: string; userRole: string; token: string }> {
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

    const payload = {
      id: updated.userId,
      role: updated.userRole,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar ?? null,
    };
    const jwtToken = this.jwtService.sign(payload);

    return {
      userId: updated.userId.toString(),
      userRole: updated.userRole,
      token: jwtToken,
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
  ): Promise<{ token: string; user: UserSerializer }> {
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

    const payload = {
      id: user._id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar ?? null,
    };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: new UserSerializer((user as any).toObject()),
    };
  }
}
