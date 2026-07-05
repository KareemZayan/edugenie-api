import { BadRequestException, ConflictException } from '@nestjs/common';
import { EarningsService } from './earnings.service';

// A thenable query stub: supports .select().lean().exec() and resolves to `value`.
function query(value: any) {
  const q: any = {
    select: () => q,
    lean: () => q,
    exec: () => Promise.resolve(value),
  };
  return q;
}

const UID = '507f1f77bcf86cd799439011';

describe('EarningsService — PayPal payout method', () => {
  let earningModel: any;
  let payoutRequestModel: any;
  let courseModel: any;
  let platformConfigModel: any;
  let userModel: any;
  let service: EarningsService;

  beforeEach(() => {
    earningModel = {};
    payoutRequestModel = { findOne: jest.fn() };
    courseModel = {};
    platformConfigModel = { findOne: jest.fn(() => query(null)) };
    userModel = { findById: jest.fn(), updateOne: jest.fn(() => query({})) };
    service = new EarningsService(
      earningModel,
      payoutRequestModel,
      courseModel,
      platformConfigModel,
      userModel,
    );
  });

  it('saves and masks the PayPal email', async () => {
    const result = await service.setPayoutMethod(UID, 'Jane@Example.com');
    expect(userModel.updateOne).toHaveBeenCalled();
    const [, update] = userModel.updateOne.mock.calls[0];
    expect(update.$set.payoutPaypal.email).toBe('jane@example.com');
    expect(result.paypalEmail).toBe('j***@example.com');
  });

  it('returns the masked email on get', async () => {
    userModel.findById.mockReturnValue(
      query({ payoutPaypal: { email: 'bob@site.io', updatedAt: new Date() } }),
    );
    const result = await service.getPayoutMethod(UID);
    expect(result.paypalEmail).toBe('b***@site.io');
  });

  it('blocks clearing while a payout is in progress', async () => {
    payoutRequestModel.findOne.mockReturnValue(query({ _id: 'open' }));
    await expect(service.clearPayoutMethod(UID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a payout request when no PayPal email is saved', async () => {
    userModel.findById.mockReturnValue(query({ payoutPaypal: null }));
    await expect(service.requestPayout(UID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
