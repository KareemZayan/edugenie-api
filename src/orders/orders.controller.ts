import { Controller, Post, Get, UseGuards, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post('checkout')
  async processCheckout(@CurrentUser() user: { userId: string }) {
    const response = await this.ordersService.processCheckout(user.userId);
    return { success: true, message: 'Checkout initiated successfully', data: response };
  }

  @Get('my')
  async getMyOrders(@CurrentUser() user: { userId: string }) {
    const response = await this.ordersService.getMyOrders(user.userId);
    return { success: true, message: 'Orders retrieved successfully', data: response };
  }

  @Get(':orderId')
  async getOrderById(
    @Param('orderId') orderId: string,
    @CurrentUser() user: { userId: string }
  ) {
    const response = await this.ordersService.getOrderById(user.userId, orderId);
    return { success: true, message: 'Order details retrieved successfully', data: response };
  }
}