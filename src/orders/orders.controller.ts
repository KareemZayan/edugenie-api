import { Controller, Post, Get, UseGuards, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('orders')
@ApiTags('Orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Process checkout' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async processCheckout(@CurrentUser() user: { userId: string }) {
    const response = await this.ordersService.processCheckout(user.userId);
    return {
      success: true,
      message: 'Checkout initiated successfully',
      data: response,
    };
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my orders' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getMyOrders(@CurrentUser() user: { userId: string }) {
    const response = await this.ordersService.getMyOrders(user.userId);
    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: response,
    };
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order by id' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'orderId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getOrderById(
    @Param('orderId') orderId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const response = await this.ordersService.getOrderById(
      user.userId,
      orderId,
    );
    return {
      success: true,
      message: 'Order details retrieved successfully',
      data: response,
    };
  }
}
