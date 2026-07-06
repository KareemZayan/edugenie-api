import { Types } from 'mongoose';
import { CoachMissionsService } from './coach-missions.service';
import { todayKey } from './coach-profile.service';

const snapshot = (over: any = {}) => ({
  totalCourses: 2,
  streak: { current: 3, longest: 5, activeToday: false },
  weakSpots: [
    {
      courseId: new Types.ObjectId().toString(),
      sectionId: new Types.ObjectId().toString(),
      courseTitle: 'C',
      sectionTitle: 'Weak Sec',
      score: 40,
      passed: false,
    },
  ],
  inProgress: [
    { courseId: new Types.ObjectId().toString(), title: 'Course A', progressPercent: 30, stalled: true },
  ],
  ...over,
});

describe('CoachMissionsService', () => {
  let progressModel: any;
  let quizAttemptModel: any;
  let coach: any;
  let profiles: any;
  let service: CoachMissionsService;
  let stored: any;

  const userId = new Types.ObjectId().toString();

  beforeEach(() => {
    stored = {
      missionsDay: '',
      missions: [],
      creditedKeys: [],
      xpTotal: 0,
      missionsNote: '',
    };
    progressModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    quizAttemptModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    coach = { buildSnapshot: jest.fn().mockResolvedValue(snapshot()) };
    profiles = {
      getProfile: jest.fn().mockImplementation(() => Promise.resolve(stored)),
      saveMissions: jest.fn().mockImplementation((_u, day, missions, note) => {
        stored = { ...stored, missionsDay: day, missions, creditedKeys: [], missionsNote: note };
        return Promise.resolve();
      }),
      creditXp: jest.fn().mockImplementation((_u, keys, xp) => {
        stored.creditedKeys = [...stored.creditedKeys, ...keys];
        stored.xpTotal += xp;
        return Promise.resolve();
      }),
    };
    service = new CoachMissionsService(progressModel, quizAttemptModel, coach, profiles);
  });

  it('generates up to 3 deduped missions and persists them for today', async () => {
    const res = await service.getToday(userId);
    expect(res.missions.length).toBeLessThanOrEqual(3);
    expect(new Set(res.missions.map((m) => m.key)).size).toBe(res.missions.length);
    expect(res.missions[0].type).toBe('streak');
    expect(res.missions.some((m) => m.type === 'weak_spot')).toBe(true);
    expect(profiles.saveMissions).toHaveBeenCalledWith(
      userId,
      todayKey(),
      expect.any(Array),
      expect.any(String),
    );
  });

  it('marks the weak-spot mission done when its section quiz passed today', async () => {
    quizAttemptModel.countDocuments.mockResolvedValue(1); // any section quiz passed
    const res = await service.getToday(userId);
    const weak = res.missions.find((m) => m.type === 'weak_spot');
    expect(weak?.done).toBe(true);
    expect(res.xpTotal).toBeGreaterThanOrEqual(20);
  });

  it('does not double-credit XP on a second read the same day', async () => {
    coach.buildSnapshot.mockResolvedValue(snapshot({ streak: { current: 3, longest: 5, activeToday: true } }));
    const first = await service.getToday(userId);
    const xpAfterFirst = first.xpTotal;
    const second = await service.getToday(userId);
    expect(second.xpTotal).toBe(xpAfterFirst); // no extra credit
    // streak mission credited exactly once
    const streakCredits = stored.creditedKeys.filter((k: string) => k === 'streak').length;
    expect(streakCredits).toBe(1);
  });

  it('awards the all-done bonus exactly once', async () => {
    // Everything passes → all missions done.
    progressModel.countDocuments.mockResolvedValue(1);
    quizAttemptModel.countDocuments.mockResolvedValue(1);
    coach.buildSnapshot.mockResolvedValue(snapshot({ streak: { current: 3, longest: 5, activeToday: true } }));
    const res = await service.getToday(userId);
    expect(res.allDone).toBe(true);
    expect(stored.creditedKeys).toContain(`bonus:${todayKey()}`);
    const xpOnce = res.xpTotal;
    const again = await service.getToday(userId);
    expect(again.xpTotal).toBe(xpOnce); // bonus not repeated
  });

  it('regenerates missions on a new day', async () => {
    stored.missionsDay = '2000-01-01';
    stored.missions = [{ key: 'old', type: 'any_lesson', xp: 10, label: 'old' }];
    await service.getToday(userId);
    expect(profiles.saveMissions).toHaveBeenCalled();
    expect(stored.missionsDay).toBe(todayKey());
    expect(stored.missions.some((m: any) => m.key === 'old')).toBe(false);
  });
});
