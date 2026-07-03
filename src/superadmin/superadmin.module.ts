import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';
import { User, UserSchema } from '../users/schema/user.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import {
  PayoutRequest,
  PayoutRequestSchema,
} from '../earnings/schema/payout-request.schema';
import {
  AuditLog,
  AuditLogSchema,
} from '../audit-logs/schemas/audit-log.schema';
import {
  PlatformConfig,
  PlatformConfigSchema,
} from './schema/platform-config.schema';
import {
  WebhookFailureLog,
  WebhookFailureLogSchema,
} from './schema/webhook-failure-log.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schema/notification.schema';
import {
  AdminInvite,
  AdminInviteSchema,
} from './schema/admin-invite.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: WebhookFailureLog.name, schema: WebhookFailureLogSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: AdminInvite.name, schema: AdminInviteSchema },
    ]),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
