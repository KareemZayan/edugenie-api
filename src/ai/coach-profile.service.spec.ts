import { Types } from 'mongoose';
import {
  CoachProfileService,
  weekKey,
  weekStartUtc,
} from './coach-profile.service';

function dayKey(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe('CoachProfileService', () => {
  let model: any;
  let service: CoachProfileService;

  beforeEach(() => {
    model = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    service = new CoachProfileService(model);
  });

  const findOneReturns = (value: unknown) =>
    model.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(value) }),
    });

  describe('recordActivity — streak', () => {
    it('increments when the last active day was yesterday', async () => {
      const userId = new Types.ObjectId().toString();
      findOneReturns({ lastActiveDay: dayKey(-1), streakCurrent: 4, streakLongest: 6 });
      await service.recordActivity(userId);
      const [, update] = model.updateOne.mock.calls[0];
      expect(update.$set.streakCurrent).toBe(5);
      expect(update.$set.lastActiveDay).toBe(dayKey(0));
      expect(update.$set.streakLongest).toBe(6);
    });

    it('resets to 1 after a gap', async () => {
      const userId = new Types.ObjectId().toString();
      findOneReturns({ lastActiveDay: dayKey(-3), streakCurrent: 9, streakLongest: 9 });
      await service.recordActivity(userId);
      const [, update] = model.updateOne.mock.calls[0];
      expect(update.$set.streakCurrent).toBe(1);
      expect(update.$set.streakLongest).toBe(9);
    });

    it('is a no-op when already active today', async () => {
      const userId = new Types.ObjectId().toString();
      findOneReturns({ lastActiveDay: dayKey(0), streakCurrent: 2, streakLongest: 2 });
      await service.recordActivity(userId);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('starts a streak from nothing', async () => {
      const userId = new Types.ObjectId().toString();
      findOneReturns(null);
      await service.recordActivity(userId);
      const [, update] = model.updateOne.mock.calls[0];
      expect(update.$set.streakCurrent).toBe(1);
      expect(update.$set.streakLongest).toBe(1);
    });
  });

  describe('effectiveStreak', () => {
    it('keeps the streak live when active today or yesterday', () => {
      expect(service.effectiveStreak({ lastActiveDay: dayKey(0), streakCurrent: 3 })).toBe(3);
      expect(service.effectiveStreak({ lastActiveDay: dayKey(-1), streakCurrent: 3 })).toBe(3);
    });

    it('reads 0 when the streak is broken (older than yesterday)', () => {
      expect(service.effectiveStreak({ lastActiveDay: dayKey(-2), streakCurrent: 8 })).toBe(0);
      expect(service.effectiveStreak(null)).toBe(0);
    });
  });

  describe('setGoal — clamp 1..20', () => {
    it('clamps and rounds', async () => {
      const userId = new Types.ObjectId().toString();
      await service.setGoal(userId, 99);
      expect(model.updateOne.mock.calls[0][1].$set.weeklyGoalLessons).toBe(20);
      await service.setGoal(userId, 0);
      expect(model.updateOne.mock.calls[1][1].$set.weeklyGoalLessons).toBe(1);
      await service.setGoal(userId, 3.6);
      expect(model.updateOne.mock.calls[2][1].$set.weeklyGoalLessons).toBe(4);
    });
  });

  describe('week helpers', () => {
    it('weekStartUtc is a Monday at 00:00 UTC', () => {
      const d = weekStartUtc(new Date('2026-07-08T15:00:00Z')); // a Wednesday
      expect(d.getUTCDay()).toBe(1);
      expect(d.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    });
    it('weekKey is the Monday day-string', () => {
      expect(weekKey(new Date('2026-07-08T15:00:00Z'))).toBe('2026-07-06');
    });
  });
});
