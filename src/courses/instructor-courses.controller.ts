import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InstructorCoursesFilterDto } from './dto/instructor-courses-filter.dto';
import {
  PaginatedResponse,
  InstructorCourseListItem,
  RejectionReasonResponse,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructor/courses')
export class InstructorCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get()
  async getCourses(
    @Query() filterDto: InstructorCoursesFilterDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PaginatedResponse<InstructorCourseListItem>> {
    return this.coursesService.findByInstructor(user.userId, filterDto as unknown as Record<string, unknown>);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get(':id/rejection-reason')
  async getRejectionReason(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<RejectionReasonResponse> {
    return this.coursesService.getRejectionReason(id, user.userId);
  }
}
