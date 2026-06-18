import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LessonDetailResponse } from './interfaces/lesson-detail-response.interface';
import { UserRole } from '../common/enums/user-role.enum';

@Controller('lessons')
export class StudentLessonsController {
  constructor(private readonly lessonsService: LessonsService) { }

  @Get(':lessonId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async findOne(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<LessonDetailResponse> {
    return this.lessonsService.findOneForStudent(lessonId, user.userId);
  }
}
