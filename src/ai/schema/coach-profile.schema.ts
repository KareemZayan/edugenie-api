import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One assigned daily mission (auto-verified from real activity). */
export interface CoachMission {
  key: string;
  type:
    | 'streak'
    | 'weak_spot'
    | 'resume_course'
    | 'any_lesson'
    | 'any_quiz';
  label: string;
  xp: number;
  courseId?: string;
  sectionId?: string;
}

/**
 * Per-student coaching state: the learning streak and weekly goal that make the
 * AI coach gamified, plus dedupe timestamps for the proactive coach cron. One
 * doc per user (created lazily on first activity / goal set). Deliberately lives
 * in its own tiny module so `ProgressService` can record activity without
 * importing the whole `AiModule` (avoids a DI cycle).
 */
@Schema({ timestamps: true })
export class CoachProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  /** Target lessons to complete per week. 0 = not set yet. */
  @Prop({ default: 0 })
  weeklyGoalLessons: number;

  /** Consecutive active-day streak (raw; read via effectiveStreak for display). */
  @Prop({ default: 0 })
  streakCurrent: number;

  @Prop({ default: 0 })
  streakLongest: number;

  /** Last day the student did any tracked activity, as 'YYYY-MM-DD' (UTC). */
  @Prop({ default: '' })
  lastActiveDay: string;

  // ── Proactive-coach dedupe guards (Phase 4 cron) ───────────────────────────
  @Prop({ type: Date, default: null })
  lastWeeklyDigestAt: Date | null;

  @Prop({ type: Date, default: null })
  lastWeakSpotNudgeAt: Date | null;

  /** Week key ('YYYY-MM-DD' of Monday) the goal-reached nudge last fired for. */
  @Prop({ default: '' })
  lastGoalMilestoneWeek: string;

  // ── Daily missions + XP (gamified coach) ───────────────────────────────────
  /** Lifetime XP earned from completing missions. */
  @Prop({ default: 0 })
  xpTotal: number;

  /** The day ('YYYY-MM-DD' UTC) the current mission set was generated for. */
  @Prop({ default: '' })
  missionsDay: string;

  /** Today's assigned missions (stable through the day). */
  @Prop({ type: Array, default: [] })
  missions: CoachMission[];

  /** Mission keys already XP-credited today (idempotency guard). */
  @Prop({ type: [String], default: [] })
  creditedKeys: string[];

  /** Optional AI motivational line, cached per mission day. */
  @Prop({ default: '' })
  missionsNote: string;
}

export type CoachProfileDocument = HydratedDocument<CoachProfile>;
export const CoachProfileSchema = SchemaFactory.createForClass(CoachProfile);
