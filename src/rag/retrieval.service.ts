import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
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

/** Atlas Vector Search index names (see scripts/create-vector-indexes.mjs). */
const CHUNK_VECTOR_INDEX = 'content_chunk_vector_index';
const CARD_VECTOR_INDEX = 'course_card_vector_index';

/** Row shapes returned by the $vectorSearch aggregations. */
interface ChunkHit {
  lessonId?: Types.ObjectId;
  lessonTitle?: string;
  sectionId?: Types.ObjectId;
  sectionTitle?: string;
  text?: string;
  score?: number;
}
interface CardHit {
  courseId?: Types.ObjectId;
  title?: string;
  level?: string;
  price?: number;
  ratingAverage?: number;
  totalEnrollments?: number;
  goals?: string[];
  score?: number;
}
/** Lean projection used by the in-Node fallback (needs the raw embedding). */
interface ChunkVecRow extends ChunkHit {
  embedding: number[];
}
interface CardVecRow extends CardHit {
  embedding: number[];
}

/**
 * Access-agnostic retrieval. Callers (the tutor / roadmap) decide the scope and
 * which sections the student may see; this service embeds the query and returns
 * the top-k candidates ranked by relevance.
 *
 * Two backends, chosen by `RAG_USE_VECTOR_SEARCH`:
 *  - **Atlas $vectorSearch** (flag on): approximate KNN in MongoDB, with the
 *    access-control scope applied as a pre-`filter` so locked content never
 *    enters the candidate set. Requires the indexes from
 *    scripts/create-vector-indexes.mjs.
 *  - **In-Node cosine** (default): load the pre-filtered candidate embeddings
 *    and rank them in-process — fine while the candidate set is small.
 *
 * A vector-search error (missing index, transient Atlas issue) automatically
 * degrades to the in-Node path, so the tutor never breaks. Both backends
 * degrade to an empty result when embeddings aren't configured or there are no
 * candidates — letting the tutor fall back to its non-RAG prompt.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly useVectorSearch =
    process.env.RAG_USE_VECTOR_SEARCH === 'true';

  constructor(
    @InjectModel(ContentChunk.name)
    private chunkModel: Model<ContentChunkDocument>,
    @InjectModel(CourseCard.name)
    private cardModel: Model<CourseCardDocument>,
    @Inject(EMBEDDINGS_PROVIDER) private embeddings: EmbeddingsProvider,
  ) {
    if (this.useVectorSearch) {
      this.logger.log('RAG retrieval backend: Atlas $vectorSearch (flag on)');
    }
  }

  /**
   * Catalog retrieval (tier-3 roadmap): rank PUBLISHED course cards by relevance
   * to a goal/query so the advisor recommends real, enrollable courses. Every
   * card is a published course, so no filter is needed.
   */
  async retrieveCatalog(query: string, k = 5): Promise<RetrievedCourse[]> {
    if (!query?.trim() || !this.embeddings.isConfigured) return [];

    const queryVec = await this.embedQuery(query);
    if (!queryVec) return [];

    if (this.useVectorSearch) {
      try {
        return await this.retrieveCatalogVector(queryVec, k);
      } catch (err) {
        this.logger.warn(
          `Catalog $vectorSearch failed — falling back to in-Node: ${this.msg(err)}`,
        );
      }
    }
    return this.retrieveCatalogInNode(queryVec, k);
  }

  async retrieve(opts: RetrieveOptions): Promise<RetrievedChunk[]> {
    const { query, lessonId, courseId, sectionIds, k = 5, minScore = 0 } = opts;
    if (!query?.trim() || !this.embeddings.isConfigured) return [];

    const filter = this.buildChunkFilter(lessonId, courseId, sectionIds);
    if (!filter) return [];

    const queryVec = await this.embedQuery(query);
    if (!queryVec) return [];

    if (this.useVectorSearch) {
      try {
        return await this.retrieveVector(filter, queryVec, k, minScore);
      } catch (err) {
        this.logger.warn(
          `Chunk $vectorSearch failed — falling back to in-Node: ${this.msg(err)}`,
        );
      }
    }
    return this.retrieveInNode(filter, queryVec, k, minScore);
  }

  // ── Atlas $vectorSearch backend ────────────────────────────────────────────

  private async retrieveCatalogVector(
    queryVec: number[],
    k: number,
  ): Promise<RetrievedCourse[]> {
    const pipeline: PipelineStage[] = [
      {
        $vectorSearch: {
          index: CARD_VECTOR_INDEX,
          path: 'embedding',
          queryVector: queryVec,
          numCandidates: this.numCandidates(k),
          limit: k,
        },
      },
      {
        $project: {
          _id: 0,
          courseId: 1,
          title: 1,
          level: 1,
          price: 1,
          ratingAverage: 1,
          totalEnrollments: 1,
          goals: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const rows = await this.cardModel.aggregate<CardHit>(pipeline).exec();
    return rows.map((c) => ({
      courseId: c.courseId?.toString() ?? '',
      title: c.title ?? '',
      level: c.level ?? '',
      price: c.price ?? 0,
      ratingAverage: c.ratingAverage ?? 0,
      totalEnrollments: c.totalEnrollments ?? 0,
      goals: c.goals ?? [],
      score: c.score ?? 0,
    }));
  }

  private async retrieveVector(
    filter: Record<string, unknown>,
    queryVec: number[],
    k: number,
    minScore: number,
  ): Promise<RetrievedChunk[]> {
    const pipeline: PipelineStage[] = [
      {
        $vectorSearch: {
          index: CHUNK_VECTOR_INDEX,
          path: 'embedding',
          queryVector: queryVec,
          numCandidates: this.numCandidates(k),
          limit: k,
          filter,
        },
      },
      {
        $project: {
          _id: 0,
          lessonId: 1,
          lessonTitle: 1,
          sectionId: 1,
          sectionTitle: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const rows = await this.chunkModel.aggregate<ChunkHit>(pipeline).exec();
    return rows
      .map((c) => ({
        lessonId: c.lessonId?.toString() ?? '',
        lessonTitle: c.lessonTitle ?? '',
        sectionId: c.sectionId?.toString() ?? '',
        sectionTitle: c.sectionTitle ?? '',
        text: c.text ?? '',
        score: c.score ?? 0,
      }))
      .filter((s) => s.score >= minScore);
  }

  // ── In-Node cosine backend (default / fallback) ────────────────────────────

  private async retrieveCatalogInNode(
    queryVec: number[],
    k: number,
  ): Promise<RetrievedCourse[]> {
    const cards = await this.cardModel
      .find()
      .select(
        'courseId title level price ratingAverage totalEnrollments goals embedding',
      )
      .lean<CardVecRow[]>()
      .exec();
    if (!cards.length) return [];

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

  private async retrieveInNode(
    filter: Record<string, unknown>,
    queryVec: number[],
    k: number,
    minScore: number,
  ): Promise<RetrievedChunk[]> {
    const candidates = await this.chunkModel
      .find(filter)
      .select('lessonId lessonTitle sectionId sectionTitle text embedding')
      .lean<ChunkVecRow[]>()
      .exec();
    if (!candidates.length) return [];

    const scored = candidates.map((c) => ({
      lessonId: c.lessonId?.toString() ?? '',
      lessonTitle: c.lessonTitle ?? '',
      sectionId: c.sectionId?.toString() ?? '',
      sectionTitle: c.sectionTitle ?? '',
      text: c.text ?? '',
      score: cosine(queryVec, c.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score >= minScore).slice(0, k);
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  /**
   * Translate the tutor's scope into a Mongo/vector filter. Same shape for both
   * backends so access control is identical: a lesson-scoped query sees only
   * that lesson; a course-scoped query sees only the sections the student owns.
   * Returns null when the scope is invalid (caller returns no results).
   */
  private buildChunkFilter(
    lessonId?: string,
    courseId?: string,
    sectionIds?: string[],
  ): Record<string, unknown> | null {
    if (lessonId && Types.ObjectId.isValid(lessonId)) {
      return { lessonId: new Types.ObjectId(lessonId) };
    }
    if (courseId && Types.ObjectId.isValid(courseId)) {
      const filter: Record<string, unknown> = {
        courseId: new Types.ObjectId(courseId),
      };
      const owned = (sectionIds ?? []).filter((s) => Types.ObjectId.isValid(s));
      if (owned.length) {
        filter.sectionId = { $in: owned.map((s) => new Types.ObjectId(s)) };
      }
      return filter;
    }
    return null;
  }

  /** Embed the query, returning null (not throwing) on failure. */
  private async embedQuery(query: string): Promise<number[] | null> {
    try {
      const [vec] = await this.embeddings.embed([query], 'query');
      return vec?.length ? vec : null;
    } catch (err) {
      this.logger.warn(`Query embedding failed: ${this.msg(err)}`);
      return null;
    }
  }

  /** Atlas wants numCandidates ≥ limit; ~20× gives good ANN recall. */
  private numCandidates(k: number): number {
    return Math.min(Math.max(k * 20, 150), 10000);
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
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
