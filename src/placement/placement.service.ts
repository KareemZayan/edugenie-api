import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import {
  PlacementAttempt,
  PlacementAttemptDocument,
  PlacementSection,
  PlacementResult,
  PlacementRecommendation,
} from './schema/placement-attempt.schema';
import { AiService } from '../ai/ai.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CartService } from '../cart/cart.service';
import { QuizDifficulty } from '../common/enums/quizDifficulty.enum';
import { QuestionType } from '../common/enums/questionsType.enum';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { SubmitPlacementDto } from './dto/submit-placement.dto';

/** SRS: scoring ≥80% on a section means the learner can skip buying it. */
const PASS_THRESHOLD = 0.8;
/** Bound AI cost on very large courses. */
const MAX_SECTIONS = 8;
const QUESTIONS_PER_SECTION = 2;

interface LeanSection {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  price: number | null;
  lessons: { title: string; transcript?: string }[];
}
interface LeanCourse {
  _id: Types.ObjectId;
  title: string;
  price: number;
  sections: LeanSection[];
}

@Injectable()
export class PlacementService {
  private readonly logger = new Logger(PlacementService.name);

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(PlacementAttempt.name)
    private attemptModel: Model<PlacementAttemptDocument>,
    private aiService: AiService,
    private enrollmentsService: EnrollmentsService,
    private cartService: CartService,
  ) {}

  /**
   * Build an AI placement test for a course (pre-purchase). Generates a couple
   * of questions PER not-yet-owned section, in parallel, reusing the robust
   * quiz generator. Correct answers are stored server-side; the client only
   * receives the questions + options.
   */
  async generate(courseId: string, studentId: string) {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    if (!this.aiService.isConfigured) {
      throw new ServiceUnavailableException(
        'The AI placement test is not available right now.',
      );
    }

    const course = await this.courseModel
      .findById(courseId)
      .select('title price sections')
      .lean<LeanCourse>()
      .exec();
    if (!course) throw new NotFoundException('Course not found');
    if (!course.sections?.length) {
      throw new BadRequestException(
        'This course has no sections to assess yet.',
      );
    }

    // Skip sections the learner already owns — there's nothing to recommend.
    const access = await this.enrollmentsService
      .getCourseAccess(studentId, courseId)
      .catch(() => null);
    if (access?.accessType === PurchaseType.FULL_COURSE && access?.enrolledAt) {
      throw new BadRequestException('You already own this course.');
    }
    const owned = new Set((access?.accessibleSections ?? []).map(String));

    const candidates = course.sections
      .filter((s) => !owned.has(s._id.toString()))
      .filter((s) => (s.lessons?.length ?? 0) > 0)
      .slice(0, MAX_SECTIONS);
    if (!candidates.length) {
      throw new BadRequestException('No sections available to assess.');
    }

    // Generate per section in parallel; a section that fails is skipped.
    const generated = await Promise.allSettled(
      candidates.map((s) =>
        this.aiService.generateQuizQuestions({
          sectionTitle: s.title,
          sectionDescription: s.description,
          lessons: s.lessons.map((l) => ({
            title: l.title,
            transcript: l.transcript,
          })),
          difficulty: QuizDifficulty.MEDIUM,
          questionTypes: [QuestionType.SINGLE_CHOICE],
          numberOfQuestions: QUESTIONS_PER_SECTION,
        }),
      ),
    );

    const sections: PlacementSection[] = [];
    candidates.forEach((s, i) => {
      const r = generated[i];
      if (r.status !== 'fulfilled' || !r.value.length) {
        if (r.status === 'rejected') {
          this.logger.warn(
            `Placement generation skipped section "${s.title}": ${
              r.reason instanceof Error ? r.reason.message : String(r.reason)
            }`,
          );
        }
        return;
      }
      sections.push({
        sectionId: s._id.toString(),
        title: s.title,
        price: s.price ?? null,
        questions: r.value.map((q, qi) => ({
          id: `${s._id.toString()}_${qi}`,
          questionText: q.questionText,
          type: q.type,
          options: q.options,
          correctAnswers: q.correctAnswers,
        })),
      });
    });

    if (!sections.length) {
      throw new ServiceUnavailableException(
        'Could not build a placement test for this course right now. Please try again.',
      );
    }

    const attempt = await this.attemptModel.create({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
      courseTitle: course.title,
      coursePrice: course.price ?? 0,
      sections,
      status: 'pending',
    });

    return {
      attemptId: attempt._id.toString(),
      courseId,
      courseTitle: course.title,
      sections: sections.map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        questions: s.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          type: q.type,
          options: q.options,
        })),
      })),
    };
  }

  /** Grade a submitted attempt and produce the buy recommendation. */
  async submit(courseId: string, studentId: string, dto: SubmitPlacementDto) {
    const attempt = await this.loadOwnedAttempt(dto.attemptId, studentId, courseId);

    const answerMap = new Map(
      dto.answers.map((a) => [a.questionId, (a.selected ?? []).map((x) => x.trim())]),
    );

    const results: PlacementResult[] = attempt.sections.map((s) => {
      let correct = 0;
      for (const q of s.questions) {
        const selected = answerMap.get(q.id) ?? [];
        if (setsEqual(selected, q.correctAnswers.map((c) => c.trim()))) correct++;
      }
      const total = s.questions.length;
      const score = total ? Math.round((correct / total) * 100) : 0;
      return {
        sectionId: s.sectionId,
        title: s.title,
        price: s.price,
        score,
        correct,
        total,
        mastered: total > 0 && correct / total >= PASS_THRESHOLD,
      };
    });

    const toBuy = results.filter((r) => !r.mastered);
    const buyable = toBuy.filter(
      (r) => typeof r.price === 'number' && (r.price as number) > 0,
    );
    const totalPrice = buyable.reduce((sum, r) => sum + (r.price as number), 0);
    const coursePrice = attempt.coursePrice ?? 0;

    let mode: PlacementRecommendation['mode'];
    let message: string;
    if (toBuy.length === 0) {
      mode = 'none';
      message =
        'Great news — you scored 80%+ on every section. You likely already know this material.';
    } else if (toBuy.length === results.length) {
      mode = 'full';
      message =
        "You'll benefit across all sections — the full course is the best value for you.";
    } else {
      mode = 'sections';
      message = `You already know ${results.length - toBuy.length} of ${results.length} sections. Buy just the ${toBuy.length} you need.`;
    }

    const savings =
      mode === 'sections' && coursePrice > 0
        ? Math.max(0, coursePrice - totalPrice)
        : 0;

    const recommendation: PlacementRecommendation = {
      mode,
      message,
      coursePrice,
      totalPrice,
      savings,
      sections: toBuy.map((r) => ({
        sectionId: r.sectionId,
        title: r.title,
        price: r.price,
      })),
      results,
    };

    attempt.status = 'submitted';
    attempt.recommendation = recommendation;
    attempt.markModified('recommendation');
    await attempt.save();

    return { courseId, ...recommendation };
  }

  /** One-click: add the recommended sections (or full course) to the cart. */
  async addRecommendedToCart(
    courseId: string,
    studentId: string,
    attemptId: string,
  ) {
    const attempt = await this.loadOwnedAttempt(attemptId, studentId, courseId);
    const rec = attempt.recommendation;
    if (!rec) {
      throw new BadRequestException('Submit the placement test first.');
    }

    let added = 0;
    const skipped: string[] = [];

    if (rec.mode === 'full') {
      try {
        await this.cartService.addToCart(
          studentId,
          PurchaseType.FULL_COURSE,
          courseId,
        );
        added++;
      } catch {
        skipped.push('full course');
      }
    } else if (rec.mode === 'sections') {
      for (const s of rec.sections) {
        if (typeof s.price !== 'number' || s.price <= 0) {
          skipped.push(s.title);
          continue;
        }
        try {
          await this.cartService.addToCart(
            studentId,
            PurchaseType.SECTION,
            courseId,
            s.sectionId,
          );
          added++;
        } catch {
          skipped.push(s.title); // already in cart / already owned
        }
      }
    }

    return { added, skipped, mode: rec.mode };
  }

  private async loadOwnedAttempt(
    attemptId: string,
    studentId: string,
    courseId: string,
  ): Promise<PlacementAttemptDocument> {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new BadRequestException('Invalid attempt ID');
    }
    const attempt = await this.attemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Placement attempt not found or expired.');
    }
    if (attempt.studentId.toString() !== studentId) {
      throw new ForbiddenException('Not your placement attempt.');
    }
    if (attempt.courseId.toString() !== courseId) {
      throw new BadRequestException('Attempt does not match this course.');
    }
    return attempt;
  }
}

/** Order-insensitive, case-insensitive set equality for option strings. */
function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((x) => x.toLowerCase()));
  for (const x of b) if (!sa.has(x.toLowerCase())) return false;
  return true;
}
