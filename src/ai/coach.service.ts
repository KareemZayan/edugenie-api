import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { QuizAttempt } from '../quizzes/schema/quiz-attempt.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AiService, ChatTurn } from './ai.service';

// A course is "stalled" once it has had no activity for this many days while
// still in progress; a quiz section is a "weak spot" below this score.
const STALL_DAYS = 7;
const WEAK_SCORE = 60;

export interface CoachCourse {
  courseId: string;
  title: string;
  progressPercent: number;
  level: string;
  daysSinceActivity: number | null;
  stalled: boolean;
}

export interface WeakSpot {
  courseId: string;
  sectionId: string;
  courseTitle: string;
  sectionTitle: string;
  score: number;
  passed: boolean;
}

export interface CoachSnapshot {
  totalCourses: number;
  completedCount: number;
  inProgress: CoachCourse[];
  notStarted: CoachCourse[];
  completed: CoachCourse[];
  weakSpots: WeakSpot[];
  recentAvgScore: number | null;
}

/**
 * AI Learning Coach — gathers the student's REAL learning state (enrollments,
 * progress, recent quiz results) into a compact snapshot, then streams grounded
 * coaching through the shared AI gateway. The "agentic" reasoning is done in
 * code (deterministic data gathering) so it works on the plain chat gateway
 * without function-calling.
 */
@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(QuizAttempt.name)
    private quizAttemptModel: Model<QuizAttempt>,
    private enrollments: EnrollmentsService,
    private ai: AiService,
  ) {}

  // ── Snapshot ────────────────────────────────────────────────────────────

  async buildSnapshot(userId: string): Promise<CoachSnapshot> {
    const courses = await this.enrollments.getMyCourses(userId);

    // Enrollment docs carry activity/completion the card list doesn't.
    const enrollDocs = await this.enrollmentModel
      .find({ studentId: new Types.ObjectId(userId) })
      .select('courseId lastActivityAt isCourseCompleted')
      .lean();
    const meta = new Map<
      string,
      { lastActivityAt?: Date | null; completed: boolean }
    >();
    for (const e of enrollDocs) {
      meta.set(String(e.courseId), {
        lastActivityAt: e.lastActivityAt,
        completed: !!e.isCourseCompleted,
      });
    }

    const now = Date.now();
    const inProgress: CoachCourse[] = [];
    const notStarted: CoachCourse[] = [];
    const completed: CoachCourse[] = [];

    for (const c of courses) {
      const m = meta.get(c.courseId);
      const progress = c.progressPercent ?? 0;
      const isDone = (m?.completed ?? false) || progress >= 100;
      const lastMs = m?.lastActivityAt
        ? new Date(m.lastActivityAt).getTime()
        : null;
      const days =
        lastMs !== null ? Math.floor((now - lastMs) / 86_400_000) : null;

      const entry: CoachCourse = {
        courseId: c.courseId,
        title: c.title,
        progressPercent: Math.round(progress),
        level: c.level || 'all levels',
        daysSinceActivity: days,
        stalled: false,
      };

      if (isDone) completed.push(entry);
      else if (progress <= 0) notStarted.push(entry);
      else {
        entry.stalled = days !== null && days >= STALL_DAYS;
        inProgress.push(entry);
      }
    }

    const [weakSpots, recentAvgScore] = await Promise.all([
      this.computeWeakSpots(
        userId,
        courses.map((c) => c.courseId),
      ),
      this.recentAvgScore(userId),
    ]);

    return {
      totalCourses: courses.length,
      completedCount: completed.length,
      inProgress,
      notStarted,
      completed,
      weakSpots,
      recentAvgScore,
    };
  }

  /** Most-recent quiz result per section, kept only where it's weak/failed. */
  private async computeWeakSpots(
    userId: string,
    courseIds: string[],
  ): Promise<WeakSpot[]> {
    if (!courseIds.length) return [];

    const courseDocs = await this.courseModel
      .find({ _id: { $in: courseIds.map((id) => new Types.ObjectId(id)) } })
      .select('title sections._id sections.title')
      .lean();

    const sectionMap = new Map<
      string,
      { courseId: string; courseTitle: string; sectionTitle: string }
    >();
    for (const c of courseDocs) {
      const sections =
        (c as { sections?: { _id: Types.ObjectId; title: string }[] })
          .sections ?? [];
      for (const s of sections) {
        sectionMap.set(String(s._id), {
          courseId: String((c as { _id: Types.ObjectId })._id),
          courseTitle: (c as { title: string }).title,
          sectionTitle: s.title,
        });
      }
    }

    const attempts = await this.quizAttemptModel
      .find({
        studentId: new Types.ObjectId(userId),
        status: 'submitted',
        score: { $ne: null },
      })
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(50)
      .select('sectionId score passed')
      .lean();

    // First seen per section = most recent (already sorted desc).
    const latest = new Map<string, { score: number; passed: boolean }>();
    for (const a of attempts) {
      const sid = String(a.sectionId);
      if (!latest.has(sid)) {
        latest.set(sid, { score: a.score ?? 0, passed: !!a.passed });
      }
    }

    const weak: WeakSpot[] = [];
    for (const [sid, r] of latest) {
      if (r.passed && r.score >= WEAK_SCORE) continue; // doing fine here
      const info = sectionMap.get(sid);
      if (!info) continue; // section/course no longer accessible
      weak.push({
        courseId: info.courseId,
        sectionId: sid,
        courseTitle: info.courseTitle,
        sectionTitle: info.sectionTitle,
        score: Math.round(r.score),
        passed: r.passed,
      });
    }
    return weak.sort((a, b) => a.score - b.score).slice(0, 6);
  }

  private async recentAvgScore(userId: string): Promise<number | null> {
    const attempts = await this.quizAttemptModel
      .find({
        studentId: new Types.ObjectId(userId),
        status: 'submitted',
        score: { $ne: null },
      })
      .sort({ submittedAt: -1 })
      .limit(10)
      .select('score')
      .lean();
    if (!attempts.length) return null;
    const sum = attempts.reduce((s, a) => s + (a.score ?? 0), 0);
    return Math.round(sum / attempts.length);
  }

  // ── Prompt ──────────────────────────────────────────────────────────────

  private composeSnapshotText(s: CoachSnapshot): string {
    if (s.totalCourses === 0) {
      return 'The student is not enrolled in any courses yet.';
    }
    const lines: string[] = [
      `Enrolled in ${s.totalCourses} course(s); ${s.completedCount} completed.`,
    ];
    if (s.recentAvgScore !== null) {
      lines.push(`Recent average quiz score: ${s.recentAvgScore}%.`);
    }
    if (s.inProgress.length) {
      lines.push('\nIn progress:');
      for (const c of s.inProgress.slice(0, 6)) {
        lines.push(
          `- "${c.title}" (link: /courses/${c.courseId}) — ${c.progressPercent}% done` +
            (c.daysSinceActivity !== null
              ? `, last active ${c.daysSinceActivity}d ago`
              : '') +
            (c.stalled ? ' [STALLED]' : ''),
        );
      }
    }
    if (s.notStarted.length) {
      lines.push('\nEnrolled but not started:');
      for (const c of s.notStarted.slice(0, 6)) {
        lines.push(`- "${c.title}" (link: /courses/${c.courseId})`);
      }
    }
    if (s.weakSpots.length) {
      lines.push('\nWeak spots (latest quiz result per section):');
      for (const w of s.weakSpots) {
        lines.push(
          `- "${w.courseTitle} › ${w.sectionTitle}" — scored ${w.score}%` +
            (w.passed ? '' : ' (failed)'),
        );
      }
    }
    if (s.completed.length) {
      lines.push('\nCompleted:');
      for (const c of s.completed.slice(0, 5)) lines.push(`- "${c.title}"`);
    }
    return lines.join('\n');
  }

  private systemPrompt(s: CoachSnapshot): string {
    return (
      `You are EduGenie's AI Learning Coach. The student's REAL learning data is ` +
      `below — base everything on it; never invent courses, numbers, or links.\n` +
      `Be warm, brief, and specific. In your reply:\n` +
      `- Open with one encouraging sentence reading where they are.\n` +
      `- Recommend the SINGLE most important next action (resume a specific ` +
      `course/section, revisit a weak spot, or start a stalled / not-started one).\n` +
      `- If there are weak spots, name the exact section to revisit and suggest ` +
      `retaking that quiz.\n` +
      `- Use a few short bullets, then end with one motivating next step.\n` +
      `- Whenever you mention one of their courses, write it as a markdown link ` +
      `using its EXACT title and the given link — e.g. [Title](/courses/ID).\n` +
      (s.totalCourses === 0
        ? `\nThe student has no enrollments yet — warmly encourage them to browse ` +
          `courses or build a plan at /roadmap, and keep it short.\n`
        : '') +
      `\nSTUDENT DATA:\n${this.composeSnapshotText(s)}`
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Stream grounded coaching (SSE). Defaults to a "where am I / what next". */
  async *streamCoach(
    userId: string,
    message: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<string> {
    const snapshot = await this.buildSnapshot(userId);
    const userMessage =
      (message || '').trim() ||
      'Where am I in my learning, and what should I focus on next?';
    yield* this.ai.streamGrounded(
      this.systemPrompt(snapshot),
      userMessage,
      history,
    );
  }

  /** Structured snapshot for a dashboard stats card (deterministic, no LLM). */
  async getSnapshot(userId: string) {
    const s = await this.buildSnapshot(userId);
    return {
      totalCourses: s.totalCourses,
      completedCount: s.completedCount,
      inProgressCount: s.inProgress.length,
      stalledCount: s.inProgress.filter((c) => c.stalled).length,
      notStartedCount: s.notStarted.length,
      weakSpotCount: s.weakSpots.length,
      recentAvgScore: s.recentAvgScore,
      inProgress: s.inProgress,
      weakSpots: s.weakSpots,
    };
  }
}
