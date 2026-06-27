import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SuperAdminService } from './superadmin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProcessPayoutDto } from './dto/process-payout.dto';
import { CreateAdminInviteDto } from './dto/create-admin-invite.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { AuditLogsFilterDto } from './dto/audit-logs-filter.dto';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';
import {
  SuperAdminDashboardOverviewResponse,
  AdminListItem,
  AdminActivityPaginatedResponse,
  PendingPayoutPaginatedResponse,
  PayoutProcessResponse,
  PlatformConfigResponse,
  AuditLogPaginatedResponse,
  SystemHealthResponse,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('superadmin')
@ApiTags('Super Admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Get dashboard overview' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getDashboardOverview(): Promise<SuperAdminDashboardOverviewResponse> {
    return this.superAdminService.getDashboardOverview();
  }

  @Get('admins')
  @ApiOperation({ summary: 'Get admins' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAdmins(): Promise<AdminListItem[]> {
    return this.superAdminService.getAdmins();
  }

  // Invite a new administrator by email (sends a one-time acceptance link).
  @Post('admins')
  @ApiOperation({ summary: 'Invite a new admin by email' })
  @ApiBody({ type: CreateAdminInviteDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async inviteAdmin(
    @Body() dto: CreateAdminInviteDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.inviteAdmin(user.userId, dto);
  }

  // List outstanding (unaccepted) admin invitations.
  @Get('admin-invites')
  @ApiOperation({ summary: 'List pending admin invitations' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async getAdminInvites() {
    return this.superAdminService.listAdminInvites();
  }

  // Revoke an admin's access (deactivate the account; reversible).
  @Patch('admins/:id/revoke')
  @ApiOperation({ summary: 'Revoke admin access' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async revokeAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.revokeAdmin(user.userId, id);
  }

  // Restore a previously-revoked admin's access.
  @Patch('admins/:id/unrevoke')
  @ApiOperation({ summary: 'Restore admin access' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async unrevokeAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.unrevokeAdmin(user.userId, id);
  }

  @Get('admins/:id/activity')
  @ApiOperation({ summary: 'Get admin activity' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 404, description: 'Not Found.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAdminActivity(
    @Param('id') id: string,
    @Query() query: AdminActivityQueryDto,
  ): Promise<AdminActivityPaginatedResponse> {
    return this.superAdminService.getAdminActivity(id, query);
  }

  @Get('payouts/pending')
  @ApiOperation({ summary: 'Get pending payouts' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPendingPayouts(
    @Query() query: AdminActivityQueryDto, // Using same basic pagination dto
  ): Promise<PendingPayoutPaginatedResponse> {
    return this.superAdminService.getPendingPayouts(query);
  }

  @Patch('payouts/:instructorId/process')
  @ApiOperation({ summary: 'Process payout' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'instructorId', type: String })
  @ApiBody({ type: ProcessPayoutDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async processPayout(
    @Param('instructorId') instructorId: string,
    @Body() dto: ProcessPayoutDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PayoutProcessResponse> {
    return this.superAdminService.processPayout(instructorId, user.userId, dto);
  }

  @Get('platform-config')
  @ApiOperation({ summary: 'Get platform config' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPlatformConfig(): Promise<PlatformConfigResponse> {
    return this.superAdminService.getPlatformConfig();
  }

  @Patch('platform-config')
  @ApiOperation({ summary: 'Update platform config' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: UpdatePlatformConfigDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async updatePlatformConfig(
    @Body() dto: UpdatePlatformConfigDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PlatformConfigResponse> {
    return this.superAdminService.updatePlatformConfig(user.userId, dto);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get audit logs' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAuditLogs(
    @Query() query: AuditLogsFilterDto,
  ): Promise<AuditLogPaginatedResponse> {
    // This is a read-only endpoint. No PATCH or DELETE route exists for audit logs.
    return this.superAdminService.getAuditLogs(query);
  }

  @Get('system-health')
  @ApiOperation({ summary: 'Get system health' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getSystemHealth(): Promise<SystemHealthResponse> {
    return this.superAdminService.getSystemHealth();
  }
}
