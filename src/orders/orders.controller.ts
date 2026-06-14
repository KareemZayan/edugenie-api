import { Controller, Post, Get, UseGuards } from '@nestjs/common';
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
  processCheckout(@CurrentUser() user: { userId: string }) {
    return this.ordersService.processCheckout(user.userId);
  }

  @Get('history')
  getMyOrders(@CurrentUser() user: { userId: string }) {
    return this.ordersService.getMyOrders(user.userId);
  }
}