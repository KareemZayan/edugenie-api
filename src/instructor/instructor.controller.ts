import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
export class InstructorController {
  constructor(
    private readonly instructorService: InstructorService,
    private readonly instructorSummaryService: InstructorSummaryService,
  ) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('dashboard/overview')
  async getDashboardOverview(@CurrentUser() user: { userId: string }): Promise<DashboardOverviewResponse> {
    return this.instructorService.getDashboardOverview(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('dashboard/attention-items')
  async getAttentionItems(@CurrentUser() user: { userId: string }): Promise<AttentionItemsResponse> {
    return this.instructorService.getAttentionItems(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('students')
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
  async testMonthlySummary(): Promise<{ message: string; count: number }> {
    return this.instructorSummaryService.testSendMonthlySummaries();
  }
}
