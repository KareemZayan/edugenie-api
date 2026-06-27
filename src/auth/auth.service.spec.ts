import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ExchangeToken } from './schemas/exchange-token.schema';
import { HandoffCode } from './schemas/handoff-code.schema';
import { AdminInvite } from '../superadmin/schema/admin-invite.schema';
import { NotificationsService } from '../notifications/notifications.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
        { provide: getModelToken(ExchangeToken.name), useValue: {} },
        { provide: getModelToken(HandoffCode.name), useValue: {} },
        { provide: getModelToken(AdminInvite.name), useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
