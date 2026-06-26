import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 3600000 } })
@Controller('ai')
@ApiTags('Ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat/:lessonId')
  @ApiOperation({ summary: 'Chat' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @SwaggerApiResponse({ status: 200, description: 'Streamed response' })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiBody({ schema: { type: 'string' } })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async chat(
    @Param('lessonId') lessonId: string,
    @Body('message') message: string,
    @CurrentUser() user: { userId: string },
  ) {
    const result = await this.aiService.chat(lessonId, user.userId, message);
    return { success: true, data: result };
  }
}
