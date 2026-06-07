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

@UseGuards(JwtAuthGuard)
@Controller('courses/:courseId/sections/:sectionId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) { }

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

  @Patch(':lessonId')
  updateLesson(
    @Param('id') courseId: string,
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

  @Delete(':lessonId')
  removeLesson(
    @Param('id') courseId: string,
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
