import { Controller, Post, Param, Body, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
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
   * Stream an AI generator to the client as Server-Sent Events (word-by-word,
   * "like ChatGPT"). SSE rides plain HTTP, so it works on serverless (Vercel)
   * — and if a host buffers the response, the client simply receives every
   * token at once (graceful degradation, no breakage).
   *
   * Wire protocol (one JSON object per `data:` frame):
   *   { "type": "token", "value": "..." }   // repeated
   *   { "type": "done" }                      // stream finished
   *   { "type": "error", "message": "..." }   // failure mid-stream
   *
   * Access / validation errors are thrown from the FIRST generator step, before
   * any SSE header is sent, so they surface as a normal 401/403/400 JSON error.
   */
  private async streamSse(
    res: Response,
    gen: AsyncGenerator<string>,
  ): Promise<void> {
    const iterator = gen[Symbol.asyncIterator]();

    // Run the first step up-front: this executes the access/validation checks
    // inside the generator. If it throws, we have NOT touched the response yet,
    // so Nest's exception filter returns the proper HTTP error.
    const first = await iterator.next();

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();

    const send = (obj: unknown) =>
      res.write(`data: ${JSON.stringify(obj)}\n\n`);

    try {
      if (!first.done) send({ type: 'token', value: first.value });
      let step = await iterator.next();
      while (!step.done) {
        send({ type: 'token', value: step.value });
        step = await iterator.next();
      }
      send({ type: 'done' });
    } catch (err) {
      send({
        type: 'error',
        message: err instanceof Error ? err.message : 'AI service error',
      });
    } finally {
      res.end();
    }
  }

  // Tier 1 — lesson tutor
  @Post('chat/:lessonId')
  @ApiOperation({ summary: 'Lesson AI tutor chat (SSE stream)' })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiBody({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'SSE token stream.' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'No access to this lesson.' })
  async chat(
    @Param('lessonId') lessonId: string,
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.streamSse(
      res,
      this.aiService.streamLessonChat(
        lessonId,
        user.userId,
        body.message,
        body.history,
      ),
    );
  }

  // Tier 2 — course tutor
  @Post('course-chat/:courseId')
  @ApiOperation({ summary: 'Course AI tutor chat (SSE stream)' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'SSE token stream.' })
  @SwaggerApiResponse({ status: 403, description: 'No access to this course.' })
  async courseChat(
    @Param('courseId') courseId: string,
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.streamSse(
      res,
      this.aiService.streamCourseChat(
        courseId,
        user.userId,
        body.message,
        body.history,
      ),
    );
  }

  // Tier 3 — roadmap advisor
  @Post('roadmap-chat')
  @ApiOperation({ summary: 'Roadmap AI advisor chat (SSE stream)' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'SSE token stream.' })
  async roadmapChat(
    @Body() body: AiChatBody,
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.streamSse(
      res,
      this.aiService.streamRoadmap(
        user.userId,
        body.goal ?? '',
        body.message,
        body.history,
      ),
    );
  }
}
