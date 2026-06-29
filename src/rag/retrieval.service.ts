import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContentChunk,
  ContentChunkDocument,
} from './schema/content-chunk.schema';
import { CourseCard, CourseCardDocument } from './schema/course-card.schema';
import { EMBEDDINGS_PROVIDER } from './embeddings/embeddings.provider';
import type { EmbeddingsProvider } from './embeddings/embeddings.provider';

export interface RetrievedChunk {
  lessonId: string;
  lessonTitle: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  score: number;
}

export interface RetrievedCourse {
  courseId: string;
  title: string;
  level: string;
  price: number;
  ratingAverage: number;
  totalEnrollments: number;
  goals: string[];
  score: number;
}

export interface RetrieveOptions {
  query: string;
  /** Lesson scope (tier-1 tutor): only this lesson's chunks. */
  lessonId?: string;
  /** Course scope (tier-2 tutor): this course's chunks… */
  courseId?: string;
  /** …restricted to these (owned) section ids for access control. */
  sectionIds?: string[];
  /** Max chunks to return. */
  k?: number;
  /** Drop chunks below this cosine score (0 = keep top-k regardless). */
  minScore?: number;
}

/**
 * Access-agnostic retrieval. Callers (the tutor) decide the scope + which
 * sections the student may see; this service just embeds the query and ranks
 * the candidate chunks by cosine similarity in-process. The candidate set is
 * small (one lesson/course), so no Atlas Vector Search index is needed for the
 * MVP. Degrades to an empty result if embeddings aren't configured or there are
 * no chunks — letting the tutor fall back to its non-RAG prompt.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    @InjectModel(ContentChunk.name)
    private chunkModel: Model<ContentChunkDocument>,
    @InjectModel(CourseCard.name)
    private cardModel: Model<CourseCardDocument>,
    @Inject(EMBEDDINGS_PROVIDER) private embeddings: EmbeddingsProvider,
  ) {}

  /**
   * Catalog retrieval (tier-3 roadmap): rank PUBLISHED course cards by relevance
   * to a goal/query so the advisor recommends real, enrollable courses.
   */
  async retrieveCatalog(query: string, k = 5): Promise<RetrievedCourse[]> {
    if (!query?.trim() || !this.embeddings.isConfigured) return [];

    const cards = await this.cardModel
      .find()
      .select(
        'courseId title level price ratingAverage totalEnrollments goals embedding',
      )
      .lean<
        {
          courseId: Types.ObjectId;
          title: string;
          level: string;
          price: number;
          ratingAverage: number;
          totalEnrollments: number;
          goals: string[];
          embedding: number[];
        }[]
      >()
      .exec();
    if (!cards.length) return [];

    let queryVec: number[];
    try {
      const [vec] = await this.embeddings.embed([query], 'query');
      queryVec = vec;
    } catch (err) {
      this.logger.warn(
        `Catalog query embedding failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
    if (!queryVec?.length) return [];

    const scored = cards.map((c) => ({
      courseId: c.courseId?.toString() ?? '',
      title: c.title ?? '',
      level: c.level ?? '',
      price: c.price ?? 0,
      ratingAverage: c.ratingAverage ?? 0,
      totalEnrollments: c.totalEnrollments ?? 0,
      goals: c.goals ?? [],
      score: cosine(queryVec, c.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  async retrieve(opts: RetrieveOptions): Promise<RetrievedChunk[]> {
    const { query, lessonId, courseId, sectionIds, k = 5, minScore = 0 } = opts;
    if (!query?.trim() || !this.embeddings.isConfigured) return [];

    const filter: Record<string, unknown> = {};
    if (lessonId && Types.ObjectId.isValid(lessonId)) {
      filter.lessonId = new Types.ObjectId(lessonId);
    } else if (courseId && Types.ObjectId.isValid(courseId)) {
      filter.courseId = new Types.ObjectId(courseId);
      const owned = (sectionIds ?? []).filter((s) => Types.ObjectId.isValid(s));
      if (owned.length) {
        filter.sectionId = { $in: owned.map((s) => new Types.ObjectId(s)) };
      }
    } else {
      return [];
    }

    const candidates = await this.chunkModel
      .find(filter)
      .select('lessonId lessonTitle sectionId sectionTitle text embedding')
      .lean<
        {
          lessonId: Types.ObjectId;
          lessonTitle: string;
          sectionId: Types.ObjectId;
          sectionTitle: string;
          text: string;
          embedding: number[];
        }[]
      >()
      .exec();
    if (!candidates.length) return [];

    let queryVec: number[];
    try {
      const [vec] = await this.embeddings.embed([query], 'query');
      queryVec = vec;
    } catch (err) {
      this.logger.warn(
        `Query embedding failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
    if (!queryVec?.length) return [];

    const scored = candidates.map((c) => ({
      lessonId: c.lessonId?.toString() ?? '',
      lessonTitle: c.lessonTitle ?? '',
      sectionId: c.sectionId?.toString() ?? '',
      sectionTitle: c.sectionTitle ?? '',
      text: c.text,
      score: cosine(queryVec, c.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score >= minScore).slice(0, k);
  }
}

/** Cosine similarity. Normalises internally, so inputs needn't be unit vectors. */
function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
