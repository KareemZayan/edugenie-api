import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PracticeService } from './practice.service';
import { GeneratePracticeQuizDto } from './dto/generate-practice-quiz.dto';
import { SubmitPracticeQuizDto } from './dto/submit-practice-quiz.dto';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 3_600_000 } })
@ApiTags('Ai')
@Controller('ai/practice-quiz')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a targeted practice quiz for a section' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  @SwaggerApiResponse({ status: 201, description: 'Quiz generated (no answers).' })
  @SwaggerApiResponse({ status: 403, description: 'No access to this section.' })
  generate(
    @CurrentUser() user: { userId: string },
    @Body() dto: GeneratePracticeQuizDto,
  ) {
    return this.practice.generate(user.userId, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a practice quiz and get graded results' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  @SwaggerApiResponse({ status: 201, description: 'Graded results.' })
  submit(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SubmitPracticeQuizDto,
  ) {
    return this.practice.submit(user.userId, id, dto);
  }
}
