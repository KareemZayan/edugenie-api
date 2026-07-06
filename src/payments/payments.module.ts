import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { User, UserSchema } from '../users/schema/user.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Order, OrderSchema } from '../orders/schema/order.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import {
  PayoutRequest,
  PayoutRequestSchema,
} from '../earnings/schema/payout-request.schema';
import {
  PlatformConfig,
  PlatformConfigSchema,
} from '../superadmin/schema/platform-config.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schema/notification.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [StripeService, PaymentsService],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule {}
