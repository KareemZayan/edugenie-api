import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 3600000 } })
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat/:lessonId')
  async chat(
    @Param('lessonId') lessonId: string,
    @Body('message') message: string,
    @CurrentUser() user: { userId: string }
  ) {
    const result = await this.aiService.chat(lessonId, user.userId, message);
    return { success: true, data: result };
  }
}
