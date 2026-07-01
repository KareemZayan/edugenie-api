import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { Notification } from './schema/notification.schema';
import { User } from '../users/schema/user.schema';
import { PusherService } from '../pusher/pusher.service';
import { MailService } from '../mail/mail.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: PusherService, useValue: { trigger: jest.fn() } },
        {
          provide: MailService,
          useValue: { isConfigured: false, sendNotificationEmail: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
