import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('AiController', () => {
  let controller: AiController;
  const aiService = { chat: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    })
      // The controller is guarded by JwtAuthGuard + ThrottlerGuard, whose DI
      // isn't wired in this lightweight unit test — stub them out.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates chat() to AiService and wraps the result', async () => {
    aiService.chat.mockResolvedValue({ reply: 'hi there' });

    const result = await controller.chat('lesson1', 'hello', { userId: 'u1' });

    expect(aiService.chat).toHaveBeenCalledWith('lesson1', 'u1', 'hello');
    expect(result).toEqual({ success: true, data: { reply: 'hi there' } });
  });
});
