import { Controller, Get, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AdminCoursesService } from '../services/admin-courses.service';
import { PaginateQueryDto } from '../../common/dto/paginate-query.dto';
import { RejectCourseDto } from '../dto/reject-course.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  PendingCourseListResponse,
  CourseReviewDetailResponse,
  CourseApprovalResponse,
  CourseRejectionResponse
} from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly adminCoursesService: AdminCoursesService) {}

  @Get('pending-review')
  async getPendingReviews(@Query() query: PaginateQueryDto): Promise<PendingCourseListResponse> {
    return this.adminCoursesService.getPendingReviews(query);
  }

  @Get(':id/review')
  async getReviewDetail(@Param('id') id: string): Promise<CourseReviewDetailResponse> {
    return this.adminCoursesService.getReviewDetail(id);
  }

  @Patch(':id/approve')
  async approveCourse(@Param('id') id: string, @Request() req: any): Promise<CourseApprovalResponse> {
    return this.adminCoursesService.approveCourse(id, req.user.userId);
  }

  @Patch(':id/reject')
  async rejectCourse(
    @Param('id') id: string,
    @Body() dto: RejectCourseDto,
    @Request() req: any
  ): Promise<CourseRejectionResponse> {
    return this.adminCoursesService.rejectCourse(id, req.user.userId, dto);
  }
}
