import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Progress } from '../progress/schema/progress.schema';
import { QuizAttempt } from '../quizzes/schema/quiz-attempt.schema';
import { CoachService, CoachSnapshot } from './coach.service';
import { CoachProfile, CoachMission } from './schema/coach-profile.schema';
import {
  CoachProfileService,
  dayStartUtc,
  todayKey,
} from './coach-profile.service';

const ALL_DONE_BONUS = 10;
const MAX_MISSIONS = 3;

export interface MissionView extends CoachMission {
  done: boolean;
}

export interface CoachMissions {
  day: string;
  missions: MissionView[];
  doneCount: number;
  total: number;
  allDone: boolean;
  xpTotal: number;
  level: number;
  note: string;
}

/**
 * The coach as an ACTING agent: each day it assigns a few concrete missions and
 * verifies them from the student's REAL activity (Progress / QuizAttempt) — no
 * chat required. Generation is deterministic (never fails); XP is credited
 * idempotently on read (safe to call repeatedly).
 */
@Injectable()
export class CoachMissionsService {
  constructor(
    @InjectModel(Progress.name) private progressModel: Model<Progress>,
    @InjectModel(QuizAttempt.name)
    private quizAttemptModel: Model<QuizAttempt>,
    private coach: CoachService,
    private profiles: CoachProfileService,
  ) {}

  async getToday(userId: string): Promise<CoachMissions> {
    const [snapshot, profile] = await Promise.all([
      this.coach.buildSnapshot(userId),
      this.profiles.getProfile(userId) as Promise<CoachProfile>,
    ]);
    const day = todayKey();

    // Reuse the stored set through the day; regenerate on a new day.
    let missions = profile.missions ?? [];
    let creditedKeys = profile.creditedKeys ?? [];
    let note = profile.missionsNote ?? '';
    if (profile.missionsDay !== day || missions.length === 0) {
      missions = this.generate(snapshot);
      note = this.buildNote(snapshot);
      await this.profiles.saveMissions(userId, day, missions, note);
      creditedKeys = [];
    }

    // Verify each mission against today's real activity.
    const since = dayStartUtc();
    const done = await Promise.all(
      missions.map((m) => this.verify(userId, m, snapshot, since)),
    );
    const view: MissionView[] = missions.map((m, i) => ({ ...m, done: done[i] }));
    const allDone = view.length > 0 && view.every((m) => m.done);

    // Credit XP for anything newly complete (idempotent via creditedKeys).
    const bonusKey = `bonus:${day}`;
    const toCredit: string[] = [];
    let xpGain = 0;
    for (const m of view) {
      if (m.done && !creditedKeys.includes(m.key)) {
        toCredit.push(m.key);
        xpGain += m.xp;
      }
    }
    if (allDone && !creditedKeys.includes(bonusKey)) {
      toCredit.push(bonusKey);
      xpGain += ALL_DONE_BONUS;
    }
    let xpTotal = profile.xpTotal ?? 0;
    if (toCredit.length && xpGain > 0) {
      await this.profiles.creditXp(userId, toCredit, xpGain);
      xpTotal += xpGain;
    }

    return {
      day,
      missions: view,
      doneCount: view.filter((m) => m.done).length,
      total: view.length,
      allDone,
      xpTotal,
      level: Math.floor(xpTotal / 100) + 1,
      note,
    };
  }

  /** Deterministic ≤3 missions from the snapshot (order = priority). */
  private generate(s: CoachSnapshot): CoachMission[] {
    const out: CoachMission[] = [
      {
        key: 'streak',
        type: 'streak',
        xp: 5,
        label:
          s.streak.current > 0
            ? `Study today to keep your ${s.streak.current}-day streak alive`
            : 'Study today to start a learning streak',
      },
    ];

    const w = s.weakSpots[0];
    if (w) {
      out.push({
        key: `weak:${w.sectionId}`,
        type: 'weak_spot',
        xp: 20,
        courseId: w.courseId,
        sectionId: w.sectionId,
        label: `Boost "${w.sectionTitle}" — pass its section quiz (≥70%)`,
      });
    }

    const resume = s.inProgress.find((c) => c.stalled) ?? s.inProgress[0];
    if (resume && out.length < MAX_MISSIONS) {
      out.push({
        key: `resume:${resume.courseId}`,
        type: 'resume_course',
        xp: 10,
        courseId: resume.courseId,
        label: `Resume "${resume.title}" — complete a lesson`,
      });
    }

    if (out.length < MAX_MISSIONS) {
      out.push({ key: 'any_lesson', type: 'any_lesson', xp: 10, label: 'Complete any 1 lesson' });
    }
    if (out.length < MAX_MISSIONS) {
      out.push({ key: 'any_quiz', type: 'any_quiz', xp: 15, label: 'Pass any quiz (≥70%)' });
    }
    return out.slice(0, MAX_MISSIONS);
  }

  private buildNote(s: CoachSnapshot): string {
    if (s.totalCourses === 0) {
      return 'Enroll in a course and knock out your first mission today.';
    }
    if (s.weakSpots.length) {
      return 'A little focused practice today closes your biggest gap.';
    }
    return "Small daily wins compound — let's clear today's board.";
  }

  private async verify(
    userId: string,
    m: CoachMission,
    snapshot: CoachSnapshot,
    since: Date,
  ): Promise<boolean> {
    const studentId = new Types.ObjectId(userId);
    switch (m.type) {
      case 'streak':
        return snapshot.streak.activeToday;
      case 'weak_spot':
        return (
          (await this.quizAttemptModel.countDocuments({
            studentId,
            sectionId: new Types.ObjectId(m.sectionId),
            status: 'submitted',
            passed: true,
            submittedAt: { $gte: since },
          })) > 0
        );
      case 'resume_course':
        return (
          (await this.progressModel.countDocuments({
            studentId,
            courseId: new Types.ObjectId(m.courseId),
            isCompleted: true,
            completedAt: { $gte: since },
          })) > 0
        );
      case 'any_lesson':
        return (
          (await this.progressModel.countDocuments({
            studentId,
            isCompleted: true,
            completedAt: { $gte: since },
          })) > 0
        );
      case 'any_quiz':
        return (
          (await this.quizAttemptModel.countDocuments({
            studentId,
            status: 'submitted',
            passed: true,
            submittedAt: { $gte: since },
          })) > 0
        );
      default:
        return false;
    }
  }
}
