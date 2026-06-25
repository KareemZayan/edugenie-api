import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
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
@ApiTags('Instructor Courses')
export class InstructorCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get()
  @ApiOperation({ summary: 'Get courses' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getCourses(
    @Query() filterDto: InstructorCoursesFilterDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PaginatedResponse<InstructorCourseListItem>> {
    return this.coursesService.findByInstructor(
      user.userId,
      filterDto as unknown as Record<string, unknown>,
    );
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get(':id/rejection-reason')
  @ApiOperation({ summary: 'Get rejection reason' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 404, description: 'Not Found.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getRejectionReason(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<RejectionReasonResponse> {
    return this.coursesService.getRejectionReason(id, user.userId);
  }
}
