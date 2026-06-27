import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
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

    return {
      message: 'User registered successfully',
    };
  }

  async generateExchangeToken(userId: Types.ObjectId): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.exchangeTokenModel.create({ userId, token });
    return token;
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
      token = await this.generateExchangeToken(user._id as Types.ObjectId);
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
      throw new BadRequestException('This invitation is invalid or has expired');
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
      throw new BadRequestException('This invitation is invalid or has expired');
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
