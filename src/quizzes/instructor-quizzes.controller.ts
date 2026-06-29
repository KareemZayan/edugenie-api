import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
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
@ApiTags('Instructor Quizzes')
export class InstructorQuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get('pending-review')
  @ApiOperation({ summary: 'Get pending review' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getPendingReview(
    @CurrentUser() user: { userId: string },
  ): Promise<{ data: PendingQuizListItem[] }> {
    return this.quizzesService.findPendingReviewForInstructor(user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Get(':id')
  @ApiOperation({ summary: 'Get quiz detail' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 404, description: 'Not Found.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getQuizDetail(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizDetailForInstructorResponse> {
    return this.quizzesService.findOneForInstructor(id, user.userId);
  }

  @Roles(UserRole.INSTRUCTOR)
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve quiz' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ApproveQuizDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async approveQuiz(
    @Param('id') id: string,
    @Body() dto: ApproveQuizDto,
    @CurrentUser() user: { userId: string },
  ): Promise<QuizApproveResponse> {
    return this.quizzesService.approveQuiz(
      id,
      user.userId,
      dto as unknown as Record<string, unknown>,
    );
  }

  @Roles(UserRole.INSTRUCTOR)
@Get('section/:sectionId')
@ApiOperation({ summary: 'Get quiz by section (for instructor review)' })
@SwaggerApiResponse({ status: 200, description: 'Success.' })
@SwaggerApiResponse({ status: 404, description: 'Not Found.' })
@ApiParam({ name: 'sectionId', type: String })
@ApiCookieAuth('jwt')
@ApiBearerAuth()
@SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
@SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
async getQuizBySection(
  @Param('sectionId') sectionId: string,
  @CurrentUser() user: { userId: string },
) {
  return this.quizzesService.findOneForInstructorBySection(sectionId, user.userId);
}
}
