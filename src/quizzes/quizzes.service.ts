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
import { User } from '../users/schema/user.schema';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { QuizGenerationStatus } from '../common/enums/questionsGenerationStatus.enum';
import { ProgressService } from '../progress/progress.service';
import { QuizSerializer } from './serializers/quiz.serializer';
import { AiService } from '../ai/ai.service';
import { RemediationService } from '../ai/remediation.service';
import {
  QuizForStudentResponse,
  QuizStartResponse,
  QuizSubmitResponse,
  QuizAttemptsHistoryResponse,
} from '../common/interfaces/frontend-contracts';
import { QUIZ_REGEN_ENROLLMENT_THRESHOLD, MAX_QUIZZES_PER_SECTION } from '../common/constants/quiz.constant';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';


@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name) private quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(User.name) private userModel: Model<User>,
    private enrollmentsService: EnrollmentsService,
    @Inject(forwardRef(() => ProgressService))
    private progressService: ProgressService,
    private aiService: AiService,
    private remediationService: RemediationService,
    private notificationsService: NotificationsService,
  ) {}


async saveQuizConfig(dto: CreateQuizDto, instructorId: string) {
  const content = await this.getSectionContent(dto.sectionId);

  const course = await this.courseModel
    .findOne({ 'sections._id': new Types.ObjectId(dto.sectionId) })
    .select('_id instructorId title')
    .exec();
  if (!course) throw new NotFoundException('Section not found');
  
  // Verify that the instructor owns this course
  if (course.instructorId.toString() !== instructorId) {
    throw new ForbiddenException('You do not own this course');
  }
  
  const courseId = course._id.toString();

  // Step 1: Check if there's a pending_review quiz for this section
  const pendingQuiz = await this.quizModel.findOne({
    sectionId: new Types.ObjectId(dto.sectionId),
    status: 'pending_review',
  });

  // Step 2: If regenerating a pending quiz, skip all checks
  if (pendingQuiz) {
    console.log(`[QUIZ GENERATION] Regenerating pending quiz for section ${dto.sectionId}`);
  } else {
    // This is a NEW quiz generation - check all limits
    
    // Get all approved quizzes for this section, sorted by creation date
    const approvedQuizzes = await this.quizModel
      .find({
        sectionId: new Types.ObjectId(dto.sectionId),
        status: 'approved',
      })
      .sort({ createdAt: -1 })
      .exec();
    
    const approvedCount = approvedQuizzes.length;

    // Check: Maximum quizzes per section limit (5)
    if (approvedCount >= MAX_QUIZZES_PER_SECTION) {
      throw new ForbiddenException(
        `This section has reached the maximum limit of ${MAX_QUIZZES_PER_SECTION} quizzes. No more quizzes can be generated.`,
      );
    }

    // Check: Enrollment threshold
    const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
      courseId,
      dto.sectionId,
    );
    
    // Calculate the next quiz generation number
    const nextQuizNumber = approvedCount + 1;
    
    // If this is NOT the first quiz, check enrollment threshold
    if (approvedCount > 0) {
      const lastApprovedQuiz = approvedQuizzes[0]; // Most recent approved quiz
      const lastApprovalCount = lastApprovedQuiz.enrollmentCountAtApproval || lastApprovedQuiz.enrollmentCountAtGeneration;
      
      const newEnrollments = currentEnrollmentCount - lastApprovalCount;
      
      if (newEnrollments < QUIZ_REGEN_ENROLLMENT_THRESHOLD) {
        const remaining = QUIZ_REGEN_ENROLLMENT_THRESHOLD - newEnrollments;
        throw new ForbiddenException(
          `You need ${remaining} more new student enrollments in this section to generate a new quiz.`,
        );
      }
    }
    
    console.log(`[QUIZ GENERATION] Allowing quiz #${nextQuizNumber} for section ${dto.sectionId}. Current enrollments: ${currentEnrollmentCount}`);
  }

  // Step 3: Delete all non-approved quizzes (pending_review, rejected, etc.) when generating new quiz
  // This ensures clean state - only one "in-progress" quiz per section at a time
  const deletedResult = await this.quizModel.deleteMany({
    sectionId: new Types.ObjectId(dto.sectionId),
    status: { $ne: 'approved' },
  });
  if (deletedResult.deletedCount > 0) {
    console.log(`[QUIZ GENERATION] Deleted ${deletedResult.deletedCount} non-approved quiz(es) for section ${dto.sectionId}`);
  }

  const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
    courseId,
    dto.sectionId,
  );

  // Calculate the quiz generation number for this new quiz
  const approvedCount = await this.quizModel.countDocuments({
    sectionId: new Types.ObjectId(dto.sectionId),
    status: 'approved',
  });
  
  const quizGenerationNumber = approvedCount + 1;

  const quiz = await this.quizModel.create({
    sectionId: new Types.ObjectId(dto.sectionId),
    difficulty: dto.difficulty,
    numberOfQuestions: dto.numberOfQuestions,
    questionType: dto.questionType,
    generationStatus: QuizGenerationStatus.GENERATING,
    passingScore: 80,
    questions: [],
    enrollmentCountAtGeneration: currentEnrollmentCount,
    quizGenerationNumber: quizGenerationNumber,
    enrollmentCountAtApproval: 0, // Will be set when approved
  });

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

    console.log(`[QUIZ GENERATION] Successfully generated quiz #${quizGenerationNumber} for section ${dto.sectionId}`);

  } catch (error) {
    await this.quizModel.deleteOne({ _id: quiz._id }).exec();
    throw error;
  }

  return {
    message: `AI generated ${quiz.questions.length} questions. Review and approve them to publish the quiz.`,
    quiz: new QuizSerializer(
      quiz.toObject() as unknown as Partial<QuizSerializer>,
    ),
  };
}

/**
 * Blocks generation only when the section already has an APPROVED quiz and
 * not enough new enrollments have happened since that quiz was generated.
 * Any pending_review quiz has already been deleted by the time this runs,
 * so the baseline here is always the last approved snapshot.
 */
      private async assertEnoughNewEnrollments(
        sectionId: string,
        currentEnrollmentCount: number,
      ): Promise<void> {
        const lastApprovedQuiz = await this.quizModel
          .findOne({
            sectionId: new Types.ObjectId(sectionId),
            status: 'approved',
          })
          .sort({ createdAt: -1 })
          .select('enrollmentCountAtGeneration')
          .exec();

        if (!lastApprovedQuiz) return;

        const newEnrollments =
          currentEnrollmentCount - lastApprovedQuiz.enrollmentCountAtGeneration;

        if (newEnrollments < QUIZ_REGEN_ENROLLMENT_THRESHOLD) {
          const remaining = QUIZ_REGEN_ENROLLMENT_THRESHOLD - newEnrollments;
          throw new BadRequestException(
            `Not enough new enrollments yet — ${remaining} more student(s) must enroll in this section before you can generate another quiz.`,
          );
        }
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

    const section = course?.sections.find(
      (s) => s._id.toString() === sectionId,
    );
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

  async getQuizForStudent(
  sectionId: string,
  studentId: string,
): Promise<QuizForStudentResponse> {
  const hasAccess = await this.enrollmentsService.canAccessSection(studentId, sectionId);
  if (!hasAccess) {
    throw new ForbiddenException('You must purchase this section to access its quiz');
  }

  const quiz = await this.pickRandomApprovedQuiz(sectionId, studentId);

  const attemptCount = await this.quizAttemptModel.countDocuments({
    studentId: new Types.ObjectId(studentId),
    sectionId: new Types.ObjectId(sectionId),      // ← section-scoped
    status: { $in: ['submitted', 'expired'] },
  });

  if (attemptCount >= quiz.maxAttempts) {
    throw new ForbiddenException('You have used all available attempts for this quiz');
  }

  const questions = quiz.questions.map((q, index) => {
    const qObj = q as unknown as {
      _id?: Types.ObjectId; questionText: string; type: string; options: string[];
    };
    return {
      questionId: qObj._id ? qObj._id.toString() : index.toString(),
      text: qObj.questionText,
      type: qObj.type,
      options: qObj.options.map((opt) => ({ optionId: opt, text: opt })),
    };
  });

  return {
    quizId: quiz._id.toString(),
    timeLimit: quiz.timeLimit,
    passingScore: quiz.passingScore,
    attemptNumber: attemptCount + 1,
    maxAttempts: quiz.maxAttempts,
    attemptsRemaining: quiz.maxAttempts - attemptCount,
    questionType: quiz.questionType,
    questions,
  };
}

async startAttempt(sectionId: string, studentId: string): Promise<QuizStartResponse> {
  const hasAccess = await this.enrollmentsService.canAccessSection(studentId, sectionId);
  if (!hasAccess) {
    throw new ForbiddenException('You must purchase this section to access its quiz');
  }

  // Resume an in-progress attempt if one exists — same quiz, don't reroll.
  const inProgress = await this.quizAttemptModel.findOne({
    studentId: new Types.ObjectId(studentId),
    sectionId: new Types.ObjectId(sectionId),
    status: 'in_progress',
  });
  if (inProgress) {
    return {
      attemptId: inProgress._id.toString(),
      startedAt: inProgress.startedAt,
      timeLimit: inProgress.timeLimit,
    };
  }

  const attemptCount = await this.quizAttemptModel.countDocuments({
    studentId: new Types.ObjectId(studentId),
    sectionId: new Types.ObjectId(sectionId),
    status: { $ne: 'in_progress' },
  });

  const quiz = await this.pickRandomApprovedQuiz(sectionId, studentId);

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
      const concurrent = await this.quizAttemptModel.findOne({
        studentId: new Types.ObjectId(studentId),
        sectionId: new Types.ObjectId(sectionId),
        status: 'in_progress',
      });
      if (concurrent) {
        return {
          attemptId: concurrent._id.toString(),
          startedAt: concurrent.startedAt,
          timeLimit: concurrent.timeLimit,
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

/** Random approved+completed quiz from the section's pool. */
private async pickRandomApprovedQuiz(sectionId: string, studentId?: string) {
  const quizzes = await this.quizModel.find({
    sectionId: new Types.ObjectId(sectionId),
    status: 'approved',
    generationStatus: QuizGenerationStatus.COMPLETED,
  }).exec();

  if (!quizzes.length) {
    throw new NotFoundException('No approved quiz available for this section');
  }

  return quizzes[Math.floor(Math.random() * quizzes.length)];
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

      // Clear any active recovery plan for this section — they're past it now.
      void this.remediationService.resolveOnPass(studentId, sectionId);

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

    // Out of attempts on this section → generate a targeted recovery plan from
    // the wrong answers. Fire-and-forget: the service never throws, so it can't
    // break submission.
    if (progressReset) {
      void this.remediationService.generate({
        userId: studentId,
        sectionId,
        quizId: String(quiz._id),
        attemptId: String(attempt._id),
      });
    }

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
      .select('instructorId _id')
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

    // Get current enrollment count when approving
    const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
      course._id.toString(),
      quiz.sectionId.toString(),
    );
    
    quiz.status = 'approved';
    quiz.enrollmentCountAtApproval = currentEnrollmentCount;
    await quiz.save();

    console.log(`[QUIZ APPROVAL] Quiz ${quizId} approved with ${currentEnrollmentCount} enrollments`);

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

  async findAllForSection(sectionId: string, instructorId: string) {
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

    const quizzes = await this.quizModel
      .find({ sectionId: new Types.ObjectId(sectionId) })
      .sort({ createdAt: -1 })
      .exec();

    return {
      sectionId,
      totalQuizzes: quizzes.length,
      quizzes: quizzes.map((quiz) => ({
        quizId: quiz._id.toString(),
        difficulty: quiz.difficulty,
        numberOfQuestions: quiz.numberOfQuestions,
        questionType: quiz.questionType,
        generationStatus: quiz.generationStatus,
        status: quiz.status,
        timeLimit: quiz.timeLimit,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        enrollmentCountAtGeneration: quiz.enrollmentCountAtGeneration,
        createdAt: (quiz as unknown as { createdAt?: Date }).createdAt,
        updatedAt: (quiz as unknown as { updatedAt?: Date }).updatedAt,
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
      })),
    };
  }

  /**
   * Check if a section has reached the enrollment threshold to generate a new quiz.
   * If yes, notify the instructor with section and course details.
   */
  async checkAndNotifyQuizGenerationAvailable(
    courseId: string,
    sectionId: string,
    instructorId: string,
  ): Promise<void> {
    try {
      // Get current enrollment count for this section
      const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
        courseId,
        sectionId,
      );

      // Find the last approved quiz for this section
      const lastApprovedQuiz = await this.quizModel
        .findOne({
          sectionId: new Types.ObjectId(sectionId),
          status: 'approved',
        })
        .sort({ createdAt: -1 })
        .select('enrollmentCountAtApproval enrollmentCountAtGeneration regenNotified')
        .exec();

      if (!lastApprovedQuiz) return; // No approved quiz yet, no notification needed

      // BUG 1 FIX: Check if we already notified for this cycle (one-shot guard)
      if (lastApprovedQuiz.regenNotified) {
        console.log(`[QUIZ NOTIFICATION] Already notified for section ${sectionId}, skipping`);
        return;
      }

      // BUG 2 FIX: Use enrollmentCountAtApproval (matching saveQuizConfig's baseline)
      // Fall back to enrollmentCountAtGeneration for backwards compatibility
      const baselineEnrollmentCount = lastApprovedQuiz.enrollmentCountAtApproval || lastApprovedQuiz.enrollmentCountAtGeneration;
      const newEnrollments = currentEnrollmentCount - baselineEnrollmentCount;

      console.log(`[QUIZ NOTIFICATION] Section ${sectionId}: baseline=${baselineEnrollmentCount}, current=${currentEnrollmentCount}, new=${newEnrollments}, threshold=${QUIZ_REGEN_ENROLLMENT_THRESHOLD}`);

      if (newEnrollments >= QUIZ_REGEN_ENROLLMENT_THRESHOLD) {
        // Check if we haven't exceeded max quizzes per section
        const approvedQuizzesCount = await this.quizModel.countDocuments({
          sectionId: new Types.ObjectId(sectionId),
          status: 'approved',
        });

        if (approvedQuizzesCount < MAX_QUIZZES_PER_SECTION) {
          // Get section and course details
          const course = await this.courseModel
            .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
            .select('title sections')
            .lean()
            .exec();

          const section = course?.sections.find(s => s._id.toString() === sectionId);

          if (section) {
            // Send notification to instructor
            await this.notificationsService.create(
              new Types.ObjectId(instructorId),
              'New Quiz Generation Available',
              `Your section "${section.title}" in "${course?.title}" has reached ${QUIZ_REGEN_ENROLLMENT_THRESHOLD} new enrollments. You can now generate another quiz!`,
              NotificationType.QUIZ_GENERATION_AVAILABLE,
              courseId,
            );
            
            // BUG 1 FIX: Mark as notified to prevent duplicate notifications
            lastApprovedQuiz.regenNotified = true;
            await lastApprovedQuiz.save();
            
            console.log(`[QUIZ NOTIFICATION] Sent quiz generation available notification for section ${sectionId}`);
          }
        }
      }
    } catch (error) {
      console.error('[QUIZ NOTIFICATION] Failed to check and notify:', error);
      // Don't throw - this is a background check
    }
  }

  /**
   * Stub for instructor quiz generation status - implement if needed
   */
  async getInstructorQuizGenerationStatus(instructorId: string): Promise<{ status: string }> {
    return { status: 'unknown' };
  }

  async getEnrollmentStatusForSection(sectionId: string, instructorId: string) {
    if (!Types.ObjectId.isValid(sectionId)) {
      throw new BadRequestException('Invalid section ID');
    }

    // Verify instructor owns this section
    const course = await this.courseModel
      .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
      .select('instructorId _id')
      .exec();
    if (!course) throw new NotFoundException('Section not found');

    if (course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this section');
    }

    // Get current enrollment count
    const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
      course._id.toString(),
      sectionId,
    );

    // Get the last approved quiz to determine baseline
    const lastApprovedQuiz = await this.quizModel
      .findOne({
        sectionId: new Types.ObjectId(sectionId),
        status: 'approved',
      })
      .sort({ createdAt: -1 })
      .select('enrollmentCountAtApproval enrollmentCountAtGeneration quizGenerationNumber')
      .exec();

    let canGenerateQuiz = true;
    let enrollmentsNeeded = 0;
    let baselineEnrollmentCount = 0;
    let newEnrollmentsSinceLastApproval = 0;

    if (lastApprovedQuiz) {
      // Use enrollmentCountAtApproval, fall back to enrollmentCountAtGeneration for backwards compatibility
      baselineEnrollmentCount = lastApprovedQuiz.enrollmentCountAtApproval || lastApprovedQuiz.enrollmentCountAtGeneration || 0;
      newEnrollmentsSinceLastApproval = currentEnrollmentCount - baselineEnrollmentCount;
      
      if (newEnrollmentsSinceLastApproval < QUIZ_REGEN_ENROLLMENT_THRESHOLD) {
        canGenerateQuiz = false;
        enrollmentsNeeded = QUIZ_REGEN_ENROLLMENT_THRESHOLD - newEnrollmentsSinceLastApproval;
      }
    } else {
      // First quiz - no baseline needed
      canGenerateQuiz = true;
      enrollmentsNeeded = 0;
    }

    return {
      sectionId,
      currentEnrollmentCount,
      baselineEnrollmentCount,
      newEnrollmentsSinceLastApproval,
      enrollmentThreshold: QUIZ_REGEN_ENROLLMENT_THRESHOLD,
      enrollmentsNeeded,
      canGenerateQuiz,
      hasApprovedQuiz: !!lastApprovedQuiz,
      lastApprovedQuizGeneration: lastApprovedQuiz?.quizGenerationNumber || 0,
    };
  }

}
