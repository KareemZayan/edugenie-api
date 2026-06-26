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
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('dashboard/overview')
  async getDashboardOverview(): Promise<SuperAdminDashboardOverviewResponse> {
    return this.superAdminService.getDashboardOverview();
  }

  @Get('admins')
  async getAdmins(): Promise<AdminListItem[]> {
    return this.superAdminService.getAdmins();
  }

  // Invite a new administrator by email (sends a one-time acceptance link).
  @Post('admins')
  async inviteAdmin(
    @Body() dto: CreateAdminInviteDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.inviteAdmin(user.userId, dto);
  }

  // List outstanding (unaccepted) admin invitations.
  @Get('admin-invites')
  async getAdminInvites() {
    return this.superAdminService.listAdminInvites();
  }

  // Revoke an admin's access (deactivate the account; reversible).
  @Patch('admins/:id/revoke')
  async revokeAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.revokeAdmin(user.userId, id);
  }

  // Restore a previously-revoked admin's access.
  @Patch('admins/:id/unrevoke')
  async unrevokeAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.superAdminService.unrevokeAdmin(user.userId, id);
  }

  @Get('admins/:id/activity')
  async getAdminActivity(
    @Param('id') id: string,
    @Query() query: AdminActivityQueryDto,
  ): Promise<AdminActivityPaginatedResponse> {
    return this.superAdminService.getAdminActivity(id, query);
  }

  @Get('payouts/pending')
  async getPendingPayouts(
    @Query() query: AdminActivityQueryDto, // Using same basic pagination dto
  ): Promise<PendingPayoutPaginatedResponse> {
    return this.superAdminService.getPendingPayouts(query);
  }

  @Patch('payouts/:instructorId/process')
  async processPayout(
    @Param('instructorId') instructorId: string,
    @Body() dto: ProcessPayoutDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PayoutProcessResponse> {
    return this.superAdminService.processPayout(instructorId, user.userId, dto);
  }

  @Get('platform-config')
  async getPlatformConfig(): Promise<PlatformConfigResponse> {
    return this.superAdminService.getPlatformConfig();
  }

  @Patch('platform-config')
  async updatePlatformConfig(
    @Body() dto: UpdatePlatformConfigDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PlatformConfigResponse> {
    return this.superAdminService.updatePlatformConfig(user.userId, dto);
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query() query: AuditLogsFilterDto,
  ): Promise<AuditLogPaginatedResponse> {
    // This is a read-only endpoint. No PATCH or DELETE route exists for audit logs.
    return this.superAdminService.getAuditLogs(query);
  }

  @Get('system-health')
  async getSystemHealth(): Promise<SystemHealthResponse> {
    return this.superAdminService.getSystemHealth();
  }
}
