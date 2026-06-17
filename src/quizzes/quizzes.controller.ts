import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateQuizDto } from './dto/create-quiz.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Post('generate')
  generateQuizConfig(@Body() dto: CreateQuizDto) {
    return this.quizzesService.saveQuizConfig(dto);
  }
}