import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { InstructorService } from './instructor.service';
import { InstructorSummaryService } from './instructor-summary.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InstructorStudentsFilterDto } from './dto/instructor-students-filter.dto';
import {
  DashboardOverviewResponse,
  AttentionItemsResponse,
  PaginatedResponse,
  InstructorStudentListItem,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructor')
@ApiTags('Instructor')
export class InstructorController {
  constructor(
    private readonly instructorService: InstructorService,
    private readonly instructorSummaryService: InstructorSummaryService,
  ) { }

  @Roles(UserRole.INSTRUCTOR)
  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Get dashboard overview' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getDashboardOverview(
    @CurrentUser() user: { userId: string },
  ): Promise<DashboardOverviewResponse> {
    return this.instructorService.getDashboardOverview(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('dashboard/attention-items')
  @ApiOperation({ summary: 'Get attention items' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAttentionItems(
    @CurrentUser() user: { userId: string },
  ): Promise<AttentionItemsResponse> {
    return this.instructorService.getAttentionItems(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('students')
  @ApiOperation({ summary: 'Get students' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getStudents(
    @Query() query: InstructorStudentsFilterDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PaginatedResponse<InstructorStudentListItem>> {
    return this.instructorService.getStudents(user.userId, query);
  }

  // ============================================================
  // TESTING ENDPOINTS - Remove after testing is complete
  // ============================================================

  /**
   * Manual trigger for weekly summaries (for testing purposes only)
   * Should be removed after testing is complete
   */
  @Post('summary/test-weekly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Test weekly summary' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async testWeeklySummary(): Promise<{ message: string; count: number }> {
    return this.instructorSummaryService.testSendWeeklySummaries();
  }

  /**
   * Manual trigger for monthly summaries (for testing purposes only)
   * Should be removed after testing is complete
   */
  @Post('summary/test-monthly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Test monthly summary' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async testMonthlySummary(): Promise<{ message: string; count: number }> {
    return this.instructorSummaryService.testSendMonthlySummaries();
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('dashboard/recent-sales')
  @ApiOperation({ summary: 'Get recent enrolled students' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async getRecentSales(@CurrentUser() user: { userId: string }) {
    return this.instructorService.getRecentSales(user.userId);
  }


}
