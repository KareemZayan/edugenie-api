import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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

  @Roles(UserRole.INSTRUCTOR)
  @Post('request-payout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a payout of my pending earnings' })
  @SwaggerApiResponse({ status: 201, description: 'Payout request created.' })
  @SwaggerApiResponse({
    status: 400,
    description: 'Below minimum threshold / no pending earnings.',
  })
  @SwaggerApiResponse({ status: 409, description: 'A request is already open.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async requestPayout(@CurrentUser() user: { userId: string }) {
    return this.earningsService.requestPayout(user.userId);
  }
}
