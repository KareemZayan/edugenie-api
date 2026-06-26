import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { QuizzesService } from './quizzes.service';
import { Quiz } from './schema/quiz.schema';
import { QuizAttempt } from './schema/quiz-attempt.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Course } from '../courses/schema/course.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { ProgressService } from '../progress/progress.service';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

describe('QuizzesService', () => {
  let service: QuizzesService;

  const mockQuizModel = {
    findById: jest.fn(),
  };

  const mockQuizAttemptModel = {
    findById: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
  };

  const mockNotificationModel = {
    create: jest.fn(),
  };

  const mockEnrollmentModel = {
    findOneAndUpdate: jest.fn(),
  };

  const mockCourseModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEnrollmentsService = {
    canAccessSection: jest.fn(),
  };

  const mockProgressService = {
    markQuizPassed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: getModelToken(Quiz.name), useValue: mockQuizModel },
        {
          provide: getModelToken(QuizAttempt.name),
          useValue: mockQuizAttemptModel,
        },
        {
          provide: getModelToken(Notification.name),
          useValue: mockNotificationModel,
        },
        {
          provide: getModelToken(Enrollment.name),
          useValue: mockEnrollmentModel,
        },
        { provide: getModelToken(Course.name), useValue: mockCourseModel },
        { provide: EnrollmentsService, useValue: mockEnrollmentsService },
        { provide: ProgressService, useValue: mockProgressService },
      ],
    }).compile();

    service = module.get<QuizzesService>(QuizzesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submitAttempt', () => {
    const sectionId = new Types.ObjectId().toString();
    const studentId = new Types.ObjectId().toString();
    const quizId = new Types.ObjectId().toString();
    const attemptId = new Types.ObjectId().toString();

    const mockQuiz = {
      _id: quizId,
      passingScore: 70,
      maxAttempts: 3,
      questions: [
        { _id: 'q1', correctAnswers: ['A', 'B'] },
        { _id: 'q2', correctAnswers: ['C'] },
      ],
    };

    const createMockAttempt = (overrides = {}) => {
      const attempt = {
        _id: attemptId,
        studentId: new Types.ObjectId(studentId),
        quizId: quizId,
        status: 'in_progress',
        startedAt: new Date(),
        timeLimit: 600,
        attemptNumber: 1,
        save: jest.fn().mockResolvedValue(true),
        ...overrides,
      };
      return attempt;
    };

    it('A fully correct submission scores 100', async () => {
      const attempt = createMockAttempt();
      mockQuizAttemptModel.findById.mockResolvedValue(attempt);
      mockQuizAttemptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockQuizModel.findById.mockResolvedValue(mockQuiz);
      mockQuizAttemptModel.countDocuments.mockResolvedValue(1);

      mockProgressService.markQuizPassed.mockResolvedValue({
        nextSectionUnlocked: true,
        isCourseCompleted: false,
      });
      mockCourseModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
          }),
      });

      const dto = {
        attemptId,
        answers: [
          { questionId: 'q1', selectedOptionIds: ['B', 'A'] },
          { questionId: 'q2', selectedOptionIds: ['C'] },
        ],
      };

      const result = await service.submitAttempt(sectionId, dto, studentId);

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.correctAnswers).toBe(2);
      expect(mockQuizAttemptModel.updateOne).toHaveBeenCalled();
    });

    it('A fully wrong submission scores 0', async () => {
      const attempt = createMockAttempt();
      mockQuizAttemptModel.findById.mockResolvedValue(attempt);
      mockQuizAttemptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockQuizModel.findById.mockResolvedValue(mockQuiz);
      mockQuizAttemptModel.countDocuments.mockResolvedValue(1);

      const dto = {
        attemptId,
        answers: [
          { questionId: 'q1', selectedOptionIds: ['C'] },
          { questionId: 'q2', selectedOptionIds: ['D'] },
        ],
      };

      const result = await service.submitAttempt(sectionId, dto, studentId);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.correctAnswers).toBe(0);
      expect(mockQuizAttemptModel.updateOne).toHaveBeenCalled();
    });

    it('Submitting after timeLimit has elapsed auto-fails with status expired', async () => {
      // Create an attempt that started 601 seconds ago (limit is 600)
      const pastDate = new Date(Date.now() - 601000);
      const attempt = createMockAttempt({ startedAt: pastDate });

      mockQuizAttemptModel.findById.mockResolvedValue(attempt);
      mockQuizAttemptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const dto = {
        attemptId,
        answers: [
          { questionId: 'q1', selectedOptionIds: ['A', 'B'] },
          { questionId: 'q2', selectedOptionIds: ['C'] },
        ],
      };

      await expect(
        service.submitAttempt(sectionId, dto, studentId),
      ).rejects.toThrow(
        'Time limit exceeded — this attempt has expired and been recorded as failed',
      );

      expect(mockQuizAttemptModel.updateOne).toHaveBeenCalled();
    });
  });
});
