import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INSTRUCTOR)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }


  @Post()
  create(@Body() createCourseDto: CreateCourseDto, @Req() req: any) {
    return this.coursesService.create(createCourseDto, req.user.userId);
  }


  @Get('my-courses')
  async findInstructorCourses(@Req() req: any) {

    console.log('--- Fetching courses for userId ---', req.user.userId);
    return this.coursesService.findInstructorCourses(req.user.userId);
  }


  // @Get()
  // findAll() {
  //   return this.coursesService.findAll();
  // }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }


  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto, @Req() req: any) {
    return this.coursesService.update(id, req.user.userId, updateCourseDto);
  }


  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.coursesService.remove(id, req.user.userId);
  }
}