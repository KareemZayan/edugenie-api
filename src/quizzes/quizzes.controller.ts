import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Post('generate')
  async generateQuizConfig(@Body() dto: CreateQuizDto): Promise<{ message: string; quiz: any }> {
    return this.quizzesService.saveQuizConfig(dto);
  }

  @Roles(UserRole.STUDENT)
  @Post(':id/attempts')
  async submitQuizAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<any>> {
    const result = await this.quizzesService.submitQuizAttempt(id, user.userId, dto);
    return { success: true, data: result };
  }
}