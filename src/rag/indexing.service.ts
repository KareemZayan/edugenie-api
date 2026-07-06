import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { Course } from '../courses/schema/course.schema';
import { CourseStatus } from '../common/enums/course-status.enum';
import {
  ContentChunk,
  ContentChunkDocument,
} from './schema/content-chunk.schema';
import { CourseCard, CourseCardDocument } from './schema/course-card.schema';
import { EMBEDDINGS_PROVIDER } from './embeddings/embeddings.provider';
import type { EmbeddingsProvider } from './embeddings/embeddings.provider';
import { chunkText } from './chunking';

interface LeanLesson {
  _id: Types.ObjectId;
  title: string;
  transcript?: string;
}
interface LeanSection {
  _id: Types.ObjectId;
  title: string;
  lessons: LeanLesson[];
}
interface LeanCourse {
  _id: Types.ObjectId;
  title: string;
  sections: LeanSection[];
}

interface CatalogCourse {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  level?: string;
  price?: number;
  ratingAverage?: number;
  totalEnrollments?: number;
  goals?: string[];
  sections?: { title: string }[];
}

export interface ReindexStats {
  courseId: string;
  lessonsTotal: number;
  lessonsWithTranscript: number;
  lessonsIndexed: number; // freshly embedded this run
  lessonsSkipped: number; // unchanged (hash match)
  lessonsFailed: number;
  chunksUpserted: number;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(ContentChunk.name)
    private chunkModel: Model<ContentChunkDocument>,
    @InjectModel(CourseCard.name)
    private cardModel: Model<CourseCardDocument>,
    @Inject(EMBEDDINGS_PROVIDER) private embeddings: EmbeddingsProvider,
  ) {}

  /**
   * (Re)index every lesson transcript in a course. Idempotent: a lesson whose
   * transcript + embedding model are unchanged is skipped via a content hash,
   * so re-running is cheap and safe.
   */
  async reindexCourse(courseId: string): Promise<ReindexStats> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    if (!this.embeddings.isConfigured) {
      throw new ServiceUnavailableException(
        'Embeddings are not configured (set GEMINI_API_KEY).',
      );
    }

    const course = await this.courseModel
      .findById(courseId)
      .select('title sections')
      .lean<LeanCourse>()
      .exec();
    if (!course) throw new NotFoundException('Course not found');

    const stats: ReindexStats = {
      courseId,
      lessonsTotal: 0,
      lessonsWithTranscript: 0,
      lessonsIndexed: 0,
      lessonsSkipped: 0,
      lessonsFailed: 0,
      chunksUpserted: 0,
    };

    for (const section of course.sections ?? []) {
      for (const lesson of section.lessons ?? []) {
        stats.lessonsTotal++;
        const transcript = (lesson.transcript ?? '').trim();
        if (!transcript) continue;
        stats.lessonsWithTranscript++;

        const hash = this.hash(`${this.embeddings.model}|${transcript}`);
        const already = await this.chunkModel
          .findOne({ lessonId: lesson._id, contentHash: hash })
          .select('_id')
          .lean()
          .exec();
        if (already) {
          stats.lessonsSkipped++;
          continue;
        }

        try {
          stats.chunksUpserted += await this.indexLesson(
            course,
            section,
            lesson,
            transcript,
            hash,
          );
          stats.lessonsIndexed++;
        } catch (err) {
          stats.lessonsFailed++;
          this.logger.error(
            `Failed to index lesson ${lesson._id.toString()}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    this.logger.log(`Reindexed course ${courseId}: ${JSON.stringify(stats)}`);
    return stats;
  }

  private async indexLesson(
    course: LeanCourse,
    section: LeanSection,
    lesson: LeanLesson,
    transcript: string,
    hash: string,
  ): Promise<number> {
    const texts = chunkText(transcript);
    if (!texts.length) return 0;

    const vectors = await this.embeddings.embed(texts, 'document');

    // Replace any prior chunks for this lesson, then insert the fresh set.
    await this.chunkModel.deleteMany({ lessonId: lesson._id }).exec();
    const docs = texts.map((text, i) => ({
      courseId: course._id,
      sectionId: section._id,
      lessonId: lesson._id,
      lessonTitle: lesson.title,
      sectionTitle: section.title,
      ordinal: i,
      text,
      embedding: vectors[i],
      dims: this.embeddings.dims,
      model: this.embeddings.model,
      contentHash: hash,
    }));
    await this.chunkModel.insertMany(docs);
    return docs.length;
  }

  /** Backfill across courses (bounded). Re-runs reindexCourse for each. */
  async backfill(
    maxCourses = 25,
  ): Promise<{ coursesProcessed: number; stats: ReindexStats[] }> {
    const courses = await this.courseModel
      .find()
      .select('_id')
      .limit(maxCourses)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    const stats: ReindexStats[] = [];
    for (const c of courses) {
      try {
        stats.push(await this.reindexCourse(c._id.toString()));
      } catch (err) {
        this.logger.warn(
          `Backfill skipped ${c._id.toString()}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { coursesProcessed: stats.length, stats };
  }

  /** Remove a course's chunks (e.g. before an unpublish). */
  async clearCourse(courseId: string): Promise<{ deleted: number }> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    const res = await this.chunkModel
      .deleteMany({ courseId: new Types.ObjectId(courseId) })
      .exec();
    return { deleted: res.deletedCount ?? 0 };
  }

  async courseStatus(
    courseId: string,
  ): Promise<{ courseId: string; chunks: number; model: string | null }> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    const oid = new Types.ObjectId(courseId);
    const chunks = await this.chunkModel.countDocuments({ courseId: oid }).exec();
    const sample = await this.chunkModel
      .findOne({ courseId: oid })
      .select('model')
      .lean<{ model?: string }>()
      .exec();
    return { courseId, chunks, model: sample?.model ?? null };
  }

  // ── Catalog index (tier-3 roadmap recommendations) ─────────────────────────

  /**
   * (Re)index every PUBLISHED course as an embedded catalog card. Idempotent:
   * a course whose composed summary + model are unchanged is skipped.
   */
  async reindexCatalog(): Promise<{
    coursesTotal: number;
    coursesIndexed: number;
    coursesSkipped: number;
    coursesFailed: number;
  }> {
    if (!this.embeddings.isConfigured) {
      throw new ServiceUnavailableException(
        'Embeddings are not configured (set GEMINI_API_KEY).',
      );
    }

    const courses = await this.courseModel
      .find({ courseStatus: CourseStatus.PUBLISHED })
      .select('title description level price ratingAverage totalEnrollments goals sections')
      .lean<CatalogCourse[]>()
      .exec();

    const stats = {
      coursesTotal: courses.length,
      coursesIndexed: 0,
      coursesSkipped: 0,
      coursesFailed: 0,
    };

    for (const c of courses) {
      const result = await this.upsertCard(c);
      if (result === 'indexed') stats.coursesIndexed++;
      else if (result === 'skipped') stats.coursesSkipped++;
      else stats.coursesFailed++;
    }

    // Drop cards for courses that are no longer published.
    const publishedIds = courses.map((c) => c._id);
    await this.cardModel
      .deleteMany({ courseId: { $nin: publishedIds } })
      .exec();

    this.logger.log(`Reindexed catalog: ${JSON.stringify(stats)}`);
    return stats;
  }

  /** Upsert one course's catalog card. Skips if unchanged (hash match). */
  private async upsertCard(
    c: CatalogCourse,
  ): Promise<'indexed' | 'skipped' | 'failed'> {
    const text = this.composeCardText(c);
    const hash = this.hash(`${this.embeddings.model}|${text}`);
    const existing = await this.cardModel
      .findOne({ courseId: c._id, contentHash: hash })
      .select('_id')
      .lean()
      .exec();
    if (existing) return 'skipped';
    try {
      const [embedding] = await this.embeddings.embed([text], 'document');
      await this.cardModel.updateOne(
        { courseId: c._id },
        {
          $set: {
            courseId: c._id,
            title: c.title ?? '',
            level: c.level ?? '',
            price: c.price ?? 0,
            ratingAverage: c.ratingAverage ?? 0,
            totalEnrollments: c.totalEnrollments ?? 0,
            goals: c.goals ?? [],
            text,
            embedding,
            dims: this.embeddings.dims,
            model: this.embeddings.model,
            contentHash: hash,
          },
        },
        { upsert: true },
      );
      return 'indexed';
    } catch (err) {
      this.logger.error(
        `Failed to index catalog card ${c._id.toString()}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'failed';
    }
  }

  // ── Automatic hooks (called from course/transcript mutations) ──────────────
  // All are non-throwing so they can be awaited inside a request handler
  // (completes before the serverless function suspends) without risking the
  // host operation if indexing fails.

  /** Course published/edited → refresh its card; if no longer published, drop it. */
  async onCourseChanged(courseId: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(courseId) || !this.embeddings.isConfigured) {
        return;
      }
      const course = await this.courseModel
        .findById(courseId)
        .select(
          'title description level price ratingAverage totalEnrollments goals sections courseStatus',
        )
        .lean<(CatalogCourse & { courseStatus?: string }) | null>()
        .exec();
      if (!course) {
        await this.cardModel
          .deleteOne({ courseId: new Types.ObjectId(courseId) })
          .exec();
        return;
      }
      // Catalog card is PUBLISHED-only (semantic catalog search must not surface
      // drafts). Content chunks are built for EVERY course with transcripts —
      // drafts included — so search is ready the moment access is granted; chunk
      // retrieval is access-scoped by enrollment, so draft chunks never leak.
      if (course.courseStatus === CourseStatus.PUBLISHED) {
        await this.upsertCard(course);
      } else {
        await this.cardModel.deleteOne({ courseId: course._id }).exec();
      }
      await this.reindexCourse(courseId);
    } catch (err) {
      this.logger.warn(
        `onCourseChanged(${courseId}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Course deleted → remove its catalog card AND content chunks. */
  async onCourseRemoved(courseId: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(courseId)) return;
      const oid = new Types.ObjectId(courseId);
      await this.cardModel.deleteOne({ courseId: oid }).exec();
      await this.chunkModel.deleteMany({ courseId: oid }).exec();
    } catch (err) {
      this.logger.warn(
        `onCourseRemoved(${courseId}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * A lesson transcript was saved → (re)index that course's content chunks,
   * regardless of publish status. Every uploaded video is embedded so semantic
   * lesson search works for all owned content; retrieval is access-scoped, so
   * unpublished chunks never surface to users without access.
   */
  async onTranscriptSaved(courseId: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(courseId)) return;
      await this.reindexCourse(courseId);
    } catch (err) {
      this.logger.warn(
        `onTranscriptSaved(${courseId}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private composeCardText(c: {
    title: string;
    description?: string;
    level?: string;
    goals?: string[];
    sections?: { title: string }[];
  }): string {
    const sectionTitles = (c.sections ?? [])
      .map((s) => s.title)
      .filter(Boolean);
    const parts = [
      c.title,
      c.level ? `Level: ${c.level}` : '',
      (c.description ?? '').trim(),
      c.goals?.length ? `You will learn: ${c.goals.join('; ')}` : '',
      sectionTitles.length ? `Topics covered: ${sectionTitles.join(', ')}` : '',
    ].filter(Boolean);
    return parts.join('\n').slice(0, 4000);
  }

  private hash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
