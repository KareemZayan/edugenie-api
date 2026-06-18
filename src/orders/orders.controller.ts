import { Controller, Post, Get, UseGuards, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post('checkout')
  async processCheckout(@CurrentUser() user: { userId: string }): Promise<{ success: boolean; message: string; clientSecret: string }> {
    return this.ordersService.processCheckout(user.userId);
  }

  @Get('history')
  async getMyOrders(
    @CurrentUser() user: { userId: string },
    @Query() query: PaginateQueryDto
  ): Promise<PaginatedResponse<any>> {
    return this.ordersService.getMyOrders(user.userId, query);
  }
}