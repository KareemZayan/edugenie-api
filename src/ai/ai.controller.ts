import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AiService, ChatTurn } from './ai.service';
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

/** Body for every AI chat tier (history + optional roadmap goal). */
interface AiChatBody {
  message: string;
  history?: ChatTurn[];
  goal?: string;
}

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 3600000 } })
@Controller('ai')
@ApiTags('Ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Drain a streaming AI generator into a single reply string. The three tiers
   * are exposed over plain HTTP (request → full response) so the whole API can
   * run on serverless (Vercel) without a WebSocket server. The same
   * access-checked stream methods are reused; we just collect the tokens here.
   */
  private async collect(gen: AsyncGenerator<string>): Promise<string> {
    let reply = '';
    for await (const chunk of gen) reply += chunk;
    return reply.trim();
  }

  // Tier 1 — lesson tutor
  @Post('chat/:lessonId')
  @ApiOperation({ summary: 'Lesson AI tutor chat' })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiBody({ schema: { type: 'object', properties: { message: { type: 'string' } } } })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 201, description: 'Reply generated.' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'No access to this lesson.' })
  async chat(
    @Param('lessonId') lessonId: string,
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
  ) {
    const reply = await this.collect(
      this.aiService.streamLessonChat(
        lessonId,
        user.userId,
        body.message,
        body.history,
      ),
    );
    return { success: true, data: { reply } };
  }

  // Tier 2 — course tutor
  @Post('course-chat/:courseId')
  @ApiOperation({ summary: 'Course AI tutor chat' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 201, description: 'Reply generated.' })
  @SwaggerApiResponse({ status: 403, description: 'No access to this course.' })
  async courseChat(
    @Param('courseId') courseId: string,
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
  ) {
    const reply = await this.collect(
      this.aiService.streamCourseChat(
        courseId,
        user.userId,
        body.message,
        body.history,
      ),
    );
    return { success: true, data: { reply } };
  }

  // Tier 3 — roadmap advisor
  @Post('roadmap-chat')
  @ApiOperation({ summary: 'Roadmap AI advisor chat' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 201, description: 'Reply generated.' })
  async roadmapChat(
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
  ) {
    const reply = await this.collect(
      this.aiService.streamRoadmap(
        user.userId,
        body.goal ?? '',
        body.message,
        body.history,
      ),
    );
    return { success: true, data: { reply } };
  }
}
