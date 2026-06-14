import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

import { Cart, CartSchema } from '../cart/schema/cart.schema';
import { Order, OrderSchema } from './schema/order.schema';
import { Enrollment, EnrollmentSchema } from 'src/enrollments/schema/enrollment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Cart.name, schema: CartSchema }
    ])
  ],
  controllers: [OrdersController],
  providers: [OrdersService]
})
export class OrdersModule { }