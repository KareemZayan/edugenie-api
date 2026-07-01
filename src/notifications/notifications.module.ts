import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationSchema } from './schema/notification.schema';
import { PusherModule } from '../pusher/pusher.module';
import { User, UserSchema } from '../users/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      // Read-only lookup for the recipient's email/name/role when fanning a
      // notification out to email (Phase 3). Registered here to avoid a
      // circular dependency on UsersModule/UsersService.
      { name: User.name, schema: UserSchema },
    ]),
    PusherModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
