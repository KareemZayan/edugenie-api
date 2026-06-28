import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { PaymobModule } from '../paymob/paymob.module';

import { Order, OrderSchema } from '../orders/schema/order.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import { Lesson, LessonSchema } from '../lessons/schema/lesson.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import {
  WebhookFailureLog,
  WebhookFailureLogSchema,
} from '../superadmin/schema/webhook-failure-log.schema';
import {
  PlatformConfig,
  PlatformConfigSchema,
} from '../superadmin/schema/platform-config.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { CartModule } from '../cart/cart.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: Course.name, schema: CourseSchema },
      { name: WebhookFailureLog.name, schema: WebhookFailureLogSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
    ]),
    PaymobModule,
    NotificationsModule,
    CartModule,
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
