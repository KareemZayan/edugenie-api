import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApproveQuizDto } from './dto/approve-quiz.dto';
import {
  PendingQuizListItem,
  QuizDetailForInstructorResponse,
  QuizApproveResponse,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructor/quizzes')
export class InstructorQuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('pending-review')
  async getPendingReview(
    @CurrentUser() user: { userId: string },
  ): Promise<{ data: PendingQuizListItem[] }> {
    return this.quizzesService.findPendingReviewForInstructor(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get(':id')
  async getQuizDetail(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizDetailForInstructorResponse> {
    return this.quizzesService.findOneForInstructor(id, user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id/approve')
  async approveQuiz(
    @Param('id') id: string,
    @Body() dto: ApproveQuizDto,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizApproveResponse> {
    return this.quizzesService.approveQuiz(id, user.userId, dto as unknown as Record<string, unknown>);
  }
}
