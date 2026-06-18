import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

import { Cart, CartSchema } from '../cart/schema/cart.schema';
import { Order, OrderSchema } from './schema/order.schema';
import { Earning, EarningSchema } from './schema/earning.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';
import { PaymobModule } from '../paymob/paymob.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Cart.name, schema: CartSchema },
      { name: Earning.name, schema: EarningSchema }
    ]),
    PaymobModule,
    UsersModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService]
})
export class OrdersModule { }