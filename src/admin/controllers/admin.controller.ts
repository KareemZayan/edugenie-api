import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import { AnalyticsPeriodQueryDto } from '../dto/analytics-period-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AdminDashboardOverviewResponse,
  PlatformAnalyticsResponse,
} from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin')
@ApiTags('Admin')
export class AdminController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Get overview' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getOverview(): Promise<AdminDashboardOverviewResponse> {
    return this.adminAnalyticsService.getDashboardOverview();
  }

  @Get('analytics/platform')
  @ApiOperation({ summary: 'Get platform analytics' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPlatformAnalytics(
    @Query() query: AnalyticsPeriodQueryDto,
  ): Promise<PlatformAnalyticsResponse> {
    return this.adminAnalyticsService.getPlatformAnalytics(query);
  }
}
