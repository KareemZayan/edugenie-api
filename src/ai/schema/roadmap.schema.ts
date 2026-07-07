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

export type RoadmapStatus = 'active' | 'saved' | 'purchased';

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

  /** 3–5 short "what you'll gain" bullets shown on the roadmap. */
  @Prop({ type: [String], default: [] })
  benefits: string[];

  @Prop({ type: Array, default: [] })
  milestones: RoadmapMilestone[];

  /** Deduped list of distinct purchasable items (drives cart + total). */
  @Prop({ type: Array, default: [] })
  items: RoadmapItem[];

  @Prop({ default: 0 })
  totalPrice: number;

  @Prop({ default: 'active', enum: ['active', 'saved', 'purchased'] })
  status: RoadmapStatus;

  @Prop({ type: Date, default: null })
  purchasedAt: Date | null;

  // ── AI-usage budget (per-roadmap, fixed 30-day window) ─────────────────────
  // Each roadmap gets 3 AI attempts per window. `aiWindowStart` is set to the
  // moment of the FIRST AI attempt on this roadmap; the window runs 30 days from
  // there. `aiAttemptsUsed` counts attempts inside the current window. When the
  // window elapses the whole budget refills at once (computed, not stored). AI
  // generation + regeneration each cost one attempt; manual edits cost nothing;
  // the onboarding-exempt first build sets neither field.
  @Prop({ default: 0 })
  aiAttemptsUsed: number;

  @Prop({ type: Date, default: null })
  aiWindowStart: Date | null;
}

export type RoadmapDocument = HydratedDocument<Roadmap>;
export const RoadmapSchema = SchemaFactory.createForClass(Roadmap);
RoadmapSchema.index({ userId: 1, createdAt: -1 });
