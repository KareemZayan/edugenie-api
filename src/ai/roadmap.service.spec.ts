import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RoadmapService } from './roadmap.service';

// Chainable mongoose-query mock resolving to `value`.
const q = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value), exec: () => Promise.resolve(value) }),
  lean: () => Promise.resolve(value),
  exec: () => Promise.resolve(value),
});

const currentMonth = new Date().toISOString().slice(0, 7);

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

  describe('remaining (3 per calendar month)', () => {
    it('returns full quota when the stored month is stale', async () => {
      userModel.findById.mockReturnValue(
        q({ roadmapGenerationsUsed: 3, roadmapQuotaMonth: '2000-01' }),
      );
      expect(await service.remaining('u1')).toBe(3);
    });

    it('subtracts this month usage', async () => {
      userModel.findById.mockReturnValue(
        q({ roadmapGenerationsUsed: 2, roadmapQuotaMonth: currentMonth }),
      );
      expect(await service.remaining('u1')).toBe(1);
    });

    it('is 0 when this month is exhausted', async () => {
      userModel.findById.mockReturnValue(
        q({ roadmapGenerationsUsed: 3, roadmapQuotaMonth: currentMonth }),
      );
      expect(await service.remaining('u1')).toBe(0);
    });
  });

  describe('build', () => {
    it('blocks when the month quota is used up', async () => {
      userModel.findById.mockReturnValue(
        q({ roadmapGenerationsUsed: 3, roadmapQuotaMonth: currentMonth }),
      );
      await expect(
        service.build('u1', { goal: 'x' } as any),
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
