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
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  @Roles(UserRole.INSTRUCTOR)
  @Post()
  create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.coursesService.create(createCourseDto, user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get('my-courses')
  async findInstructorCourses(@CurrentUser() user: { userId: string }) {
    return this.coursesService.findInstructorCourses(user.userId);
  }

  @Get()
  findAll(@Query('skip') skip?: number, @Query('limit') limit?: number) {
    return this.coursesService.findAll(skip ? +skip : 0, limit ? +limit : 10);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.coursesService.update(id, user.userId, updateCourseDto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.coursesService.remove(id);
  }
}
