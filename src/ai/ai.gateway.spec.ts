import { ForbiddenException } from '@nestjs/common';
import { AiGateway } from './ai.gateway';

/**
 * Exercises the gateway plumbing — handshake auth, the token pump, and error
 * framing — with the AI service and JWT verifier mocked. No socket server, no
 * DB, no OpenAI.
 */
describe('AiGateway', () => {
  let gateway: AiGateway;
  let aiService: { streamLessonChat: jest.Mock };
  let jwtService: { verify: jest.Mock };

  const makeClient = (overrides: Partial<any> = {}) => ({
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    disconnect: jest.fn(),
    handshake: { auth: {}, headers: {} },
    ...overrides,
  });

  async function* gen(...tokens: string[]) {
    for (const t of tokens) yield t;
  }

  beforeEach(() => {
    aiService = { streamLessonChat: jest.fn() };
    jwtService = { verify: jest.fn() };
    gateway = new AiGateway(aiService as never, jwtService as never);
  });

  describe('handleConnection', () => {
    it('stores the user when the handshake token is valid', () => {
      jwtService.verify.mockReturnValue({ id: 'u1', role: 'student' });
      const client = makeClient({ handshake: { auth: { token: 'good' }, headers: {} } });

      gateway.handleConnection(client as never);

      expect(client.data.user).toEqual({ userId: 'u1', role: 'student' });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects and disconnects when no token is present', () => {
      const client = makeClient();
      gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects and disconnects when the token is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      const client = makeClient({ handshake: { auth: { token: 'bad' }, headers: {} } });

      gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('reads the token from a jwt cookie when no auth token is given', () => {
      jwtService.verify.mockReturnValue({ id: 'u2', role: 'instructor' });
      const client = makeClient({
        handshake: { auth: {}, headers: { cookie: 'foo=1; jwt=abc.def.ghi' } },
      });

      gateway.handleConnection(client as never);

      expect(jwtService.verify).toHaveBeenCalledWith('abc.def.ghi');
      expect(client.data.user).toEqual({ userId: 'u2', role: 'instructor' });
    });
  });

  describe('lesson_chat', () => {
    it('streams tokens then a done frame, correlated by requestId', async () => {
      aiService.streamLessonChat.mockReturnValue(gen('Hello', ', ', 'world'));
      const client = makeClient();
      client.data.user = { userId: 'u1', role: 'student' };

      await gateway.lessonChat(client as never, {
        requestId: 'r1',
        lessonId: 'lesson1',
        message: 'hi',
      });

      expect(aiService.streamLessonChat).toHaveBeenCalledWith(
        'lesson1',
        'u1',
        'hi',
        undefined,
      );
      const emits = client.emit.mock.calls;
      expect(emits).toEqual([
        ['token', { requestId: 'r1', token: 'Hello' }],
        ['token', { requestId: 'r1', token: ', ' }],
        ['token', { requestId: 'r1', token: 'world' }],
        ['done', { requestId: 'r1' }],
      ]);
    });

    it('emits an error frame when the stream throws (e.g. no access)', async () => {
      aiService.streamLessonChat.mockReturnValue(
        (async function* () {
          throw new ForbiddenException('You must purchase this section');
        })(),
      );
      const client = makeClient();
      client.data.user = { userId: 'u1', role: 'student' };

      await gateway.lessonChat(client as never, {
        requestId: 'r2',
        lessonId: 'lesson1',
        message: 'hi',
      });

      expect(client.emit).toHaveBeenCalledWith('error', {
        requestId: 'r2',
        message: 'You must purchase this section',
      });
    });

    it('refuses an unauthenticated socket', async () => {
      const client = makeClient(); // no client.data.user

      await gateway.lessonChat(client as never, {
        lessonId: 'lesson1',
        message: 'hi',
      });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(aiService.streamLessonChat).not.toHaveBeenCalled();
    });
  });
});
