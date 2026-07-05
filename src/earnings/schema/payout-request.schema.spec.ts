import { model } from 'mongoose';
import { PayoutRequest, PayoutRequestSchema } from './payout-request.schema';
import { PayoutRequestStatus } from '../../common/enums/payout-request-status.enum';

// Regression: the `destination` subdoc has a field named `type`, which Mongoose
// misreads unless declared via raw(). This asserts a snapshot validates cleanly.
describe('PayoutRequestSchema.destination', () => {
  const PayoutRequestModel = model(
    'PayoutRequestSpec',
    PayoutRequestSchema,
  );

  it('accepts a { type, paypalEmail } destination without a cast error', () => {
    const doc = new PayoutRequestModel({
      instructorId: '507f1f77bcf86cd799439011',
      amount: 100,
      earningsCount: 2,
      status: PayoutRequestStatus.PENDING,
      destination: { type: 'paypal', paypalEmail: 'a@b.com' },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.destination?.type).toBe('paypal');
    expect(doc.destination?.paypalEmail).toBe('a@b.com');
  });
});
