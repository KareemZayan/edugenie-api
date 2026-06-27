import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
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
  QuizAttemptsHistoryResponse,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
@ApiTags('Section Quizzes')
export class SectionQuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.STUDENT)
  @Get(':sectionId/quiz')
  @ApiOperation({ summary: 'Get quiz' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getQuiz(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizForStudentResponse> {
    return this.quizzesService.getQuizForStudent(sectionId, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Post(':sectionId/quiz/start')
  @ApiOperation({ summary: 'Start quiz' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async startQuiz(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizStartResponse> {
    return this.quizzesService.startAttempt(sectionId, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Post(':sectionId/quiz/submit')
  @ApiOperation({ summary: 'Submit quiz' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiBody({ type: SubmitQuizDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async submitQuiz(
    @Param('sectionId') sectionId: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizSubmitResponse> {
    return this.quizzesService.submitAttempt(sectionId, dto, user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get(':sectionId/quiz/attempts')
  @ApiOperation({ summary: 'Get attempts' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getAttempts(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizAttemptsHistoryResponse> {
    return this.quizzesService.getAttemptHistory(sectionId, user.userId);
  }
}
