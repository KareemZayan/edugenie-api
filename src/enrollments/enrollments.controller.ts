import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { MyCourseItem } from './interfaces/my-course-item.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('enrollments')
@ApiTags('Enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  // "My Learning" Page
  @Get()
  @ApiOperation({ summary: 'Get my enrollments' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getMyEnrollments(
    @CurrentUser() user: { userId: string },
    @Query() query: PaginateQueryDto,
  ) {
    return this.enrollmentsService.getMyEnrollments(user.userId, query);
  }

  // Student dashboard: flat list of enrolled courses
  @Get('my-courses')
  @ApiOperation({ summary: 'Get courses the current user is enrolled in' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'List of enrolled courses' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getMyCourses(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<MyCourseItem[]>> {
    const courses = await this.enrollmentsService.getMyCourses(user.userId);
    return {
      success: true,
      data: courses,
    };
  }

  // Get progress for one specific course
  @Get(':courseId/progress')
  @ApiOperation({ summary: 'Get course progress' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getCourseProgress(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.enrollmentsService.getCourseProgress(user.userId, courseId);
  }

  // Phase 9: Get access breakdown for a course
  @Get('my-access/:courseId')
  @ApiOperation({ summary: 'Get course access' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getCourseAccess(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.enrollmentsService.getCourseAccess(user.userId, courseId);
  }

  // What the student would pay to buy the full course now (full price minus the
  // value of sections they already own). Drives the "remaining" price on cards.
  @Get('pricing/:courseId')
  @ApiOperation({ summary: 'Get the remaining full-course price for this user' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  getCoursePricing(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.enrollmentsService.getCoursePricingForStudent(
      user.userId,
      courseId,
    );
  }

  // The button click: "Mark Lesson as Complete"
  @Patch(':courseId/lessons/:lessonId/complete')
  @ApiOperation({ summary: 'Mark lesson complete' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  markLessonComplete(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.enrollmentsService.markLessonComplete(
      user.userId,
      courseId,
      lessonId,
    );
  }

}

