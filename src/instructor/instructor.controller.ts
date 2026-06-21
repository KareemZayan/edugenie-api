import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InstructorService } from './instructor.service';
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
  constructor(private readonly instructorService: InstructorService) {}

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
}
