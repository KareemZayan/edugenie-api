import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RoadmapService } from './roadmap.service';

// Chainable mongoose-query mock resolving to `value`.
const q = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value), exec: () => Promise.resolve(value) }),
  lean: () => Promise.resolve(value),
  exec: () => Promise.resolve(value),
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const U = new Types.ObjectId().toString();

describe('RoadmapService', () => {
  let roadmapModel: any;
  let courseModel: any;
  let userModel: any;
  let enrollmentModel: any;
  let service: RoadmapService;

  const build = () => {
    roadmapModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      create: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
    };
    courseModel = { find: jest.fn() };
    userModel = { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) };
    enrollmentModel = { find: jest.fn() };
    service = new RoadmapService(
      roadmapModel,
      courseModel,
      userModel,
      enrollmentModel,
      {} as any, // retrieval
      {} as any, // ai
    );
  };

  beforeEach(build);

  describe('quota — per-roadmap, fixed 30-day window', () => {
    it('full budget + no reset when the user has no active roadmap', async () => {
      roadmapModel.findOne.mockReturnValue(q(null));
      expect(await service.quota(U)).toEqual({
        remaining: 3,
        resetsAt: null,
        max: 3,
      });
    });

    it('subtracts attempts used inside an open window and reports the reset date', async () => {
      const start = daysAgo(10);
      roadmapModel.findOne.mockReturnValue(
        q({ aiWindowStart: start, aiAttemptsUsed: 2 }),
      );
      const res = await service.quota(U);
      expect(res.remaining).toBe(1);
      // resets 30 days after the window start
      expect(new Date(res.resetsAt!).getTime()).toBe(start.getTime() + 30 * DAY);
    });

    it('is 0 when the window is exhausted', async () => {
      roadmapModel.findOne.mockReturnValue(
        q({ aiWindowStart: daysAgo(5), aiAttemptsUsed: 3 }),
      );
      expect((await service.quota(U)).remaining).toBe(0);
    });

    it('refills the whole budget once the 30-day window has elapsed', async () => {
      roadmapModel.findOne.mockReturnValue(
        q({ aiWindowStart: daysAgo(31), aiAttemptsUsed: 3 }),
      );
      const res = await service.quota(U);
      expect(res.remaining).toBe(3);
      expect(res.resetsAt).toBeNull();
    });
  });

  describe('build — enforces the active roadmap window', () => {
    it('blocks AI generation when the window is exhausted', async () => {
      // normalizeActive: one active draft (no prune)
      roadmapModel.find.mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve([{ _id: new Types.ObjectId(), status: 'active' }]) }),
      });
      // archiveActiveIfOwned (no items → early return) AND activeWindow (exhausted)
      roadmapModel.findOne.mockReturnValue(
        q({ items: [], aiWindowStart: daysAgo(3), aiAttemptsUsed: 3 }),
      );
      await expect(
        service.build(U, { goal: 'x' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update — re-validates + re-prices against the catalog', () => {
    it('drops bogus ids and snapshots DB price (ignores client price)', async () => {
      const userId = new Types.ObjectId().toString();
      const courseId = new Types.ObjectId().toString();
      const bogusId = new Types.ObjectId().toString();
      const roadmapId = new Types.ObjectId().toString();

      roadmapModel.findOne.mockReturnValue(q({ status: 'active' }));
      courseModel.find.mockReturnValue(
        q([{ _id: new Types.ObjectId(courseId), title: 'Real', price: 42, sections: [] }]),
      );
      let saved: any;
      roadmapModel.findOneAndUpdate.mockImplementation((_f: any, update: any) => {
        saved = update.$set;
        return Promise.resolve({ _id: new Types.ObjectId(roadmapId), ...update.$set });
      });

      await service.update(userId, roadmapId, {
        milestones: [
          {
            title: 'M1',
            items: [
              // client sends a wrong price — must be ignored
              { type: 'course', courseId, price: 9999 } as any,
              // bogus course — must be dropped
              { type: 'course', courseId: bogusId } as any,
            ],
          },
        ],
      } as any);

      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].price).toBe(42);
      expect(saved.totalPrice).toBe(42);
    });
  });

  describe('save (Save & buy later)', () => {
    it('flips an active roadmap to saved', async () => {
      const userId = new Types.ObjectId().toString();
      const id = new Types.ObjectId().toString();
      roadmapModel.findOneAndUpdate.mockImplementation((filter: any, update: any) => {
        expect(filter.status).toBe('active');
        expect(update.$set.status).toBe('saved');
        return Promise.resolve({ _id: new Types.ObjectId(id), status: 'saved' });
      });
      const res = await service.save(userId, id);
      expect(res.status).toBe('saved');
    });

    it('404s when there is no active roadmap to save', async () => {
      const userId = new Types.ObjectId().toString();
      const id = new Types.ObjectId().toString();
      roadmapModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.save(userId, id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getActive — collapses duplicate active drafts', () => {
    it('keeps the newest active, deletes the older orphans', async () => {
      const userId = new Types.ObjectId().toString();
      const newest = {
        _id: new Types.ObjectId(),
        status: 'active',
        goal: 'newest',
        milestones: [],
        items: [],
        totalPrice: 0,
      };
      const older = { _id: new Types.ObjectId(), status: 'active', goal: 'older' };
      roadmapModel.find.mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve([newest, older]) }),
      });
      const res = await service.getActive(userId);
      expect(roadmapModel.deleteMany).toHaveBeenCalledWith({
        _id: { $in: [older._id] },
      });
      expect(res?.goal).toBe('newest');
    });

    it('returns null when there is no active roadmap', async () => {
      const userId = new Types.ObjectId().toString();
      roadmapModel.find.mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve([]) }),
      });
      expect(await service.getActive(userId)).toBeNull();
      expect(roadmapModel.deleteMany).not.toHaveBeenCalled();
    });
  });
});
