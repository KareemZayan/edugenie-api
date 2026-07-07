import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Course } from '../courses/schema/course.schema';
import { PracticeQuiz, PracticeQuestion } from './schema/practice-quiz.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AiService } from './ai.service';
import { QuizDifficulty } from '../common/enums/quizDifficulty.enum';
import { QuestionType } from '../common/enums/questionsType.enum';
import { GeneratePracticeQuizDto } from './dto/generate-practice-quiz.dto';
import { SubmitPracticeQuizDto } from './dto/submit-practice-quiz.dto';

const TTL_MS = 2 * 60 * 60 * 1000; // 2h
const PASS = 70;

type EmbeddedSection = {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  lessons?: { title: string; transcript?: string }[];
};

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

/**
 * On-demand "Quiz Me" practice. Generates a short quiz scoped to one section
 * (reusing the validated AI quiz generator), stores it with answers for
 * server-side grading, and returns graded results with the correct answers
 * revealed on submit. Ephemeral (TTL) — never touches real Quiz/QuizAttempt
 * data or course progress.
 */
@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(PracticeQuiz.name)
    private practiceModel: Model<PracticeQuiz>,
    private enrollments: EnrollmentsService,
    private ai: AiService,
  ) {}

  async generate(studentId: string, dto: GeneratePracticeQuizDto) {
    if (!Types.ObjectId.isValid(dto.sectionId)) {
      throw new BadRequestException('Invalid section ID');
    }

    const allowed = await this.enrollments.canAccessSection(
      studentId,
      dto.sectionId,
    );
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this section');
    }

    const course = await this.courseModel
      .findOne({ 'sections._id': new Types.ObjectId(dto.sectionId) })
      .select('title sections')
      .lean();
    if (!course) throw new NotFoundException('Section not found');

    const section = (
      (course.sections as unknown as EmbeddedSection[]) ?? []
    ).find((s) => String(s._id) === dto.sectionId);
    if (!section || !section.lessons?.length) {
      throw new BadRequestException('This section has no lessons to quiz on');
    }

    const difficulty = dto.difficulty ?? QuizDifficulty.MEDIUM;
    const numberOfQuestions = dto.numberOfQuestions ?? 5;

    const generated = await this.ai.generateQuizQuestions({
      sectionTitle: section.title,
      sectionDescription: section.description,
      lessons: section.lessons.map((l) => ({
        title: l.title,
        transcript: l.transcript,
      })),
      difficulty,
      questionTypes: [QuestionType.SINGLE_CHOICE],
      numberOfQuestions,
    });
    if (!generated.length) {
      throw new BadRequestException(
        'Could not generate a quiz for this section right now. Please try again.',
      );
    }

    const questions: PracticeQuestion[] = generated.map((q) => ({
      id: randomUUID(),
      questionText: q.questionText,
      type: q.type,
      options: q.options,
      correctAnswers: q.correctAnswers,
    }));

    const doc = await this.practiceModel.create({
      studentId: new Types.ObjectId(studentId),
      courseId: course._id,
      sectionId: new Types.ObjectId(dto.sectionId),
      courseTitle: course.title,
      sectionTitle: section.title,
      difficulty,
      questions,
      status: 'generated',
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    // Strip the correct answers from the client-facing payload.
    return {
      practiceId: doc._id.toString(),
      courseTitle: course.title,
      sectionTitle: section.title,
      difficulty,
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
      })),
    };
  }

  async submit(
    studentId: string,
    practiceId: string,
    dto: SubmitPracticeQuizDto,
  ) {
    if (!Types.ObjectId.isValid(practiceId)) {
      throw new BadRequestException('Invalid practice quiz ID');
    }

    const doc = await this.practiceModel.findOne({
      _id: new Types.ObjectId(practiceId),
      studentId: new Types.ObjectId(studentId),
    });
    if (!doc) {
      throw new NotFoundException('Practice quiz not found or expired');
    }

    const answerMap = new Map(
      dto.answers.map((a) => [
        a.questionId,
        (a.selected ?? []).map((x) => x.trim()),
      ]),
    );

    let correct = 0;
    const results = doc.questions.map((q) => {
      const selected = answerMap.get(q.id) ?? [];
      const isCorrect = setsEqual(
        selected,
        q.correctAnswers.map((c) => c.trim()),
      );
      if (isCorrect) correct++;
      return {
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        yourAnswer: selected,
        correctAnswer: q.correctAnswers,
        isCorrect,
      };
    });

    const total = doc.questions.length;
    const score = total ? Math.round((correct / total) * 100) : 0;

    doc.status = 'submitted';
    doc.score = score;
    await doc.save();

    return {
      practiceId,
      courseTitle: doc.courseTitle,
      sectionTitle: doc.sectionTitle,
      score,
      correct,
      total,
      passed: score >= PASS,
      results,
    };
  }
}
