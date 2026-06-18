import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name) private quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private enrollmentsService: EnrollmentsService,
  ) {}

  async saveQuizConfig(dto: CreateQuizDto) {
    const quiz = await this.quizModel.create({
      sectionId: new Types.ObjectId(dto.sectionId),
      difficulty: dto.difficulty,
      numberOfQuestions: dto.numberOfQuestions,
      questionType: dto.questionType,
      generationStatus: QuizGenerationStatus.PENDING,
      questions: [],
    });

    return {
      message: 'Quiz configuration saved! AI generation is now pending.',
      quiz,
    };
  }

  async submitQuizAttempt(quizId: string, studentId: string, dto: SubmitQuizDto) {
    if (!Types.ObjectId.isValid(quizId)) {
      throw new BadRequestException('Invalid quiz ID');
    }

    const quiz = await this.quizModel.findById(quizId).populate('sectionId').exec();
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz.generationStatus !== QuizGenerationStatus.COMPLETED || !quiz.questions.length) {
      throw new BadRequestException('Quiz is not ready yet');
    }

    // Determine max attempts (default 3) and passing threshold (default 70)
    const MAX_ATTEMPTS = parseInt(process.env.MAX_QUIZ_ATTEMPTS || '3', 10);
    const PASS_THRESHOLD = parseInt(process.env.QUIZ_PASS_THRESHOLD || '70', 10);

    const previousAttempts = await this.quizAttemptModel.countDocuments({
      quizId: new Types.ObjectId(quizId),
      studentId: new Types.ObjectId(studentId),
    });

    if (previousAttempts >= MAX_ATTEMPTS) {
      throw new ForbiddenException(`You have reached the maximum number of attempts (${MAX_ATTEMPTS}) for this quiz.`);
    }

    const hasAccess = await this.enrollmentsService.canAccessSection(studentId, quiz.sectionId.toString());
    if (!hasAccess) {
      throw new ForbiddenException('You must purchase this section to take this quiz.');
    }

    // Grade the quiz
    let correctAnswersCount = 0;
    const totalQuestions = quiz.questions.length;

    for (let i = 0; i < totalQuestions; i++) {
      const question = quiz.questions[i];
      const submittedAnswers = dto.answers[i.toString()] || [];

      // Sort both arrays to ensure order doesn't matter, and compare them
      const correctSorted = [...question.correctAnswers].sort();
      const submittedSorted = [...submittedAnswers].sort();

      const isCorrect = correctSorted.length === submittedSorted.length && 
                        correctSorted.every((val, index) => val === submittedSorted[index]);

      if (isCorrect) {
        correctAnswersCount++;
      }
    }

    const score = (correctAnswersCount / totalQuestions) * 100;
    const isPassed = score >= PASS_THRESHOLD;

    const attempt = await this.quizAttemptModel.create({
      quizId: new Types.ObjectId(quizId),
      studentId: new Types.ObjectId(studentId),
      score,
      isPassed,
    });

    // Check if this was a better score to keep best score on record (logic is implicit if we query all attempts)

    if (isPassed) {
      // Find course related to this quiz via section
      const section: any = quiz.sectionId;
      if (section && section.courseId) {
        const enrollment = await this.enrollmentModel.findOneAndUpdate(
          { courseId: section.courseId, studentId: new Types.ObjectId(studentId) },
          { $set: { isCourseCompleted: true } },
          { new: true }
        ).exec();

        if (enrollment) {
          // Trigger Certificate Generation Side Effect (Notification)
          const course = await this.courseModel.findById(section.courseId).exec();
          if (course) {
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

    return {
      message: 'Quiz submitted successfully',
      score,
      isPassed,
      attemptId: attempt._id,
      correctAnswersCount,
      totalQuestions,
    };
  }
}