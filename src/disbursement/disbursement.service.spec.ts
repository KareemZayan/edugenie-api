import { DisbursementService } from './disbursement.service';
import { PaypalPayoutProvider } from './paypal-payout.provider';

describe('DisbursementService', () => {
  function make(
    paypal: Partial<PaypalPayoutProvider>,
    config: Record<string, any> = {},
  ) {
    const configService = { get: (k: string) => config[k] } as any;
    const payoutRequestModel = { findById: jest.fn() } as any;
    const earningModel = { updateMany: jest.fn(), db: {} } as any;
    const notificationModel = { create: jest.fn() } as any;
    const service = new DisbursementService(
      paypal as PaypalPayoutProvider,
      configService,
      payoutRequestModel,
      earningModel,
      notificationModel,
    );
    return { service, payoutRequestModel };
  }

  it('reports unconfigured when the provider is not configured', async () => {
    const { service } = make({ isConfigured: false });
    expect(service.isConfigured).toBe(false);
    const result = await service.disburse({
      _id: 'req1',
      amount: 100,
      destination: { type: 'paypal', paypalEmail: 'a@b.com' },
    });
    expect(result).toEqual({ status: 'unconfigured' });
  });

  it('converts EGP to the configured payout currency via the FX rate', async () => {
    const createPayout = jest
      .fn()
      .mockResolvedValue({ status: 'processing', reference: 'B1' });
    const { service } = make(
      { isConfigured: true, createPayout },
      { PAYOUT_CURRENCY: 'USD', PAYOUT_FX_RATE: 0.02 },
    );

    const result = await service.disburse({
      _id: 'req9',
      amount: 250,
      destination: { type: 'paypal', paypalEmail: 'x@y.com' },
    });

    expect(result).toEqual({ status: 'processing', reference: 'B1' });
    expect(createPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req9',
        email: 'x@y.com',
        amount: 5, // 250 EGP * 0.02
        currency: 'USD',
      }),
    );
  });

  it('throws when a configured payout has no destination email', async () => {
    const { service } = make({ isConfigured: true, createPayout: jest.fn() });
    await expect(
      service.disburse({ _id: 'r', amount: 10, destination: null }),
    ).rejects.toThrow(/no PayPal destination/);
  });

  it('ignores a webhook whose requestId cannot be resolved', async () => {
    const { service, payoutRequestModel } = make({ isConfigured: true });
    await service.applyWebhookEvent({
      event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      resource: {},
    });
    expect(payoutRequestModel.findById).not.toHaveBeenCalled();
  });
});
