import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EarningsPayoutResponse } from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('earnings')
@ApiTags('Earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('my-payouts')
  @ApiOperation({ summary: 'Get my payouts' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getMyPayouts(
    @CurrentUser() user: { userId: string },
  ): Promise<EarningsPayoutResponse> {
    return this.earningsService.getMyPayouts(user.userId);
  }
}
