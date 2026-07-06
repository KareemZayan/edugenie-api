import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('earnings')
@ApiTags('Earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('my-payouts')
  @ApiOperation({ summary: 'Get my payouts + Stripe balance' })
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
    description: 'Below threshold / onboarding incomplete / no pending earnings.',
  })
  @SwaggerApiResponse({ status: 409, description: 'A request is already open.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async requestPayout(@CurrentUser() user: { userId: string }) {
    return this.earningsService.requestPayout(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Post('connect/onboard')
  @ApiOperation({ summary: 'Start Stripe Connect onboarding (returns a link URL)' })
  @SwaggerApiResponse({ status: 201, description: 'Onboarding link created.' })
  @SwaggerApiResponse({ status: 503, description: 'Stripe not configured.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async connectOnboard(@CurrentUser() user: { userId: string }) {
    return this.earningsService.onboard(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('connect/status')
  @ApiOperation({ summary: 'Get my Stripe Connect onboarding + balance status' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async connectStatus(@CurrentUser() user: { userId: string }) {
    return this.earningsService.connectStatus(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('connect/dashboard')
  @ApiOperation({
    summary: 'Get a one-time link to my Stripe Express dashboard (payout history)',
  })
  @SwaggerApiResponse({ status: 200, description: 'Login link created.' })
  @SwaggerApiResponse({ status: 400, description: 'Onboarding not finished.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async connectDashboard(@CurrentUser() user: { userId: string }) {
    return this.earningsService.expressDashboard(user.userId);
  }
}
