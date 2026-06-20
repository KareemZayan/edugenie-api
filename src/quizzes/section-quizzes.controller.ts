import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { 
  QuizForStudentResponse, 
  QuizStartResponse, 
  QuizSubmitResponse, 
  QuizAttemptsHistoryResponse 
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
export class SectionQuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.STUDENT)
  @Get(':sectionId/quiz')
  async getQuiz(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizForStudentResponse> {
    return this.quizzesService.getQuizForStudent(sectionId, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Post(':sectionId/quiz/start')
  async startQuiz(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizStartResponse> {
    return this.quizzesService.startAttempt(sectionId, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Post(':sectionId/quiz/submit')
  async submitQuiz(
    @Param('sectionId') sectionId: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizSubmitResponse> {
    return this.quizzesService.submitAttempt(sectionId, dto, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get(':sectionId/quiz/attempts')
  async getAttempts(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizAttemptsHistoryResponse> {
    return this.quizzesService.getAttemptHistory(sectionId, user.userId);
  }
}
