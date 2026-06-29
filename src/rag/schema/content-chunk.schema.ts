import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One embedded slice of lesson transcript. The retrieval set for a tutor query
 * is small (one course = tens–hundreds of chunks), so Phase 2 loads a course's
 * chunks and ranks them with in-Node cosine similarity — no Atlas Vector Search
 * index required for the MVP.
 */
@Schema({ timestamps: true })
export class ContentChunk {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  sectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  lessonId: Types.ObjectId;

  @Prop({ default: '' })
  lessonTitle: string;

  @Prop({ default: '' })
  sectionTitle: string;

  /** Position of this chunk within its lesson (for stable ordering). */
  @Prop({ default: 0 })
  ordinal: number;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ default: 0 })
  dims: number;

  @Prop({ default: '' })
  model: string;

  /** sha256(model + lesson transcript) — lets reindex skip unchanged lessons. */
  @Prop({ index: true, default: '' })
  contentHash: string;
}

export type ContentChunkDocument = HydratedDocument<ContentChunk>;
export const ContentChunkSchema = SchemaFactory.createForClass(ContentChunk);
ContentChunkSchema.index({ courseId: 1, lessonId: 1 });
