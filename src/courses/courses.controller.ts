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

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.create(createCourseDto, user.userId);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get('my-courses')
  async findInstructorCourses(@CurrentUser() user: { userId: string }): Promise<ApiResponse<CourseResponse[]>> {
    const courses = await this.coursesService.findInstructorCourses(user.userId);
    return { success: true, data: courses };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get('instructor-stats')
  async getInstructorStats(@CurrentUser() user: { userId: string }): Promise<ApiResponse<any>> {
    const stats = await this.coursesService.getInstructorStats(user.userId);
    return { success: true, data: stats };
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  async findAll(
    @Query('skip') skip?: number,
    @Query('limit') limit?: number,
    @Query('categorySlug') categorySlug?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
  ): Promise<ApiResponse<PaginatedResponse<CourseResponse>>> {
    const result = await this.coursesService.findAll({
      skip: skip ? +skip : 0,
      limit: limit ? +limit : 10,
      categorySlug,
      level,
      search,
      minPrice: minPrice ? +minPrice : undefined,
      maxPrice: maxPrice ? +maxPrice : undefined,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.findOne(id);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.update(id, user.userId, updateCourseDto);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id/submit-for-review')
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
  async approveCourse(@Param('id') id: string): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.approveCourse(id);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Patch(':id/reject')
  async rejectCourse(@Param('id') id: string): Promise<ApiResponse<CourseResponse>> {
    const course = await this.coursesService.rejectCourse(id);
    return { success: true, data: course };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<{ message: string }>> {
    const result = await this.coursesService.remove(id);
    return { success: true, data: result };
  }
}
