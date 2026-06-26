import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CourseResponse } from './interfaces/course-response.interface';
import { InstructorAnalyticsResponse } from './interfaces/IinstructorAnalyticsResponse';
import { ResumeResponse } from './interfaces/resume-response.interface';

@Controller('courses')
@ApiTags('Courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  @ApiOperation({ summary: 'Create' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: CreateCourseDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.create(
      createCourseDto,
      user.userId,
    );
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get('my-courses')
  @ApiOperation({ summary: 'Find instructor courses' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async findInstructorCourses(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse[]>> {
    const courses = await this.coursesService.findInstructorCourses(
      user.userId,
    );
    return { success: true, data: courses };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get('instructor-stats')
  @ApiOperation({ summary: 'Get instructor stats' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getInstructorStats(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<InstructorAnalyticsResponse>> {
    const stats = await this.coursesService.getInstructorStats(user.userId);
    return { success: true, data: stats };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Get('pending-review')
  @ApiOperation({ summary: 'Get pending review' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPendingReview(): Promise<ApiResponse<any[]>> {
    const courses = await this.coursesService.getPendingReview();
    return { success: true, data: courses };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Get('admin/stats')
  @ApiOperation({ summary: 'Get admin stats' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAdminStats(): Promise<
    ApiResponse<{
      totalCourses: number;
      underReview: number;
      published: number;
      rejected: number;
      draft: number;
    }>
  > {
    const stats = await this.coursesService.getAdminStats();
    return { success: true, data: stats };
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Find all' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  async findAll(
    @Query('skip') skip?: number,
    @Query('limit') limit?: number,
    @Query('categoryId') categoryId?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('minRating') minRating?: number,
    @Query('maxDuration') maxDuration?: number,
    @Query('sort') sort?: string,
  ): Promise<ApiResponse<PaginatedResponse<CourseResponse>>> {
    const result = await this.coursesService.findAll({
      skip: skip ? +skip : 0,
      limit: limit ? +limit : 10,
      categoryId,
      level,
      search,
      minPrice: minPrice ? +minPrice : undefined,
      maxPrice: maxPrice ? +maxPrice : undefined,
      minRating: minRating ? +minRating : undefined,
      maxDuration: maxDuration ? +maxDuration : undefined,
      sort,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find one' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 404, description: 'Not Found.' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id') id: string): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.findOne(id);
    return { success: true, data: course };
  }

  @Get(':courseId/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Resume' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async resume(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ResumeResponse> {
    return this.coursesService.getResumePoint(courseId, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Update' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateCourseDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.update(
      id,
      user.userId,
      updateCourseDto,
    );
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id/submit-for-review')
  @ApiOperation({ summary: 'Submit for review' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async submitForReview(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.submitForReview(id, user.userId);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
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
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.approveCourse(id);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject course' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async rejectCourse(
    @Param('id') id: string,
    @Body() body?: { reason: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.rejectCourse(id, body?.reason);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Remove' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async remove(
    @Param('id') id: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.coursesService.remove(id);
    return { success: true, data: result };
  }
}
