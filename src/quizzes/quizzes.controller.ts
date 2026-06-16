import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) { }

  @Roles(UserRole.INSTRUCTOR)
  @Post('course/:courseId')
  createQuiz(
    @Param('courseId') courseId: string,
    @Body() body: { title: string; questions: any[] }
  ) {
    return this.quizzesService.createQuiz(courseId, body.title, body.questions);
  }

  @Roles(UserRole.STUDENT)
  @Post(':quizId/submit')
  submitQuiz(
    @Param('quizId') quizId: string,
    @Body('answers') answers: number[],
    @CurrentUser() user: { userId: string }
  ) {
    return this.quizzesService.submitQuiz(user.userId, quizId, answers);
  }
}