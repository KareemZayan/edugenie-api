import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { CoachService, CoachSnapshot } from './coach.service';
import { CoachProfile } from './schema/coach-profile.schema';
import { CoachProfileService, weekKey } from './coach-profile.service';

/**
 * Proactive AI coach. Reuses the deterministic snapshot to nudge learners
 * (weekly digest, weak-spot quiz-ready, goal reached) via the shared
 * NotificationsService (Pusher + email come free). Each nudge is de-duped with a
 * per-user timestamp on CoachProfile. Deliberately does NOT duplicate the
 * Monday-9am inactivity cron (EnrollmentsCronService) — that already owns
 * "you haven't studied" reminders.
 */
@Injectable()
export class CoachCronService {
  private readonly logger = new Logger(CoachCronService.name);
  /** Safety cap so a growing user base can't make one cron run unbounded. */
  private readonly BATCH_CAP = 500;

  constructor(
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    private readonly coach: CoachService,
    private readonly profiles: CoachProfileService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Distinct learners with at least one course still in progress. */
  private async activeLearners(): Promise<string[]> {
    const ids = (await this.enrollmentModel.distinct('studentId', {
      isCourseCompleted: false,
    })) as unknown[];
    if (ids.length > this.BATCH_CAP) {
      this.logger.warn(
        `Coach cron: ${ids.length} learners, processing first ${this.BATCH_CAP}.`,
      );
    }
    return ids.slice(0, this.BATCH_CAP).map((id) => String(id));
  }

  private recent(d: Date | null | undefined, days: number): boolean {
    return !!d && Date.now() - new Date(d).getTime() < days * 86_400_000;
  }

  // Monday 08:00 — weekly progress digest (+ goal-reached celebration).
  @Cron('0 8 * * 1')
  async runWeeklyDigest(): Promise<void> {
    const learners = await this.activeLearners();
    this.logger.log(`Coach weekly digest: ${learners.length} learner(s).`);
    for (const userId of learners) {
      try {
        const profile = (await this.profiles.getProfile(userId)) as CoachProfile;
        if (this.recent(profile.lastWeeklyDigestAt, 6)) continue;

        const s = await this.coach.buildSnapshot(userId);
        if (!s.totalCourses) continue;

        await this.notifications.create(
          userId,
          'Your week in review 📈',
          this.digestBody(s),
          NotificationType.WEEKLY_SUMMARY,
        );
        await this.profiles.markWeeklyDigest(userId);

        // Celebrate a reached weekly goal once per week.
        if (
          s.goal &&
          s.goal.pct >= 100 &&
          profile.lastGoalMilestoneWeek !== weekKey()
        ) {
          await this.notifications.create(
            userId,
            'Weekly goal smashed! 🎯',
            `You hit your goal of ${s.goal.target} lessons this week. Keep the streak alive!`,
            NotificationType.GOAL_MILESTONE,
          );
          await this.profiles.markGoalMilestone(userId);
        }
      } catch (e) {
        this.logger.error(
          `Weekly digest failed for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // Wednesday 17:00 — nudge learners with a weak spot to practice.
  @Cron('0 17 * * 3')
  async runWeakSpotNudges(): Promise<void> {
    const learners = await this.activeLearners();
    this.logger.log(`Coach weak-spot nudges: ${learners.length} learner(s).`);
    for (const userId of learners) {
      try {
        const profile = (await this.profiles.getProfile(userId)) as CoachProfile;
        if (this.recent(profile.lastWeakSpotNudgeAt, 7)) continue;

        const s = await this.coach.buildSnapshot(userId);
        const w = s.weakSpots[0];
        if (!w) continue;

        await this.notifications.create(
          userId,
          'A quick quiz could boost your score',
          `Your weakest spot is "${w.courseTitle} › ${w.sectionTitle}" (${w.score}%). ` +
            `A 5-minute practice quiz on your Coach page can lift it.`,
          NotificationType.QUIZ_GENERATION_AVAILABLE,
          w.courseId,
        );
        await this.profiles.markWeakSpotNudge(userId);
      } catch (e) {
        this.logger.error(
          `Weak-spot nudge failed for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private digestBody(s: CoachSnapshot): string {
    const bits: string[] = [];
    if (s.streak.current > 0) bits.push(`🔥 ${s.streak.current}-day streak`);
    if (s.goal) {
      bits.push(
        `weekly goal ${s.goal.completedThisWeek}/${s.goal.target}` +
          (s.goal.pct >= 100 ? ' ✅' : ''),
      );
    }
    if (s.recentAvgScore !== null) bits.push(`avg quiz ${s.recentAvgScore}%`);
    if (s.weakSpots.length) bits.push(`${s.weakSpots.length} weak spot(s) to revisit`);
    const head = bits.length ? bits.join(' · ') + '. ' : '';
    const next = s.inProgress[0]
      ? `Pick up "${s.inProgress[0].title}" (${s.inProgress[0].progressPercent}% done).`
      : 'Open your Coach for a personalized next step.';
    return `${head}${next}`;
  }
}
