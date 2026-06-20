import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from './schema/order.schema';
import { CartModule } from '../cart/cart.module';
import { PaymobModule } from '../paymob/paymob.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    CartModule,
    PaymobModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService]
})
export class OrdersModule { }