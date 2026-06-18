import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';

@Controller('courses/:courseId/sections/:sectionId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  addLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() createLessonDto: CreateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;

    return this.lessonsService.addLesson(
      courseId,
      sectionId,
      instructorId,
      createLessonDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch('reorder')
  reorderLessons(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderLessonsDto,
    @CurrentUser() user: { userId: string },
  ) {
    console.log('🔥 REORDER HIT');
    console.log('BODY:', dto);
    return this.lessonsService.reorderLessons(
      courseId,
      sectionId,
      user.userId,
      dto.lessonIds,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':lessonId')
  updateLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.updateLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
      updateLessonDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Delete(':lessonId')
  removeLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.removeLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
    );
  }
}
