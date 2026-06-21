import { Controller, Get, Patch, Param, UseGuards, Query } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  // "My Learning" Page
  @Get()
  getMyEnrollments(
    @CurrentUser() user: { userId: string },
    @Query() query: PaginateQueryDto
  ) {
    return this.enrollmentsService.getMyEnrollments(user.userId, query);
  }

  // Get progress for one specific course
  @Get(':courseId/progress')
  getCourseProgress(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.enrollmentsService.getCourseProgress(user.userId, courseId);
  }

  // Phase 9: Get access breakdown for a course
  @Get('my-access/:courseId')
  getCourseAccess(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.enrollmentsService.getCourseAccess(user.userId, courseId);
  }

  // The button click: "Mark Lesson as Complete"
  @Patch(':courseId/lessons/:lessonId/complete')
  markLessonComplete(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.enrollmentsService.markLessonComplete(user.userId, courseId, lessonId);
  }
}