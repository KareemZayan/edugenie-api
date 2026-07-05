import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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
import { SetPayoutMethodDto } from './dto/set-payout-method.dto';

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

  @Roles(UserRole.INSTRUCTOR)
  @Get('payout-method')
  @ApiOperation({ summary: 'Get my saved PayPal payout email (masked)' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async getPayoutMethod(@CurrentUser() user: { userId: string }) {
    return this.earningsService.getPayoutMethod(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Put('payout-method')
  @ApiOperation({ summary: 'Set/replace my PayPal payout email' })
  @SwaggerApiResponse({ status: 200, description: 'Saved.' })
  @SwaggerApiResponse({ status: 400, description: 'Invalid email.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async setPayoutMethod(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetPayoutMethodDto,
  ) {
    return this.earningsService.setPayoutMethod(user.userId, dto.paypalEmail);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Delete('payout-method')
  @ApiOperation({ summary: 'Clear my PayPal payout email' })
  @SwaggerApiResponse({ status: 200, description: 'Cleared.' })
  @SwaggerApiResponse({ status: 409, description: 'A payout is in progress.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async clearPayoutMethod(@CurrentUser() user: { userId: string }) {
    return this.earningsService.clearPayoutMethod(user.userId);
  }
}
