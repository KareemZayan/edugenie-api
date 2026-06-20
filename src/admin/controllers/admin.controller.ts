import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import { AnalyticsPeriodQueryDto } from '../dto/analytics-period-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminDashboardOverviewResponse, PlatformAnalyticsResponse } from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('dashboard/overview')
  async getOverview(): Promise<AdminDashboardOverviewResponse> {
    return this.adminAnalyticsService.getDashboardOverview();
  }

  @Get('analytics/platform')
  async getPlatformAnalytics(@Query() query: AnalyticsPeriodQueryDto): Promise<PlatformAnalyticsResponse> {
    return this.adminAnalyticsService.getPlatformAnalytics(query);
  }
}
