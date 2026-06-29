import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * An embedded "catalog card" — one per PUBLISHED course — used by the tier-3
 * roadmap advisor to recommend real, enrollable courses (not hallucinated ones)
 * that match a student's goal. Embeds a short composed summary (title, level,
 * description, goals, section titles).
 */
@Schema({ timestamps: true })
export class CourseCard {
  @Prop({
    type: Types.ObjectId,
    ref: 'Course',
    required: true,
    unique: true,
    index: true,
  })
  courseId: Types.ObjectId;

  @Prop({ default: '' })
  title: string;

  @Prop({ default: '' })
  level: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({ default: 0 })
  ratingAverage: number;

  @Prop({ default: 0 })
  totalEnrollments: number;

  @Prop({ type: [String], default: [] })
  goals: string[];

  /** The text that was embedded (for debugging/inspection). */
  @Prop({ default: '' })
  text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ default: 0 })
  dims: number;

  @Prop({ default: '' })
  model: string;

  /** sha256(model + composed card text) — lets reindex skip unchanged courses. */
  @Prop({ index: true, default: '' })
  contentHash: string;
}

export type CourseCardDocument = HydratedDocument<CourseCard>;
export const CourseCardSchema = SchemaFactory.createForClass(CourseCard);
