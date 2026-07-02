import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ExchangeToken } from './schemas/exchange-token.schema';
import { HandoffCode } from './schemas/handoff-code.schema';
import { RefreshToken } from './schemas/refresh-token.schema';
import { AdminInvite } from '../superadmin/schema/admin-invite.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '../common/enums/user-status.enum';

describe('AuthService', () => {
  let service: AuthService;

  const userId = new Types.ObjectId();
  const activeUser = {
    _id: userId,
    role: 'instructor',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    isDeleted: false,
    status: UserStatus.ACTIVE,
    toObject: () => ({ _id: userId, firstName: 'Test', lastName: 'User' }),
  };

  const usersService = {
    findById: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-access-jwt'),
  };
  const refreshTokenModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    create: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('signed-access-jwt');
    refreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    refreshTokenModel.create.mockResolvedValue({});
    usersService.findById.mockResolvedValue(activeUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: getModelToken(ExchangeToken.name), useValue: {} },
        { provide: getModelToken(HandoffCode.name), useValue: {} },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: refreshTokenModel,
        },
        { provide: getModelToken(AdminInvite.name), useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refresh (rotating refresh tokens)', () => {
    const liveDoc = () => ({
      _id: new Types.ObjectId(),
      userId,
      family: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h out
    });

    it('rejects a missing token', async () => {
      await expect(service.refresh('', '1.2.3.4', 'ua')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an unknown token', async () => {
      refreshTokenModel.findOne.mockResolvedValue(null);
      await expect(service.refresh('nope', '1.2.3.4', 'ua')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('rejects an expired token', async () => {
      refreshTokenModel.findOne.mockResolvedValue({
        ...liveDoc(),
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('old', '1.2.3.4', 'ua')).rejects.toThrow(
        'Refresh token expired',
      );
    });

    it('rotates a live token: revokes it and issues a successor in the same family', async () => {
      const doc = liveDoc();
      refreshTokenModel.findOne.mockResolvedValue(doc);
      refreshTokenModel.findOneAndUpdate.mockResolvedValue(doc);

      const result = await service.refresh('raw', '1.2.3.4', 'ua');

      expect(refreshTokenModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: doc._id, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) as Date } },
      );
      expect(refreshTokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          family: 'family-1',
          expiresAt: doc.expiresAt, // fixed horizon carried forward
        }),
      );
      expect(result.accessToken).toBe('signed-access-jwt');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('treats reuse within the grace window as a benign race (no family revocation)', async () => {
      refreshTokenModel.findOne.mockResolvedValue({
        ...liveDoc(),
        revokedAt: new Date(Date.now() - 5_000), // rotated 5s ago
      });

      const result = await service.refresh('raced', '1.2.3.4', 'ua');

      expect(refreshTokenModel.updateMany).not.toHaveBeenCalled();
      expect(refreshTokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ family: 'family-1' }),
      );
      expect(result.accessToken).toBe('signed-access-jwt');
    });

    it('treats reuse after the grace window as theft: revokes the whole family', async () => {
      refreshTokenModel.findOne.mockResolvedValue({
        ...liveDoc(),
        revokedAt: new Date(Date.now() - 60_000), // rotated a minute ago
      });

      await expect(service.refresh('stolen', '1.2.3.4', 'ua')).rejects.toThrow(
        'Session revoked',
      );
      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        { family: 'family-1', revokedAt: null },
        { $set: { revokedAt: expect.any(Date) as Date } },
      );
      expect(refreshTokenModel.create).not.toHaveBeenCalled();
    });

    it('revokes the family when the account is no longer active', async () => {
      refreshTokenModel.findOne.mockResolvedValue(liveDoc());
      refreshTokenModel.findOneAndUpdate.mockResolvedValue(liveDoc());
      usersService.findById.mockResolvedValue({
        ...activeUser,
        status: 'deactivated',
      });

      await expect(service.refresh('raw', '1.2.3.4', 'ua')).rejects.toThrow(
        'Account is no longer active',
      );
      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        { family: 'family-1', revokedAt: null },
        { $set: { revokedAt: expect.any(Date) as Date } },
      );
    });
  });

  describe('revokeRefreshToken / revokeAllSessions', () => {
    it('revokes the whole family on logout', async () => {
      refreshTokenModel.findOne.mockResolvedValue({
        family: 'family-9',
      });
      await service.revokeRefreshToken('raw');
      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        { family: 'family-9', revokedAt: null },
        { $set: { revokedAt: expect.any(Date) as Date } },
      );
    });

    it('is a silent no-op without a token', async () => {
      await service.revokeRefreshToken(undefined);
      expect(refreshTokenModel.findOne).not.toHaveBeenCalled();
    });

    it('revokes every live session for the user', async () => {
      refreshTokenModel.updateMany.mockResolvedValue({ modifiedCount: 3 });
      const result = await service.revokeAllSessions(userId.toString());
      expect(result).toEqual({ revoked: 3 });
      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        { userId, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) as Date } },
      );
    });
  });
});
