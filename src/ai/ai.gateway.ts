import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AiService, ChatTurn } from './ai.service';

interface AuthedUser {
  userId: string;
  role: string;
}

interface LessonChatPayload {
  requestId?: string;
  lessonId: string;
  message: string;
  history?: ChatTurn[];
}

interface CourseChatPayload {
  requestId?: string;
  courseId: string;
  message: string;
  history?: ChatTurn[];
}

interface RoadmapChatPayload {
  requestId?: string;
  goal?: string;
  message: string;
  history?: ChatTurn[];
}

/**
 * Real-time chatbot transport for the three-tier AI tutor (SRS). Streams tokens
 * word-by-word over Socket.IO.
 *
 * NOTE ON DEPLOYMENT: this gateway needs a long-lived server, so it runs via the
 * normal `main.ts` process on an always-on host (Render/Railway/Fly). It does
 * NOT function on the Vercel serverless deployment (`lambda.ts`), which cannot
 * hold WebSocket connections. The REST API can stay on Vercel; point the
 * frontends at this host for the `/ai` namespace only.
 *
 * Protocol (per request, correlated by `requestId`):
 *   client emits  'lesson_chat' | 'course_chat' | 'roadmap_chat'
 *   server emits  'token'  { requestId, token }   // repeated, word-by-word
 *   server emits  'done'   { requestId }           // stream finished
 *   server emits  'error'  { requestId?, message } // auth/validation/AI failure
 */
@WebSocketGateway({
  namespace: '/ai',
  cors: {
    origin: [
      process.env.NEXTJS_APP_URL,
      process.env.ANGULAR_APP_URL,
      'http://localhost:3000',
      'http://localhost:4200',
    ].filter(Boolean) as string[],
    credentials: true,
  },
})
export class AiGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AiGateway.name);

  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
  ) {}

  /** Authenticate the socket once, at connection time. */
  handleConnection(client: Socket): void {
    try {
      client.data.user = this.authenticate(client);
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('lesson_chat')
  async lessonChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LessonChatPayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    await this.pump(client, payload?.requestId, () =>
      this.aiService.streamLessonChat(
        payload.lessonId,
        user.userId,
        payload.message,
        payload.history,
      ),
    );
  }

  @SubscribeMessage('course_chat')
  async courseChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CourseChatPayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    await this.pump(client, payload?.requestId, () =>
      this.aiService.streamCourseChat(
        payload.courseId,
        user.userId,
        payload.message,
        payload.history,
      ),
    );
  }

  @SubscribeMessage('roadmap_chat')
  async roadmapChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoadmapChatPayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    await this.pump(client, payload?.requestId, () =>
      this.aiService.streamRoadmap(
        user.userId,
        payload.goal ?? '',
        payload.message,
        payload.history,
      ),
    );
  }

  /** Drain an async token stream to the client, framing it with done/error. */
  private async pump(
    client: Socket,
    requestId: string | undefined,
    makeStream: () => AsyncGenerator<string>,
  ): Promise<void> {
    try {
      for await (const token of makeStream()) {
        client.emit('token', { requestId, token });
      }
      client.emit('done', { requestId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'AI service error';
      this.logger.warn(`AI stream error: ${message}`);
      client.emit('error', { requestId, message });
    }
  }

  private requireUser(client: Socket): AuthedUser | null {
    const user = client.data.user as AuthedUser | undefined;
    if (!user) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return null;
    }
    return user;
  }

  /** Verify the JWT from the socket handshake (auth token, header, or cookie). */
  private authenticate(client: Socket): AuthedUser {
    const token = this.extractToken(client);
    if (!token) throw new Error('Missing token');
    const payload = this.jwtService.verify<{ id: string; role: string }>(token);
    return { userId: payload.id, role: payload.role };
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    const cookie = client.handshake.headers.cookie;
    if (cookie) {
      const match = cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('jwt='));
      if (match) return decodeURIComponent(match.slice('jwt='.length));
    }
    return null;
  }
}
