import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CoachProfile, CoachMission } from './schema/coach-profile.schema';

/** UTC 'YYYY-MM-DD' for a date. */
function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Start-of-day (00:00 UTC) for a date. */
export function dayStartUtc(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Today's UTC 'YYYY-MM-DD' key. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Start-of-week (Monday, 00:00 UTC) for a date. */
export function weekStartUtc(now = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday (Sun=0 → 6)
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Monday-key ('YYYY-MM-DD') identifying the current week. */
export function weekKey(now = new Date()): string {
  return dayKey(weekStartUtc(now));
}

/**
 * Owns the student's streak + weekly-goal state. Kept intentionally small (only
 * the CoachProfile model) so it can be shared by ProgressService (activity hook)
 * and the coach without a module cycle.
 */
@Injectable()
export class CoachProfileService {
  constructor(
    @InjectModel(CoachProfile.name)
    private readonly model: Model<CoachProfile>,
  ) {}

  private yesterdayKey(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return dayKey(d);
  }

  /** Get (or lazily create) the profile. */
  async getProfile(userId: string): Promise<CoachProfile> {
    const uid = new Types.ObjectId(userId);
    const doc = await this.model
      .findOneAndUpdate(
        { userId: uid },
        { $setOnInsert: { userId: uid } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean();
    return doc as CoachProfile;
  }

  /**
   * Record a day of activity and advance the streak. Idempotent per day. Never
   * throws — it's called fire-and-forget from the progress hot path.
   */
  async recordActivity(userId: string): Promise<void> {
    try {
      const uid = new Types.ObjectId(userId);
      const today = dayKey();
      const p = await this.model
        .findOne({ userId: uid })
        .select('lastActiveDay streakCurrent streakLongest')
        .lean<{ lastActiveDay?: string; streakCurrent?: number; streakLongest?: number }>();
      if (p?.lastActiveDay === today) return; // already counted today

      const next =
        p && p.lastActiveDay === this.yesterdayKey()
          ? (p.streakCurrent ?? 0) + 1
          : 1;
      const longest = Math.max(next, p?.streakLongest ?? 0);
      await this.model.updateOne(
        { userId: uid },
        {
          $set: { lastActiveDay: today, streakCurrent: next, streakLongest: longest },
          $setOnInsert: { userId: uid },
        },
        { upsert: true },
      );
    } catch {
      // best-effort: gamification must never break progress tracking
    }
  }

  /** Set the weekly lessons goal (clamped 1–20). */
  async setGoal(userId: string, weeklyGoalLessons: number): Promise<void> {
    const n = Math.max(1, Math.min(20, Math.round(weeklyGoalLessons || 0)));
    const uid = new Types.ObjectId(userId);
    await this.model.updateOne(
      { userId: uid },
      { $set: { weeklyGoalLessons: n }, $setOnInsert: { userId: uid } },
      { upsert: true },
    );
  }

  /**
   * Display streak: the stored count is only "live" if the last active day is
   * today or yesterday; otherwise the streak is broken (shows 0) even though the
   * stored value is preserved until the next activity resets it.
   */
  effectiveStreak(p: {
    lastActiveDay?: string;
    streakCurrent?: number;
  } | null): number {
    if (!p?.lastActiveDay) return 0;
    const live = p.lastActiveDay === dayKey() || p.lastActiveDay === this.yesterdayKey();
    return live ? p.streakCurrent ?? 0 : 0;
  }

  /** Stamp the weekly-digest guard. */
  async markWeeklyDigest(userId: string): Promise<void> {
    await this.model.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { lastWeeklyDigestAt: new Date() } },
      { upsert: true },
    );
  }

  /** Stamp the weak-spot nudge guard. */
  async markWeakSpotNudge(userId: string): Promise<void> {
    await this.model.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { lastWeakSpotNudgeAt: new Date() } },
      { upsert: true },
    );
  }

  /** Stamp the goal-milestone guard to the current week. */
  async markGoalMilestone(userId: string): Promise<void> {
    await this.model.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { lastGoalMilestoneWeek: weekKey() } },
      { upsert: true },
    );
  }

  // ── Daily missions + XP ────────────────────────────────────────────────────

  /** Store a freshly generated mission set for a day (resets today's credits). */
  async saveMissions(
    userId: string,
    day: string,
    missions: CoachMission[],
    note = '',
  ): Promise<void> {
    await this.model.updateOne(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          missionsDay: day,
          missions,
          creditedKeys: [],
          missionsNote: note,
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true },
    );
  }

  /** Credit XP for newly-completed mission keys (idempotent via creditedKeys). */
  async creditXp(userId: string, keys: string[], xp: number): Promise<void> {
    if (!keys.length || xp <= 0) return;
    await this.model.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $addToSet: { creditedKeys: { $each: keys } }, $inc: { xpTotal: xp } },
    );
  }
}
