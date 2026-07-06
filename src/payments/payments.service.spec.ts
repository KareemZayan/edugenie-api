import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { CourseStatus } from '../common/enums/course-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';

// Chainable mongoose-query mock resolving to `value`.
const query = (value: unknown) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(value) }) }),
  exec: () => Promise.resolve(value),
});

describe('PaymentsService', () => {
  let stripe: any;
  let config: any;
  let userModel: any;
  let courseModel: any;
  let payoutRequestModel: any;
  let service: PaymentsService;

  const build = () => {
    stripe = { isConfigured: true, retrieveAccount: jest.fn() };
    config = { get: jest.fn().mockReturnValue('http://localhost:4200') };
    userModel = { findById: jest.fn() };
    courseModel = { findById: jest.fn() };
    payoutRequestModel = { findById: jest.fn() };
    service = new PaymentsService(
      stripe,
      config,
      { create: jest.fn() } as any,
      userModel,
      courseModel,
      {} as any,
      {} as any,
      {} as any,
      payoutRequestModel,
      { findOne: () => query(null) } as any,
      { create: jest.fn() } as any,
      { findOne: () => query(null) } as any,
    );
  };

  beforeEach(build);

  describe('checkout', () => {
    it('503s when Stripe is not configured', async () => {
      stripe.isConfigured = false;
      await expect(
        service.checkout('u1', new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('blocks an instructor from buying their own course', async () => {
      const instructorId = new Types.ObjectId();
      courseModel.findById.mockReturnValue(
        query({
          _id: new Types.ObjectId(),
          title: 'C',
          price: 10,
          instructorId,
          courseStatus: CourseStatus.PUBLISHED,
        }),
      );
      await expect(
        service.checkout(instructorId.toString(), new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('finalizePayoutStatus', () => {
    it('returns Not found when the request is missing', async () => {
      payoutRequestModel.findById.mockReturnValue({
        exec: () => Promise.resolve(null),
      });
      const res = await service.finalizePayoutStatus('x');
      expect(res.status).toBe(PayoutRequestStatus.FAILED);
      expect(res.detail).toBe('Not found');
    });

    it('is a no-op for a request that is not PROCESSING', async () => {
      payoutRequestModel.findById.mockReturnValue({
        exec: () =>
          Promise.resolve({ status: PayoutRequestStatus.PENDING }),
      });
      const res = await service.finalizePayoutStatus('x');
      expect(res.status).toBe(PayoutRequestStatus.PENDING);
      expect(res.detail).toBe('Not in progress');
    });
  });
});
