import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('courses/:id/sections/:sectionId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  addLesson(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() createLessonDto: CreateLessonDto,
    @Req() req: { user: { userId: string } },
  ) {
    const instructorId = req.user?.userId;

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
    @Body() updateLessonDto: any,
    @Req() req: { user: { userId: string } },
  ) {
    return this.lessonsService.updateLesson(
      courseId,
      sectionId,
      lessonId,
      req.user.userId,
      updateLessonDto,
    );
  }

  @Delete(':lessonId')
  removeLesson(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.lessonsService.removeLesson(
      courseId,
      sectionId,
      lessonId,
      req.user.userId,
    );
  }
}
