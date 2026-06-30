import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One lesson the student should rewatch to recover a missed concept. In the MVP
 * `concept` is the text of the quiz question they got wrong (no LLM clustering
 * yet); `lessonId` deep-links into the player via /learn/:courseId?lesson=.
 */
export interface RemediationItem {
  lessonId: string;
  lessonTitle: string;
  sectionId: string;
  sectionTitle: string;
  /** The missed quiz question (MVP) — later replaced by a named concept. */
  concept: string;
  /** Short "why revisit" copy. */
  reason: string;
}

export type RemediationStatus = 'active' | 'resolved';

/**
 * A targeted recovery plan generated when a student fails a section quiz the
 * final time (3×). Diagnosed deterministically from their wrong answers and
 * grounded in real lessons via RAG retrieval — no hallucinated ids. Marked
 * `resolved` once they later pass that section's quiz.
 */
@Schema({ timestamps: true })
export class RemediationPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  courseId: string;

  @Prop({ default: '' })
  courseTitle: string;

  @Prop({ required: true })
  sectionId: string;

  @Prop({ default: '' })
  sectionTitle: string;

  @Prop({ required: true })
  quizId: string;

  /** The questions the student missed (drives the plan). */
  @Prop({ type: [String], default: [] })
  missedConcepts: string[];

  /** Lessons to rewatch, deduped by lesson. */
  @Prop({ type: Array, default: [] })
  items: RemediationItem[];

  @Prop({ default: 'active', enum: ['active', 'resolved'] })
  status: RemediationStatus;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;
}

export type RemediationPlanDocument = HydratedDocument<RemediationPlan>;
export const RemediationPlanSchema =
  SchemaFactory.createForClass(RemediationPlan);

// One active plan per student/section; list newest first.
RemediationPlanSchema.index({ userId: 1, createdAt: -1 });
RemediationPlanSchema.index({ userId: 1, sectionId: 1, status: 1 });
