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
  CourseRejectionResponse,
  RejectedCourseListResponse,
} from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/courses')
@ApiTags('Admin Courses')
export class AdminCoursesController {
  constructor(private readonly adminCoursesService: AdminCoursesService) {}

  @Get('pending-review')
  @ApiOperation({ summary: 'Get pending reviews' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPendingReviews(
    @Query() query: PaginateQueryDto,
  ): Promise<PendingCourseListResponse> {
    return this.adminCoursesService.getPendingReviews(query);
  }

  @Get('rejected')
  @ApiOperation({ summary: 'Get rejected courses' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getRejectedCourses(
    @Query() query: PaginateQueryDto,
  ): Promise<RejectedCourseListResponse> {
    return this.adminCoursesService.getRejectedCourses(query);
  }

  @Get(':id/review')
  @ApiOperation({ summary: 'Get review detail' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 404, description: 'Not Found.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getReviewDetail(
    @Param('id') id: string,
  ): Promise<CourseReviewDetailResponse> {
    return this.adminCoursesService.getReviewDetail(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve course' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async approveCourse(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<CourseApprovalResponse> {
    return this.adminCoursesService.approveCourse(id, req.user.userId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject course' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: RejectCourseDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async rejectCourse(
    @Param('id') id: string,
    @Body() dto: RejectCourseDto,
    @Request() req: any,
  ): Promise<CourseRejectionResponse> {
    return this.adminCoursesService.rejectCourse(id, req.user.userId, dto);
  }
}
