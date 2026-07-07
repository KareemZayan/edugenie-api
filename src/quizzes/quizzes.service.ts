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
import { Quiz, QuizQuestion } from './schema/quiz.schema';
import { QuizAttempt } from './schema/quiz-attempt.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Course } from '../courses/schema/course.schema';
import { User } from '../users/schema/user.schema';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { ApproveQuizDto, EditedQuestionDto } from './dto/approve-quiz.dto';
import { SaveManualDraftDto } from './dto/save-manual-draft.dto';
import { QuizGenerationStatus } from '../common/enums/questionsGenerationStatus.enum';
import { QuizDifficulty } from '../common/enums/quizDifficulty.enum';
import { QuestionType } from '../common/enums/questionsType.enum';
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
import { QUIZ_REGEN_ENROLLMENT_THRESHOLD, MAX_QUIZZES_PER_SECTION, MAX_PENDING_QUIZZES_PER_SECTION, MAX_QUESTIONS_PER_QUIZ } from '../common/constants/quiz.constant';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { CertificatesService } from '../certificates/certificates.service';


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
    private certificatesService: CertificatesService,
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

  // ─── APPEND MODE: Adding AI questions to existing manual quiz ──────────────
  if (dto.quizId) {
    const quiz = await this.quizModel.findById(new Types.ObjectId(dto.quizId)).exec();
    if (!quiz) throw new NotFoundException('Quiz not found');

    // Verify quiz belongs to this section
    if (quiz.sectionId.toString() !== new Types.ObjectId(dto.sectionId).toString()) {
      throw new BadRequestException('Quiz does not belong to this section');
    }

    // Verify quiz is still pending (not approved)
    if (quiz.status === 'approved') {
      throw new BadRequestException('Cannot add questions to an approved quiz');
    }

    // Calculate how many questions we can still add
    const currentQuestionCount = quiz.questions.length;
    const requestedNewQuestions = dto.numberOfQuestions;
    const totalWillBe = currentQuestionCount + requestedNewQuestions;

    if (totalWillBe > MAX_QUESTIONS_PER_QUIZ) {
      throw new BadRequestException(
        `Cannot add ${requestedNewQuestions} questions. Quiz currently has ${currentQuestionCount} questions. ` +
        `Maximum total is ${MAX_QUESTIONS_PER_QUIZ}. You can add up to ${MAX_QUESTIONS_PER_QUIZ - currentQuestionCount} more questions.`,
      );
    }

    try {
      console.log(`[QUIZ APPEND] Appending ${requestedNewQuestions} AI questions to quiz ${dto.quizId}`);
      
      const questions = await this.aiService.generateQuizQuestions({
        sectionTitle: content.sectionTitle,
        sectionDescription: content.sectionDescription,
        lessons: content.lessons,
        difficulty: dto.difficulty,
        questionTypes: dto.questionTypes,
        numberOfQuestions: requestedNewQuestions,
      });

      // Append the new AI questions to existing questions
      quiz.questions = [
        ...quiz.questions,
        ...(questions as unknown as QuizQuestion[]),
      ];
      quiz.numberOfQuestions = quiz.questions.length;
      await quiz.save();

      console.log(`[QUIZ APPEND] Successfully appended ${questions.length} questions to quiz #${quiz.quizGenerationNumber}. Total now: ${quiz.questions.length}`);

      return {
        message: `Successfully added ${questions.length} AI questions. Quiz now has ${quiz.questions.length} total questions.`,
        quiz: new QuizSerializer(
          quiz.toObject() as unknown as Partial<QuizSerializer>,
        ),
      };
    } catch (error) {
      console.error('[QUIZ APPEND] Error appending questions:', error);
      throw error;
    }
  }

  // ─── REPLACE MODE: Creating new quiz from scratch ──────────────────────────
  // Check total quiz count (pending + approved) combined
  const allQuizzes = await this.quizModel
    .find({
      sectionId: new Types.ObjectId(dto.sectionId),
      status: { $in: ['pending_review', 'approved'] },
    })
    .exec();

  const totalQuizCount = allQuizzes.length;

  // Check: Maximum total quizzes per section limit (5 total: pending + approved combined)
  if (totalQuizCount >= MAX_QUIZZES_PER_SECTION) {
    throw new ForbiddenException(
      `This section has reached the maximum limit of ${MAX_QUIZZES_PER_SECTION} total quizzes (pending + approved combined). Delete or approve some pending quizzes before generating a new one.`,
    );
  }

  // Count approved quizzes for numbering purposes
  const approvedQuizzes = await this.quizModel
    .find({
      sectionId: new Types.ObjectId(dto.sectionId),
      status: 'approved',
    })
    .sort({ createdAt: -1 })
    .exec();
  
  const approvedCount = approvedQuizzes.length;
  
  // Calculate the next quiz generation number
  const nextQuizNumber = approvedCount + 1;
  console.log(`[QUIZ GENERATION] Allowing quiz #${nextQuizNumber} for section ${dto.sectionId}. (${totalQuizCount} total quizzes, ${approvedCount} approved)`);

  // ─── ARCHITECTURAL NOTE ─────────────────────────────────────────────────────
  // Manual quiz drafts are auto-saved via upsertManualDraft() while the instructor
  // edits. AI-generated quizzes are persisted here immediately on generation.
  // approveQuiz() performs the authoritative MAX_QUESTIONS_PER_QUIZ validation
  // before final publication.
  // ────────────────────────────────────────────────────────────────────────────

  // Validate question count (new questions can't exceed MAX_QUESTIONS_PER_QUIZ)
  if (dto.numberOfQuestions > MAX_QUESTIONS_PER_QUIZ) {
    throw new BadRequestException(
      `Cannot generate more than ${MAX_QUESTIONS_PER_QUIZ} questions per quiz.`,
    );
  }

  const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
    courseId,
    dto.sectionId,
  );

  // Calculate the quiz generation number for this new quiz based on approved count
  const approvedCountForNumber = await this.quizModel.countDocuments({
    sectionId: new Types.ObjectId(dto.sectionId),
    status: 'approved',
  });
  
  const quizGenerationNumber = approvedCountForNumber + 1;

  const quiz = await this.quizModel.create({
    sectionId: new Types.ObjectId(dto.sectionId),
    difficulty: dto.difficulty,
    numberOfQuestions: dto.numberOfQuestions,
    questionTypes: dto.questionTypes,
    generationStatus: QuizGenerationStatus.GENERATING,
    status: 'pending_review',
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
      questionTypes: dto.questionTypes,
      numberOfQuestions: dto.numberOfQuestions,
    });

    quiz.questions = questions as unknown as QuizQuestion[];
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

  const activeQuizQuestions = quiz.questions.filter(
    (q) => !(q as unknown as { isIgnored?: boolean }).isIgnored,
  );

  const questions = activeQuizQuestions.map((q, index) => {
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
      totalQuestions: quiz.questions.filter(
        (q) => !(q as unknown as { isIgnored?: boolean }).isIgnored,
      ).length,
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

    // CRUCIAL FIX: ignored questions must not count toward the denominator,
    // and answers submitted against an ignored question must not affect scoring.
    const activeQuestions = quiz.questions.filter(
      (q) => !(q as unknown as { isIgnored?: boolean }).isIgnored,
    ) as unknown as { _id?: Types.ObjectId; correctAnswers: string[] }[];

    if (activeQuestions.length === 0) {
      throw new BadRequestException(
        'This quiz currently has no active questions and cannot be scored',
      );
    }

    let correctCount = 0;

    for (const submittedAnswer of dto.answers) {
      const question = activeQuestions.find((q) => {
        const idStr = q._id ? q._id.toString() : undefined;
        return idStr === submittedAnswer.questionId;
      });

      if (!question) {
        // Either an invalid ID, or the question has since been ignored by
        // the instructor — either way it cannot contribute to the score.
        continue;
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

    const score = Math.round((correctCount / activeQuestions.length) * 100);
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
              // Idempotent + quiz-gated issuance (also fires the notification/email).
              await this.certificatesService.issueForCourse(
                studentId,
                courseId.toString(),
              );
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
      totalQuestions: activeQuestions.length,
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
          type: string;
          options: string[];
          correctAnswers: string[];
          isIgnored?: boolean;
          createdBy?: string;
        };
        return {
          questionId: questionObj._id
            ? questionObj._id.toString()
            : index.toString(),
          text: questionObj.questionText,
          type: questionObj.type,
          options: questionObj.options.map((opt: string) => ({
            optionId: opt,
            text: opt,
          })),
          correctAnswers: questionObj.correctAnswers,
          isIgnored: questionObj.isIgnored ?? false,
          createdBy: questionObj.createdBy ?? 'AI',
        };
      }),
    };
  }

  private mapManualDraftQuestions(questions: EditedQuestionDto[]): QuizQuestion[] {
    return questions.map((q) => ({
      _id: q.questionId ? new Types.ObjectId(q.questionId) : new Types.ObjectId(),
      questionText: q.questionText,
      type: q.type,
      options: q.options,
      correctAnswers: q.correctAnswers,
      isIgnored: false,
      createdBy: 'INSTRUCTOR' as const,
    }));
  }

  async upsertManualDraft(
    quizId: string | null,
    dto: SaveManualDraftDto,
    instructorId: string,
  ): Promise<{ quizId: string | null }> {
    if (dto.questions.length > MAX_QUESTIONS_PER_QUIZ) {
      throw new BadRequestException(
        `A quiz cannot contain more than ${MAX_QUESTIONS_PER_QUIZ} questions. ` +
        `Remove ${dto.questions.length - MAX_QUESTIONS_PER_QUIZ} question(s) before saving.`,
      );
    }

    const isNewDraft =
      !quizId || quizId === 'new' || quizId === 'undefined';

    if (isNewDraft) {
      if (dto.questions.length === 0) {
        return { quizId: null };
      }

      const course = await this.courseModel
        .findOne({ 'sections._id': new Types.ObjectId(dto.sectionId) })
        .select('instructorId _id')
        .exec();
      if (!course) throw new NotFoundException('Section not found');
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this section');
      }

      // Check total quizzes limit (pending + approved combined)
      const totalQuizCount = await this.quizModel.countDocuments({
        sectionId: new Types.ObjectId(dto.sectionId),
        status: { $in: ['pending_review', 'approved'] },
      });

      if (totalQuizCount >= MAX_QUIZZES_PER_SECTION) {
        throw new ForbiddenException(
          `This section has reached the maximum limit of ${MAX_QUIZZES_PER_SECTION} total quizzes (pending + approved combined). Delete or approve some quizzes before creating a new one.`,
        );
      }

      // Count approved quizzes for numbering purposes
      const approvedCount = await this.quizModel.countDocuments({
        sectionId: new Types.ObjectId(dto.sectionId),
        status: 'approved',
      });

      const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
        course._id.toString(),
        dto.sectionId,
      );

      const quiz = await this.quizModel.create({
        sectionId: new Types.ObjectId(dto.sectionId),
        difficulty: null,
        numberOfQuestions: dto.questions.length,
        questionTypes: [],
        generationStatus: QuizGenerationStatus.COMPLETED,
        status: 'pending_review',
        passingScore: 80,
        questions: this.mapManualDraftQuestions(dto.questions),
        enrollmentCountAtGeneration: currentEnrollmentCount,
        quizGenerationNumber: approvedCount + 1,
        enrollmentCountAtApproval: 0,
      });

      return { quizId: quiz._id.toString() };
    }

    const quiz = await this.quizModel.findById(quizId).exec();
    if (!quiz) throw new NotFoundException('Quiz not found');

    const course = await this.courseModel
      .findOne({ 'sections._id': quiz.sectionId })
      .select('instructorId _id')
      .exec();
    if (!course) throw new NotFoundException('Course for this quiz not found');
    if (course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this quiz');
    }

    if (quiz.status === 'approved') {
      throw new BadRequestException('Cannot modify an approved quiz');
    }

    if (dto.questions.length === 0) {
      await this.quizModel.deleteOne({ _id: quiz._id }).exec();
      return { quizId: null };
    }

    quiz.questions = this.mapManualDraftQuestions(dto.questions) as typeof quiz.questions;
    quiz.numberOfQuestions = dto.questions.length;
    await quiz.save();

    return { quizId: quiz._id.toString() };
  }

  async approveQuiz(
    quizId: string,
    instructorId: string,
    dto: ApproveQuizDto,
  ) {
    let quiz;
    let course;
    if (!quizId || quizId === 'new' || quizId === 'undefined') {
      if (!dto.sectionId) {
        throw new BadRequestException('sectionId is required to approve a new manual quiz');
      }
      course = await this.courseModel
        .findOne({ 'sections._id': new Types.ObjectId(dto.sectionId) })
        .select('instructorId _id')
        .exec();
      if (!course) throw new NotFoundException('Section not found');
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this section');
      }

      // Check: Maximum total quizzes per section limit (5 total: pending + approved combined)
      const totalQuizCount = await this.quizModel.countDocuments({
        sectionId: new Types.ObjectId(dto.sectionId),
        status: { $in: ['pending_review', 'approved'] },
      });
      if (totalQuizCount >= MAX_QUIZZES_PER_SECTION) {
        throw new ForbiddenException(
          `This section has reached the maximum limit of ${MAX_QUIZZES_PER_SECTION} total quizzes (pending + approved combined).`,
        );
      }

      // Get approved count for numbering
      const approvedCount = await this.quizModel.countDocuments({
        sectionId: new Types.ObjectId(dto.sectionId),
        status: 'approved',
      });

      const currentEnrollmentCount = await this.enrollmentsService.countEnrollmentsForSection(
        course._id.toString(),
        dto.sectionId,
      );

      quiz = await this.quizModel.create({
        sectionId: new Types.ObjectId(dto.sectionId),
        difficulty: null,
        numberOfQuestions: dto.editedQuestions?.length || 0,
        // Manual quizzes have no AI generation configuration; store empty array.
        questionTypes: [],
        generationStatus: QuizGenerationStatus.COMPLETED,
        status: 'approved',
        passingScore: 80,
        questions: [],
        enrollmentCountAtGeneration: currentEnrollmentCount,
        quizGenerationNumber: approvedCount + 1,
        enrollmentCountAtApproval: currentEnrollmentCount,
      });
    } else {
      quiz = await this.quizModel.findById(quizId).exec();
      if (!quiz) throw new NotFoundException('Quiz not found');

      course = await this.courseModel
        .findOne({ 'sections._id': quiz.sectionId })
        .select('instructorId _id')
        .exec();
      if (!course) throw new NotFoundException('Course for this quiz not found');

      // OWNERSHIP CHECK ENFORCED
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this quiz');
      }

      // Can only approve pending_review quizzes
      if (quiz.status !== 'pending_review') {
        throw new BadRequestException('Only pending review quizzes can be approved');
      }
    }

    const editedQuestions: EditedQuestionDto[] = dto.editedQuestions ?? [];

    if (dto.editedQuestions) {
      const submittedIds = new Set(
        editedQuestions.map((q) => q.questionId).filter((id): id is string => !!id),
      );
      quiz.questions = quiz.questions.filter((q) => {
        const idStr = (q as any)._id?.toString();
        return !idStr || submittedIds.has(idStr);
      }) as any;
    }

    for (const edit of editedQuestions) {
      if (edit.questionId) {
        // ---- Existing AI (or previously instructor-added) question ----
        const existing = quiz.questions.find(
          (q) => (q as unknown as { _id: Types.ObjectId })._id?.toString() === edit.questionId,
        );

        if (!existing) {
          throw new BadRequestException(
            `Invalid questionId: ${edit.questionId} does not belong to this quiz`,
          );
        }

        existing.questionText = edit.questionText ?? existing.questionText;
        existing.type = (edit.type as typeof existing.type) ?? existing.type;
        existing.options = edit.options ?? existing.options;
        existing.correctAnswers = edit.correctAnswers ?? existing.correctAnswers;

        if (typeof edit.isIgnored === 'boolean') {
          existing.isIgnored = edit.isIgnored;
        }
      } else {
        // ---- Brand-new, instructor-authored question ----
        quiz.questions.push({
          _id: new Types.ObjectId(),
          questionText: edit.questionText,
          type: edit.type,
          options: edit.options,
          correctAnswers: edit.correctAnswers,
          isIgnored: false,
          createdBy: 'INSTRUCTOR',
        } as unknown as (typeof quiz.questions)[number]);
      }
    }

    // Authoritative 20-question cap — enforced here even if the frontend is bypassed.
    // NOTE: This counts ALL persisted questions (including ignored ones) because ignored
    // questions still occupy storage. Ignoring a question does not free a slot.
    if (quiz.questions.length > MAX_QUESTIONS_PER_QUIZ) {
      throw new BadRequestException(
        `A quiz cannot contain more than ${MAX_QUESTIONS_PER_QUIZ} questions. ` +
        `Remove ${quiz.questions.length - MAX_QUESTIONS_PER_QUIZ} question(s) before approving.`,
      );
    }

    // Guard: a quiz must retain at least one active (non-ignored) question.
    const activeCount = quiz.questions.filter(
      (q) => !(q as unknown as { isIgnored?: boolean }).isIgnored,
    ).length;
    if (activeCount === 0) {
      throw new BadRequestException(
        'A quiz must have at least one active (non-ignored) question to be approved',
      );
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
    questionTypes: quiz.questionTypes,
    generationStatus: quiz.generationStatus,
    status: quiz.status,
    questions: quiz.questions.map((q, index: number) => {
      const questionObj = q as unknown as {
        _id?: Types.ObjectId;
        questionText: string;
        type: string;
        options: string[];
        correctAnswers: string[];
        isIgnored?: boolean;
        createdBy?: string;
      };
      return {
        questionId: questionObj._id
          ? questionObj._id.toString()
          : index.toString(),
        text: questionObj.questionText,
        type: questionObj.type,
        options: questionObj.options.map((opt: string) => ({
          optionId: opt,
          text: opt,
        })),
        correctAnswers: questionObj.correctAnswers,
        isIgnored: questionObj.isIgnored ?? false,
        createdBy: questionObj.createdBy ?? 'AI',
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
        questionTypes: quiz.questionTypes,
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
            type: string;
            options: string[];
            correctAnswers: string[];
            isIgnored?: boolean;
            createdBy?: string;
          };
          return {
            questionId: questionObj._id
              ? questionObj._id.toString()
              : index.toString(),
            text: questionObj.questionText,
            type: questionObj.type,
            options: questionObj.options.map((opt: string) => ({
              optionId: opt,
              text: opt,
            })),
            correctAnswers: questionObj.correctAnswers,
            isIgnored: questionObj.isIgnored ?? false,
            createdBy: questionObj.createdBy ?? 'AI',
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
    return;
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

    const approvedCount = await this.quizModel.countDocuments({
      sectionId: new Types.ObjectId(sectionId),
      status: 'approved',
    });

    const baselineEnrollmentCount = lastApprovedQuiz
      ? (lastApprovedQuiz.enrollmentCountAtApproval || lastApprovedQuiz.enrollmentCountAtGeneration || 0)
      : 0;
    const newEnrollmentsSinceLastApproval = lastApprovedQuiz
      ? Math.max(0, currentEnrollmentCount - baselineEnrollmentCount)
      : 0;

    return {
      sectionId,
      currentEnrollmentCount,
      baselineEnrollmentCount,
      newEnrollmentsSinceLastApproval,
      enrollmentThreshold: 0,
      enrollmentsNeeded: 0,
      canGenerateQuiz: approvedCount < MAX_QUIZZES_PER_SECTION,
      hasApprovedQuiz: !!lastApprovedQuiz,
      lastApprovedQuizGeneration: lastApprovedQuiz?.quizGenerationNumber || 0,
    };
  }

  /**
   * Delete a pending_review quiz. Approved quizzes cannot be deleted.
   */
  async deletePendingQuiz(quizId: string, instructorId: string): Promise<{ success: boolean; message: string }> {
    if (!Types.ObjectId.isValid(quizId)) {
      throw new BadRequestException('Invalid quiz ID');
    }

    const quiz = await this.quizModel.findById(new Types.ObjectId(quizId)).exec();
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Verify the instructor owns the course
    const course = await this.courseModel
      .findOne({ 'sections._id': quiz.sectionId })
      .select('instructorId')
      .exec();
    
    if (!course || course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this quiz');
    }

    // Prevent deletion of approved quizzes
    if (quiz.status === 'approved') {
      throw new ForbiddenException('Cannot delete an approved quiz');
    }

    // Delete the quiz
    await this.quizModel.deleteOne({ _id: new Types.ObjectId(quizId) }).exec();

    return {
      success: true,
      message: 'Pending quiz deleted successfully',
    };
  }

}
