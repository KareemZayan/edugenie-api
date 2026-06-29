import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One purchasable recommendation — a whole course or a specific section. */
export interface RoadmapItem {
  type: 'course' | 'section';
  courseId: string;
  sectionId?: string;
  title: string; // section title, or course title for a full-course item
  courseTitle: string;
  price: number;
  reason?: string;
}

/** An ordered step of the plan. */
export interface RoadmapMilestone {
  title: string;
  focus: string;
  items: RoadmapItem[];
}

export type RoadmapStatus = 'active' | 'purchased';

/**
 * A persisted, structured AI learning roadmap. Generated from the student's
 * intake, grounded in real catalog courses/sections (validated server-side —
 * no hallucinated ids or prices). Buying it adds its items to the normal cart;
 * it then acts as an ordered overlay over the resulting enrollments.
 */
@Schema({ timestamps: true })
export class Roadmap {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  goal: string;

  @Prop({ default: '' })
  level: string;

  /** A short encouraging intro the AI wrote for this plan. */
  @Prop({ default: '' })
  summary: string;

  @Prop({ type: Array, default: [] })
  milestones: RoadmapMilestone[];

  /** Deduped list of distinct purchasable items (drives cart + total). */
  @Prop({ type: Array, default: [] })
  items: RoadmapItem[];

  @Prop({ default: 0 })
  totalPrice: number;

  @Prop({ default: 'active', enum: ['active', 'purchased'] })
  status: RoadmapStatus;

  @Prop({ type: Date, default: null })
  purchasedAt: Date | null;
}

export type RoadmapDocument = HydratedDocument<Roadmap>;
export const RoadmapSchema = SchemaFactory.createForClass(Roadmap);
RoadmapSchema.index({ userId: 1, createdAt: -1 });
