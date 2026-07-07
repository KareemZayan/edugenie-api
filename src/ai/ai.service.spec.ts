import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AiService } from './ai.service';
import { QuestionType } from '../common/enums/questionsType.enum';
import { QuizDifficulty } from '../common/enums/quizDifficulty.enum';

/**
 * Focuses on generateQuizQuestions — the SBG gateway call, tolerant JSON
 * parsing, and the strict per-type validation/normalization that protects the
 * database. `fetch` (the gateway transport) and the Mongo deps are mocked, so
 * no network or DB is touched.
 */
describe('AiService.generateQuizQuestions', () => {
  let service: AiService;
  let fetchMock: jest.Mock;

  const baseParams = {
    sectionTitle: 'Intro to Promises',
    sectionDescription: 'Async JS fundamentals',
    lessons: [{ title: 'Promises 101', transcript: 'A promise represents...' }],
    difficulty: QuizDifficulty.EASY,
    questionTypes: [QuestionType.SINGLE_CHOICE],
    numberOfQuestions: 5,
  };

  /** Make the gateway return `payload` as the assistant's (stringified) reply. */
  const gatewayReturns = (payload: unknown, asString = true) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: asString ? JSON.stringify(payload) : payload,
      }),
    });
  };

  beforeEach(() => {
    process.env.SBG_API_URL = 'https://gw.test/api/v1';
    process.env.SBG_API_KEY = 'sbg_test_key';
    delete process.env.SBG_MODEL;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // Direct construction with stub deps — generateQuizQuestions never uses them.
    service = new AiService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    delete process.env.SBG_API_URL;
    delete process.env.SBG_API_KEY;
    jest.clearAllMocks();
  });

  it('throws (and never calls the gateway) when not configured', async () => {
    delete process.env.SBG_API_URL;
    service = new AiService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.generateQuizQuestions(baseParams),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the gateway contract to {URL}/student/chat', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'Pick one',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B', 'C', 'D'],
          correctAnswers: ['B'],
        },
      ],
    });

    await service.generateQuizQuestions(baseParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.test/api/v1/student/chat');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sbg_test_key');
    const body = JSON.parse(init.body);
    expect(body.model_id).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    expect(typeof body.system_prompt).toBe('string');
    expect(body.messages[0].role).toBe('user');
    expect(typeof body.max_tokens).toBe('number');
  });

  it('keeps a well-formed SINGLE_CHOICE question', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'What is 2+2?',
          type: 'SINGLE_CHOICE',
          options: ['3', '4', '5', '6'],
          correctAnswers: ['4'],
        },
      ],
    });

    const result = await service.generateQuizQuestions(baseParams);
    expect(result).toEqual([
      {
        questionText: 'What is 2+2?',
        type: QuestionType.SINGLE_CHOICE,
        options: ['3', '4', '5', '6'],
        correctAnswers: ['4'],
      },
    ]);
  });

  it('parses JSON even when wrapped in a ```json code fence', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content:
          '```json\n' +
          JSON.stringify({
            questions: [
              {
                questionText: 'Fenced',
                type: 'SINGLE_CHOICE',
                options: ['A', 'B'],
                correctAnswers: ['A'],
              },
            ],
          }) +
          '\n```',
      }),
    });

    const result = await service.generateQuizQuestions(baseParams);
    expect(result[0].questionText).toBe('Fenced');
  });

  it('drops questions whose correct answer is not among the options', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'Bad',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B'],
          correctAnswers: ['Z'],
        },
        {
          questionText: 'Good',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B'],
          correctAnswers: ['A'],
        },
      ],
    });

    const result = await service.generateQuizQuestions(baseParams);
    expect(result).toHaveLength(1);
    expect(result[0].questionText).toBe('Good');
  });

  it('trims a SINGLE_CHOICE question with multiple correct answers down to one', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'Too many correct',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B', 'C'],
          correctAnswers: ['A', 'B'],
        },
      ],
    });

    const result = await service.generateQuizQuestions(baseParams);
    expect(result[0].correctAnswers).toEqual(['A']);
  });

  it('enforces the requested type, overriding the model for non-MIXED quizzes', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'Model claims multi',
          type: 'MULTI_CHOICE',
          options: ['A', 'B', 'C', 'D'],
          correctAnswers: ['A', 'B'],
        },
      ],
    });

    const result = await service.generateQuizQuestions({
      ...baseParams,
      questionTypes: [QuestionType.SINGLE_CHOICE],
    });
    expect(result[0].type).toBe(QuestionType.SINGLE_CHOICE);
    expect(result[0].correctAnswers).toHaveLength(1);
  });

  it('normalizes TRUE_FALSE to ["True","False"] and a single answer', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'The sky is blue',
          type: 'TRUE_FALSE',
          options: ['true', 'false'],
          correctAnswers: ['true'],
        },
      ],
    });

    const result = await service.generateQuizQuestions({
      ...baseParams,
      questionTypes: [QuestionType.TRUE_FALSE],
    });
    expect(result[0].options).toEqual(['True', 'False']);
    expect(result[0].correctAnswers).toEqual(['True']);
  });

  it('respects per-question types when multiple types are requested', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'TF one',
          type: 'TRUE_FALSE',
          options: ['True', 'False'],
          correctAnswers: ['False'],
        },
        {
          questionText: 'Single one',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B', 'C', 'D'],
          correctAnswers: ['C'],
        },
      ],
    });

    const result = await service.generateQuizQuestions({
      ...baseParams,
      questionTypes: [QuestionType.TRUE_FALSE, QuestionType.SINGLE_CHOICE],
    });
    expect(result.map((q) => q.type)).toEqual([
      QuestionType.TRUE_FALSE,
      QuestionType.SINGLE_CHOICE,
    ]);
  });

  it('slices the result to the requested number of questions', async () => {
    gatewayReturns({
      questions: Array.from({ length: 8 }, (_, i) => ({
        questionText: `Q${i}`,
        type: 'SINGLE_CHOICE',
        options: ['A', 'B', 'C', 'D'],
        correctAnswers: ['A'],
      })),
    });

    const result = await service.generateQuizQuestions({
      ...baseParams,
      numberOfQuestions: 5,
    });
    expect(result).toHaveLength(5);
  });

  it('throws when the model yields zero valid questions', async () => {
    gatewayReturns({
      questions: [
        {
          questionText: 'No valid correct',
          type: 'SINGLE_CHOICE',
          options: ['A', 'B'],
          correctAnswers: ['Z'],
        },
      ],
    });

    await expect(
      service.generateQuizQuestions(baseParams),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailable when the gateway reply is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'sorry, I cannot do that' }),
    });

    await expect(
      service.generateQuizQuestions(baseParams),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailable on a non-2xx gateway response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Incorrect API key',
    });

    await expect(
      service.generateQuizQuestions(baseParams),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailable when the gateway request rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      service.generateQuizQuestions(baseParams),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('AiService tutor — access + scope', () => {
  beforeEach(() => {
    process.env.SBG_API_URL = 'https://gw.test/api';
    process.env.SBG_API_KEY = 'sbg_test_key';
  });
  afterEach(() => {
    delete process.env.SBG_API_URL;
    delete process.env.SBG_API_KEY;
    jest.clearAllMocks();
  });

  async function drain(gen: AsyncGenerator<string>): Promise<string> {
    const out: string[] = [];
    for await (const x of gen) out.push(x);
    return out.join('');
  }

  it('course chat: blocks a section-only owner (full course required)', async () => {
    const enroll = {
      getCourseAccess: jest.fn().mockResolvedValue({
        accessType: 'section',
        accessibleSections: ['s1'],
        totalSections: 2,
      }),
    };
    const svc = new AiService(
      {} as never,
      {} as never,
      enroll as never,
      {} as never,
    );
    const courseId = new Types.ObjectId().toString();
    await expect(
      drain(svc.streamCourseChat(courseId, 'u1', 'hello')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lesson chat: retrieves scoped to the WHOLE section (not one lesson)', async () => {
    const lessonId = new Types.ObjectId();
    const sectionId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
    const course = {
      _id: courseId,
      title: 'Course',
      sections: [
        {
          _id: sectionId,
          title: 'Section A',
          lessons: [{ _id: lessonId, title: 'L1', transcript: 'content' }],
        },
      ],
    };
    const courseModel = {
      findOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => ({ exec: () => Promise.resolve(course) }) }),
      }),
    };
    const enroll = { canAccessLesson: jest.fn().mockResolvedValue(true) };
    const retrieval = { retrieve: jest.fn().mockResolvedValue([]) };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'answer' }),
    }) as unknown as typeof fetch;

    const svc = new AiService(
      courseModel as never,
      {} as never,
      enroll as never,
      retrieval as never,
    );
    await drain(svc.streamLessonChat(lessonId.toString(), 'u1', 'where is X?'));

    expect(retrieval.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: courseId.toString(),
        sectionIds: [sectionId.toString()],
      }),
    );
  });
});
