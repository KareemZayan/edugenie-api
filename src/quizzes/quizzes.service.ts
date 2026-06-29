import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quiz } from './schema/quiz.schema';
import { QuizAttempt } from './schema/quiz-attempt.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Course } from '../courses/schema/course.schema';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { QuizGenerationStatus } from '../common/enums/questionsGenerationStatus.enum';
import { ProgressService } from '../progress/progress.service';
import { QuizSerializer } from './serializers/quiz.serializer';
import { AiService } from '../ai/ai.service';
import {
  QuizForStudentResponse,
  QuizStartResponse,
  QuizSubmitResponse,
  QuizAttemptsHistoryResponse,
} from '../common/interfaces/frontend-contracts';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name) private quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private enrollmentsService: EnrollmentsService,
    @Inject(forwardRef(() => ProgressService)) private progressService: ProgressService,
    private aiService: AiService,
  ) { }

  async saveQuizConfig(dto: CreateQuizDto) {
    // Pull the section's lessons up front so a missing/foreign section fails
    // before we create any quiz document or call the (paid) AI provider.
    const content = await this.getSectionContent(dto.sectionId);

    const quiz = await this.quizModel.create({
      sectionId: new Types.ObjectId(dto.sectionId),
      difficulty: dto.difficulty,
      numberOfQuestions: dto.numberOfQuestions,
      questionType: dto.questionType,
      generationStatus: QuizGenerationStatus.GENERATING,
      questions: [],
    });

    // Generate synchronously: on Vercel the function is suspended right after
    // the response, so a background job would never run. If generation fails we
    // delete the just-created quiz and surface the error rather than leaving an
    // empty quiz the instructor can never use.
    try {
      const questions = await this.aiService.generateQuizQuestions({
        sectionTitle: content.sectionTitle,
        sectionDescription: content.sectionDescription,
        lessons: content.lessons,
        difficulty: dto.difficulty,
        questionType: dto.questionType,
        numberOfQuestions: dto.numberOfQuestions,
      });

      quiz.questions = questions;
      quiz.generationStatus = QuizGenerationStatus.COMPLETED;
      await quiz.save();
    } catch (error) {
      await this.quizModel.deleteOne({ _id: quiz._id }).exec();
      throw error;
    }

    return {
      message: `AI generated ${quiz.questions.length} questions. Review and approve them to publish the quiz.`,
      quiz: new QuizSerializer(quiz.toObject() as unknown as Partial<QuizSerializer>),
    };
  }

  /**
   * Collect the lesson titles + transcripts for a section, used as grounding
   * material for AI quiz generation. Throws if the section does not exist.
   */
  private async getSectionContent(sectionId: string): Promise<{
    sectionTitle: string;
    sectionDescription?: string;
    lessons: { title: string; transcript?: string }[];
  }> {
    if (!Types.ObjectId.isValid(sectionId)) {
      throw new BadRequestException('Invalid section ID');
    }

    const course = await this.courseModel
      .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
      .select('sections')
      .lean<{
        sections: {
          _id: Types.ObjectId;
          title: string;
          description?: string;
          lessons: { title: string; transcript?: string }[];
        }[];
      }>()
      .exec();

    const section = course?.sections.find((s) => s._id.toString() === sectionId);
    if (!section) {
      throw new NotFoundException('Section not found');
    }

    return {
      sectionTitle: section.title,
      sectionDescription: section.description,
      lessons: (section.lessons ?? []).map((l) => ({
        title: l.title,
        transcript: l.transcript,
      })),
    };
  }

  async getQuizForStudent(sectionId: string, studentId: string): Promise<QuizForStudentResponse> {
    const hasAccess = await this.enrollmentsService.canAccessSection(studentId, sectionId);
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to access its quiz',
      );
    }

    const quiz = await this.quizModel.findOne({
      sectionId: new Types.ObjectId(sectionId),
    });
    if (!quiz) {
      throw new NotFoundException('Quiz not found for this section');
    }

    if (
      quiz.generationStatus !== QuizGenerationStatus.COMPLETED ||
      !quiz.questions.length
    ) {
      throw new BadRequestException('Quiz is not ready yet');
    }

    if (quiz.status !== 'approved') {
      throw new BadRequestException(
        'Quiz is currently pending instructor review',
      );
    }

    const attemptCount = await this.quizAttemptModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      quizId: quiz._id,
      status: { $in: ['submitted', 'expired'] },
    });

    if (attemptCount >= quiz.maxAttempts) {
      throw new ForbiddenException(
        'You have used all available attempts for this quiz',
      );
    }

    const questions = quiz.questions.map((q, index) => {
      // In this system, questions don't have explicit string IDs mapped to them yet,
      // but mongoose creates an _id for subdocuments. Let's safely extract it.
      const qObj = q as unknown as {
        _id?: Types.ObjectId;
        questionText: string;
        options: string[];
      };
      return {
        questionId: qObj._id ? qObj._id.toString() : index.toString(),
        text: qObj.questionText,
        options: qObj.options.map((opt: string) => ({
          optionId: opt, // using text as optionId for simplicity, or we could index
          text: opt,
        })),
      };
    });

    return {
      quizId: quiz._id.toString(),
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      attemptNumber: attemptCount + 1,
      maxAttempts: quiz.maxAttempts,
      attemptsRemaining: quiz.maxAttempts - attemptCount,
      questions,
    };
  }

  async startAttempt(
    sectionId: string,
    studentId: string,
  ): Promise<QuizStartResponse> {
    const hasAccess = await this.enrollmentsService.canAccessSection(
      studentId,
      sectionId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to access its quiz',
      );
    }

    const quiz = await this.quizModel.findOne({
      sectionId: new Types.ObjectId(sectionId),
    });
    if (!quiz) {
      throw new NotFoundException('Quiz not found for this section');
    }

    if (
      quiz.generationStatus !== QuizGenerationStatus.COMPLETED ||
      !quiz.questions.length
    ) {
      throw new BadRequestException('Quiz is not ready yet');
    }

    if (quiz.status !== 'approved') {
      throw new BadRequestException(
        'Quiz is currently pending instructor review',
      );
    }

    const existing = await this.quizAttemptModel.findOne({
      studentId: new Types.ObjectId(studentId),
      quizId: quiz._id,
      status: 'in_progress',
    });

    if (existing) {
      return {
        attemptId: existing._id.toString(),
        startedAt: existing.startedAt,
        timeLimit: existing.timeLimit,
      };
    }

    const attemptCount = await this.quizAttemptModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      quizId: quiz._id,
      status: { $ne: 'in_progress' },
    });

    if (attemptCount >= quiz.maxAttempts) {
      throw new ForbiddenException('No attempts remaining');
    }

    let newAttempt;
    try {
      newAttempt = await this.quizAttemptModel.create({
        studentId: new Types.ObjectId(studentId),
        quizId: quiz._id,
        sectionId: new Types.ObjectId(sectionId),
        attemptNumber: attemptCount + 1,
        startedAt: new Date(),
        timeLimit: quiz.timeLimit,
        totalQuestions: quiz.questions.length,
        status: 'in_progress',
      });
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err.code === 11000) {
        // Race condition: another request just created this attempt
        const concurrentAttempt = await this.quizAttemptModel.findOne({
          studentId: new Types.ObjectId(studentId),
          quizId: quiz._id,
          status: 'in_progress',
        });
        if (concurrentAttempt) {
          return {
            attemptId: concurrentAttempt._id.toString(),
            startedAt: concurrentAttempt.startedAt,
            timeLimit: concurrentAttempt.timeLimit,
          };
        }
      }
      throw error;
    }

    return {
      attemptId: newAttempt._id.toString(),
      startedAt: newAttempt.startedAt,
      timeLimit: newAttempt.timeLimit,
    };
  }

  async submitAttempt(
    sectionId: string,
    dto: SubmitQuizDto,
    studentId: string,
  ): Promise<QuizSubmitResponse> {
    const attempt = await this.quizAttemptModel.findById(dto.attemptId);
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.studentId.toString() !== studentId) {
      throw new ForbiddenException('This attempt does not belong to you');
    }

    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('This attempt has already been submitted');
    }

    const elapsedSeconds = (Date.now() - attempt.startedAt.getTime()) / 1000;
    const isExpired = elapsedSeconds > attempt.timeLimit;

    if (isExpired) {
      const expiredUpdate = await this.quizAttemptModel.updateOne(
        { _id: attempt._id, status: 'in_progress' },
        {
          $set: {
            status: 'expired',
            score: 0,
            passed: false,
            correctAnswers: 0,
            submittedAt: new Date(),
          },
        },
      );

      if (expiredUpdate.modifiedCount === 0) {
        throw new BadRequestException(
          'This attempt was already submitted by another concurrent request',
        );
      }

      throw new BadRequestException(
        'Time limit exceeded — this attempt has expired and been recorded as failed',
      );
    }

    const quiz = await this.quizModel.findById(attempt.quizId);
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    let correctCount = 0;

    for (const submittedAnswer of dto.answers) {
      // Find matching question by checking if string ID matches or index matches
      const question = quiz.questions.find((q: unknown, idx: number) => {
        const qObj = q as { _id?: Types.ObjectId; correctAnswers: string[] };
        const idStr = qObj._id ? qObj._id.toString() : idx.toString();
        return idStr === submittedAnswer.questionId;
      }) as { _id?: Types.ObjectId; correctAnswers: string[] } | undefined;

      if (!question) {
        throw new BadRequestException(
          `Invalid questionId: ${submittedAnswer.questionId}`,
        );
      }

      const correctSorted = [...question.correctAnswers].sort();
      const submittedSorted = [...submittedAnswer.selectedOptionIds].sort();

      const isCorrect =
        correctSorted.length === submittedSorted.length &&
        correctSorted.every((val, index) => val === submittedSorted[index]);

      if (isCorrect) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScore;

    const updateResult = await this.quizAttemptModel.updateOne(
      { _id: attempt._id, status: 'in_progress' },
      {
        $set: {
          answers: dto.answers,
          score,
          passed,
          correctAnswers: correctCount,
          submittedAt: new Date(),
          status: 'submitted',
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new BadRequestException(
        'This attempt was already submitted by another concurrent request',
      );
    }

    // Update the local instance just in case we need it
    attempt.attemptNumber = attempt.attemptNumber; // already correct

    let nextSectionUnlocked = false;

    if (passed) {
      // Notify Progress tracking that the quiz has been passed
      const progressResult = await this.progressService.markQuizPassed(
        studentId,
        sectionId,
      );
      nextSectionUnlocked = progressResult.nextSectionUnlocked;

      // Check if course completed
      const sectionObj = await this.courseModel
        .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>();
      if (sectionObj) {
        // Verify overall course completion logic from enrollments service or run it here
        const courseId = sectionObj._id;
        const course = await this.courseModel.findById(courseId);
        if (course) {
          const allSections = course.sections.map((s) => s._id.toString());
          if (progressResult.isCourseCompleted) {
            const enrollment = await this.enrollmentModel
              .findOneAndUpdate(
                {
                  courseId: courseId,
                  studentId: new Types.ObjectId(studentId),
                },
                { $set: { isCourseCompleted: true } },
                { new: true },
              )
              .exec();

            if (enrollment) {
              await this.notificationModel.create({
                userId: new Types.ObjectId(studentId),
                title: 'Certificate Earned!',
                message: `Congratulations! You passed the quiz and completed ${course.title}. Your certificate is ready.`,
                type: 'CERTIFICATE_EARNED',
                isRead: false,
              });
            }
          }
        }
      }
    }

    const totalAttempts = await this.quizAttemptModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      quizId: quiz._id,
      status: { $in: ['submitted', 'expired'] },
    });

    const remainingAttempts = Math.max(0, quiz.maxAttempts - totalAttempts);
    const progressReset = !passed && remainingAttempts === 0;

    return {
      passed,
      score,
      correctAnswers: correctCount,
      totalQuestions: quiz.questions.length,
      attemptNumber: attempt.attemptNumber,
      remainingAttempts,
      progressReset,
      nextSectionUnlocked,
    };
  }

  async getAttemptHistory(
    sectionId: string,
    studentId: string,
  ): Promise<QuizAttemptsHistoryResponse> {
    const hasAccess = await this.enrollmentsService.canAccessSection(
      studentId,
      sectionId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to access its quiz history',
      );
    }

    const quiz = await this.quizModel.findOne({
      sectionId: new Types.ObjectId(sectionId),
    });
    if (!quiz) {
      throw new NotFoundException('Quiz not found for this section');
    }

    const attempts = await this.quizAttemptModel
      .find({
        studentId: new Types.ObjectId(studentId),
        quizId: quiz._id,
      })
      .sort({ attemptNumber: 1 })
      .select('attemptNumber score passed submittedAt status')
      .exec();

    const submittedCount = attempts.filter(
      (a) => a.status !== 'in_progress',
    ).length;
    const canRetry =
      submittedCount < quiz.maxAttempts &&
      !attempts.some((a) => a.passed === true);

    return {
      attempts: attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        score: a.score,
        passed: a.passed,
        submittedAt: a.submittedAt,
      })),
      canRetry,
    };
  }

  async findPendingReviewForInstructor(instructorId: string) {
    const courses = await this.courseModel
      .find({ instructorId: new Types.ObjectId(instructorId) })
      .select('sections title')
      .exec();

    const sectionIds: Types.ObjectId[] = [];
    const sectionToCourseMap = new Map<string, string>();
    const sectionToTitleMap = new Map<string, string>();

    courses.forEach((c) => {
      if (c.sections) {
        c.sections.forEach((s) => {
          sectionIds.push(s._id);
          sectionToCourseMap.set(s._id.toString(), c.title);
          sectionToTitleMap.set(s._id.toString(), s.title);
        });
      }
    });

    const pendingQuizzes = await this.quizModel
      .find({
        sectionId: { $in: sectionIds },
        status: 'pending_review',
      })
      .exec();

    const data = pendingQuizzes.map((q) => ({
      quizId: q._id.toString(),
      sectionId: q.sectionId.toString(),
      sectionTitle: sectionToTitleMap.get(q.sectionId.toString()) || 'Unknown',
      courseTitle: sectionToCourseMap.get(q.sectionId.toString()) || 'Unknown',
      questionCount: q.questions ? q.questions.length : 0,
      generatedAt:
        (q as unknown as { updatedAt?: Date; createdAt?: Date }).updatedAt ||
        (q as unknown as { createdAt?: Date }).createdAt ||
        new Date(), // generation updates the document
    }));

    return { data };
  }

  async findOneForInstructor(quizId: string, instructorId: string) {
    const quiz = await this.quizModel.findById(quizId).exec();
    if (!quiz) throw new NotFoundException('Quiz not found');

    const course = await this.courseModel
      .findOne({ 'sections._id': quiz.sectionId })
      .select('instructorId')
      .exec();
    if (!course) throw new NotFoundException('Course for this quiz not found');

    // OWNERSHIP CHECK ENFORCED
    if (course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this quiz');
    }

    return {
      quizId: quiz._id.toString(),
      sectionId: quiz.sectionId.toString(),
      questions: quiz.questions.map((q, index: number) => {
        const questionObj = q as unknown as {
          _id?: Types.ObjectId;
          questionText: string;
          options: string[];
          correctAnswers: string[];
        };
        return {
          questionId: questionObj._id
            ? questionObj._id.toString()
            : index.toString(),
          text: questionObj.questionText,
          options: questionObj.options.map((opt: string) => ({
            optionId: opt,
            text: opt,
          })),
          correctAnswers: questionObj.correctAnswers,
        };
      }),
    };
  }

  async approveQuiz(
    quizId: string,
    instructorId: string,
    dto: Record<string, unknown>,
  ) {
    const quiz = await this.quizModel.findById(quizId).exec();
    if (!quiz) throw new NotFoundException('Quiz not found');

    const course = await this.courseModel
      .findOne({ 'sections._id': quiz.sectionId })
      .select('instructorId')
      .exec();
    if (!course) throw new NotFoundException('Course for this quiz not found');

    // OWNERSHIP CHECK ENFORCED
    if (course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this quiz');
    }

    const editedQuestions = dto.editedQuestions as
      | Array<{
          questionText: string;
          type: string;
          options: string[];
          correctAnswers: string[];
        }>
      | undefined;
    if (editedQuestions && editedQuestions.length > 0) {
      quiz.questions = editedQuestions as unknown as typeof quiz.questions;
    }

    quiz.status = 'approved';
    await quiz.save();

    return {
      quizId: quiz._id.toString(),
      status: quiz.status,
      approvedAt: new Date(),
    };
  }


  async findOneForInstructorBySection(sectionId: string, instructorId: string) {
  if (!Types.ObjectId.isValid(sectionId)) {
    throw new BadRequestException('Invalid section ID');
  }

  const course = await this.courseModel
    .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
    .select('instructorId')
    .exec();
  if (!course) throw new NotFoundException('Section not found');

  // OWNERSHIP CHECK ENFORCED
  if (course.instructorId.toString() !== instructorId) {
    throw new ForbiddenException('You do not own this section');
  }

  const quiz = await this.quizModel
    .findOne({ sectionId: new Types.ObjectId(sectionId) })
    .exec();

  if (!quiz) {
    return null; // no quiz generated yet for this section — frontend shows the form
  }

  return {
    quizId: quiz._id.toString(),
    sectionId: quiz.sectionId.toString(),
    difficulty: quiz.difficulty,
    numberOfQuestions: quiz.numberOfQuestions,
    questionType: quiz.questionType,
    generationStatus: quiz.generationStatus,
    status: quiz.status,
    questions: quiz.questions.map((q, index: number) => {
      const questionObj = q as unknown as {
        _id?: Types.ObjectId;
        questionText: string;
        options: string[];
        correctAnswers: string[];
      };
      return {
        questionId: questionObj._id
          ? questionObj._id.toString()
          : index.toString(),
        text: questionObj.questionText,
        options: questionObj.options.map((opt: string) => ({
          optionId: opt,
          text: opt,
        })),
        correctAnswers: questionObj.correctAnswers,
      };
    }),
  };
}


}
