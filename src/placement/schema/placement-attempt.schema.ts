import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One generated question (correctAnswers are stored server-side only). */
export interface PlacementQuestion {
  id: string;
  questionText: string;
  type: string;
  options: string[];
  correctAnswers: string[];
}

/** A course section under assessment, with its generated questions. */
export interface PlacementSection {
  sectionId: string;
  title: string;
  price: number | null;
  questions: PlacementQuestion[];
}

/** Per-section grading result. */
export interface PlacementResult {
  sectionId: string;
  title: string;
  price: number | null;
  score: number; // 0–100
  correct: number;
  total: number;
  mastered: boolean; // score ≥ pass threshold
}

/** The buy recommendation derived from the results. */
export interface PlacementRecommendation {
  mode: 'sections' | 'full' | 'none';
  message: string;
  coursePrice: number;
  totalPrice: number;
  savings: number;
  sections: { sectionId: string; title: string; price: number | null }[];
  results: PlacementResult[];
}

/**
 * A pre-purchase placement attempt. The generated test (with correct answers)
 * is persisted so submission can be graded server-side without trusting the
 * client. Attempts auto-expire after 2h via a TTL index on `expiresAt`.
 */
@Schema({ timestamps: true })
export class PlacementAttempt {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ required: true })
  courseTitle: string;

  @Prop({ default: 0 })
  coursePrice: number;

  @Prop({ type: [Object], default: [] })
  sections: PlacementSection[];

  @Prop({ type: String, enum: ['pending', 'submitted'], default: 'pending' })
  status: 'pending' | 'submitted';

  @Prop({ type: Object, default: null })
  recommendation: PlacementRecommendation | null;

  // TTL: Mongo removes the document once `expiresAt` is in the past.
  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
    index: { expires: 0 },
  })
  expiresAt: Date;
}

export type PlacementAttemptDocument = HydratedDocument<PlacementAttempt>;
export const PlacementAttemptSchema =
  SchemaFactory.createForClass(PlacementAttempt);
