import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from './schema/order.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { CartModule } from '../cart/cart.module';
import { PaymobModule } from '../paymob/paymob.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: User.name, schema: UserSchema }
    ]),
    CartModule,
    PaymobModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService]
})
export class OrdersModule { }