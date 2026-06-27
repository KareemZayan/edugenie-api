import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminReportsService } from '../services/admin-reports.service';
import { AdminReportsFilterDto } from '../dto/admin-reports-filter.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  ReportListResponse,
  ReportResolutionResponse,
} from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/reports')
@ApiTags('Admin Reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get reports' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getReports(
    @Query() query: AdminReportsFilterDto,
  ): Promise<ReportListResponse> {
    return this.adminReportsService.getReports(query);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve report' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ResolveReportDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @Request() req: any,
  ): Promise<ReportResolutionResponse> {
    return this.adminReportsService.resolveReport(id, req.user.userId, dto);
  }
}
