import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EarningsPayoutResponse } from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('my-payouts')
  async getMyPayouts(
    @CurrentUser() user: { userId: string },
  ): Promise<EarningsPayoutResponse> {
    return this.ordersService.getMyPayouts(user.userId);
  }
}
