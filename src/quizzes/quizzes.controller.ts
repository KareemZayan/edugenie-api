import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { QuizSerializer } from './serializers/quiz.serializer';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quizzes')
@ApiTags('Quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Post('generate')
  @ApiOperation({ summary: 'Generate quiz config' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: CreateQuizDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async generateQuizConfig(
    @Body() dto: CreateQuizDto,
  ): Promise<{ message: string; quiz: QuizSerializer }> {
    return this.quizzesService.saveQuizConfig(dto);
  }
}
