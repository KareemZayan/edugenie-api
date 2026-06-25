import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from './schema/order.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { CartModule } from '../cart/cart.module';
import { PaymobModule } from '../paymob/paymob.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    CartModule,
    PaymobModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
