import { Controller, Get, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AdminReportsService } from '../services/admin-reports.service';
import { AdminReportsFilterDto } from '../dto/admin-reports-filter.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ReportListResponse, ReportResolutionResponse } from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get()
  async getReports(@Query() query: AdminReportsFilterDto): Promise<ReportListResponse> {
    return this.adminReportsService.getReports(query);
  }

  @Patch(':id/resolve')
  async resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @Request() req: any
  ): Promise<ReportResolutionResponse> {
    return this.adminReportsService.resolveReport(id, req.user.userId, dto);
  }
}
