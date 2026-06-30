import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RemediationPlan,
  RemediationItem,
} from './schema/remediation-plan.schema';
import { Quiz } from '../quizzes/schema/quiz.schema';
import { QuizAttempt } from '../quizzes/schema/quiz-attempt.schema';
import { Course } from '../courses/schema/course.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { RetrievalService } from '../rag/retrieval.service';
import { AiService } from './ai.service';

// How many lessons we point the student at, and how many clips to pull per
// missed question before deduping by lesson.
const MAX_ITEMS = 5;
const CLIPS_PER_CONCEPT = 2;
const MAX_CONCEPTS = 8;

interface GenerateInput {
  userId: string;
  sectionId: string;
  quizId: string;
  attemptId: string;
}

/** A single retrieval request that yields one or more lessons to rewatch. */
interface RetrievalIntent {
  /** The text we embed to find the relevant lessons. */
  query: string;
  /** The concept label stored on each resulting item. */
  concept: string;
  /** The "why revisit" copy stored on each resulting item. */
  reason: string;
}

/**
 * Builds a targeted recovery plan when a student exhausts their quiz attempts on
 * a section. Diagnosis (which questions were missed) is deterministic; the clips
 * to rewatch come from RAG retrieval over that section's lessons. LLM concept
 * clustering is a deliberate second pass — this MVP uses the missed question
 * text as the "concept".
 *
 * `generate()` is designed to be called fire-and-forget from the quiz-submit
 * path: it never throws (errors are logged), so a remediation failure can't
 * break quiz submission.
 */
@Injectable()
export class RemediationService {
  private readonly logger = new Logger(RemediationService.name);

  constructor(
    @InjectModel(RemediationPlan.name)
    private planModel: Model<RemediationPlan>,
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name)
    private quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private retrieval: RetrievalService,
    private ai: AiService,
  ) {}

  /** Generate (or refresh) the active recovery plan for a failed section. */
  async generate(input: GenerateInput): Promise<void> {
    try {
      const { userId, sectionId, quizId, attemptId } = input;

      const [attempt, quiz] = await Promise.all([
        this.quizAttemptModel.findById(attemptId).lean(),
        this.quizModel.findById(quizId).lean(),
      ]);
      if (!attempt || !quiz) return;

      const missed = this.diagnoseMissed(quiz, attempt);
      if (!missed.length) return; // nothing actionable

      const course = await this.resolveCourse(sectionId);
      if (!course) return; // section/course no longer accessible

      // Try to group the missed questions into named concepts via the LLM;
      // fall back to one intent per raw question when AI is off / unparseable.
      const clusters = await this.clusterConcepts(missed);
      const intents: RetrievalIntent[] = clusters
        ? clusters.map((c) => ({
            query: `${c.concept}. ${c.questions.join(' ')}`.trim(),
            concept: c.concept,
            reason: c.tip || `Revisit this to master ${this.short(c.concept)}.`,
          }))
        : missed.map((q) => ({
            query: q,
            concept: q,
            reason: `Revisit this to cover: "${this.short(q)}"`,
          }));

      const missedConcepts = clusters ? clusters.map((c) => c.concept) : missed;

      const items = await this.buildItems(
        intents,
        course.courseId,
        sectionId,
        course.sectionTitle,
        course.sectionLessons,
      );

      // One active plan per student/section — refresh in place on a re-fail.
      await this.planModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), sectionId, status: 'active' },
        {
          $set: {
            userId: new Types.ObjectId(userId),
            courseId: course.courseId,
            courseTitle: course.courseTitle,
            sectionId,
            sectionTitle: course.sectionTitle,
            quizId,
            missedConcepts,
            items,
            status: 'active',
            resolvedAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      await this.notificationModel.create({
        userId: new Types.ObjectId(userId),
        title: "Let's get you past this section",
        message: `You didn't pass "${course.sectionTitle}" — I've put together a quick recovery plan with the exact lessons to rewatch.`,
        type: NotificationType.REMEDIATION_READY,
        isRead: false,
        courseId: course.courseId,
      });
    } catch (err) {
      // Non-fatal: never break the quiz-submit path.
      this.logger.error(
        `Failed to generate remediation plan: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /** Mark any active plan for this section resolved once the student passes. */
  async resolveOnPass(userId: string, sectionId: string): Promise<void> {
    try {
      await this.planModel.updateMany(
        { userId: new Types.ObjectId(userId), sectionId, status: 'active' },
        { $set: { status: 'resolved', resolvedAt: new Date() } },
      );
    } catch (err) {
      this.logger.error(
        `Failed to resolve remediation plan: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Active recovery plans for the student, newest first. */
  async getActiveForUser(userId: string) {
    const plans = await this.planModel
      .find({ userId: new Types.ObjectId(userId), status: 'active' })
      .sort({ createdAt: -1 })
      .lean();
    return plans.map((p) =>
      this.serialize(p as unknown as Record<string, unknown>),
    );
  }

  async getOne(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Remediation plan not found');
    }
    const plan = await this.planModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .lean();
    if (!plan) throw new NotFoundException('Remediation plan not found');
    return this.serialize(plan as unknown as Record<string, unknown>);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Deterministically recompute which questions the student got wrong (or left
   * unanswered) on a given attempt — mirrors the grading in QuizzesService.
   * Returns the missed question texts.
   */
  private diagnoseMissed(
    quiz: {
      questions: {
        _id?: Types.ObjectId;
        questionText: string;
        correctAnswers: string[];
      }[];
    },
    attempt: {
      answers?: { questionId: string; selectedOptionIds: string[] }[];
    },
  ): string[] {
    const answerByQid = new Map<string, string[]>();
    for (const a of attempt.answers ?? []) {
      answerByQid.set(a.questionId, a.selectedOptionIds ?? []);
    }

    const missed: string[] = [];
    quiz.questions.forEach((q, idx) => {
      const qid = q._id ? q._id.toString() : idx.toString();
      const selected = answerByQid.get(qid);

      // Unanswered → missed.
      if (!selected) {
        missed.push(q.questionText);
        return;
      }
      const correct = [...(q.correctAnswers ?? [])].sort();
      const got = [...selected].sort();
      const isCorrect =
        correct.length === got.length && correct.every((v, i) => v === got[i]);
      if (!isCorrect) missed.push(q.questionText);
    });

    return missed.slice(0, MAX_CONCEPTS);
  }

  /** Resolve the owning course + section title + section lessons for fallback. */
  private async resolveCourse(sectionId: string): Promise<{
    courseId: string;
    courseTitle: string;
    sectionTitle: string;
    sectionLessons: { lessonId: string; lessonTitle: string }[];
  } | null> {
    if (!Types.ObjectId.isValid(sectionId)) return null;
    const course = await this.courseModel
      .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
      .select(
        'title sections._id sections.title sections.lessons._id sections.lessons.title',
      )
      .lean<{
        _id: Types.ObjectId;
        title: string;
        sections: {
          _id: Types.ObjectId;
          title: string;
          lessons?: { _id: Types.ObjectId; title: string }[];
        }[];
      }>();
    if (!course) return null;

    const section = course.sections.find((s) => String(s._id) === sectionId);
    if (!section) return null;

    return {
      courseId: String(course._id),
      courseTitle: course.title,
      sectionTitle: section.title,
      sectionLessons: (section.lessons ?? []).map((l) => ({
        lessonId: String(l._id),
        lessonTitle: l.title,
      })),
    };
  }

  /**
   * Turn retrieval intents (one per concept, or one per raw question in the
   * fallback) into a deduped list of lessons to rewatch. Tries RAG retrieval
   * first (exact clips); falls back to the section's own lessons when the
   * content isn't indexed yet.
   */
  private async buildItems(
    intents: RetrievalIntent[],
    courseId: string,
    sectionId: string,
    sectionTitle: string,
    fallbackLessons: { lessonId: string; lessonTitle: string }[],
  ): Promise<RemediationItem[]> {
    const byLesson = new Map<string, RemediationItem>();

    for (const intent of intents) {
      let chunks: {
        lessonId: string;
        lessonTitle: string;
        sectionId: string;
        sectionTitle: string;
      }[] = [];
      try {
        chunks = await this.retrieval.retrieve({
          query: intent.query,
          courseId,
          sectionIds: [sectionId],
          k: CLIPS_PER_CONCEPT,
        });
      } catch {
        chunks = [];
      }

      for (const c of chunks) {
        if (!c.lessonId || byLesson.has(c.lessonId)) continue;
        byLesson.set(c.lessonId, {
          lessonId: c.lessonId,
          lessonTitle: c.lessonTitle || 'Lesson',
          sectionId: c.sectionId || sectionId,
          sectionTitle: c.sectionTitle || sectionTitle,
          concept: intent.concept,
          reason: intent.reason,
        });
      }
      if (byLesson.size >= MAX_ITEMS) break;
    }

    // Fallback: nothing indexed yet — point at the section's lessons.
    if (byLesson.size === 0) {
      for (const l of fallbackLessons.slice(0, MAX_ITEMS)) {
        byLesson.set(l.lessonId, {
          lessonId: l.lessonId,
          lessonTitle: l.lessonTitle,
          sectionId,
          sectionTitle,
          concept: '',
          reason: 'Rewatch this lesson before retaking the quiz.',
        });
      }
    }

    return [...byLesson.values()].slice(0, MAX_ITEMS);
  }

  /**
   * Group the missed questions into 2–4 named concepts (each with a short "why
   * revisit" tip) via the AI gateway. Returns null when AI is unconfigured or
   * the reply can't be parsed — the caller then falls back to one intent per
   * raw question, so remediation always works.
   */
  private async clusterConcepts(
    missed: string[],
  ): Promise<{ concept: string; questions: string[]; tip: string }[] | null> {
    if (!this.ai.isConfigured || missed.length === 0) return null;

    try {
      const system =
        'You are a learning diagnostics assistant. You group a student’s ' +
        'missed quiz questions into a few underlying concepts they should ' +
        'review. Reply with VALID JSON only — no markdown, no commentary.';
      const list = missed.map((q, i) => `${i + 1}. ${q}`).join('\n');
      const user =
        `The student got these quiz questions wrong:\n${list}\n\n` +
        `Group them into 2–4 underlying concepts. For each concept give a ` +
        `short name (3–6 words), the list of the exact question texts it ` +
        `covers, and a one-sentence encouraging tip on what to focus on when ` +
        `reviewing.\n\n` +
        `Return ONLY this JSON:\n` +
        `{ "concepts": [ { "concept": string, "questions": string[], "tip": string } ] }`;

      const raw = await this.ai.complete(system, user, 900);
      const concepts = this.parseJson(raw)?.concepts;
      if (!Array.isArray(concepts) || concepts.length === 0) return null;

      const cleaned = concepts
        .filter((c) => c && typeof c.concept === 'string' && c.concept.trim())
        .slice(0, 4)
        .map((c) => ({
          concept: String(c.concept).trim(),
          questions: Array.isArray(c.questions)
            ? c.questions.map((q) => String(q)).filter(Boolean)
            : [],
          tip: typeof c.tip === 'string' ? c.tip.trim() : '',
        }));

      return cleaned.length ? cleaned : null;
    } catch (err) {
      this.logger.warn(
        `Concept clustering failed, using raw questions: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /** Tolerant JSON extraction (handles ```json fences / surrounding prose). */
  private parseJson(raw: string): {
    concepts?: { concept?: unknown; questions?: unknown; tip?: unknown }[];
  } | null {
    if (!raw) return null;
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as {
        concepts?: { concept?: unknown; questions?: unknown; tip?: unknown }[];
      };
    } catch {
      return null;
    }
  }

  private short(s: string, max = 90): string {
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  private serialize(p: Record<string, unknown>) {
    return {
      id: String(p._id),
      courseId: p.courseId,
      courseTitle: p.courseTitle,
      sectionId: p.sectionId,
      sectionTitle: p.sectionTitle,
      missedConcepts: p.missedConcepts ?? [],
      items: p.items ?? [],
      status: p.status,
      createdAt: p.createdAt,
    };
  }
}
