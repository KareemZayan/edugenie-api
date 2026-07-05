import { ConfigService } from '@nestjs/config';
import { PaypalPayoutProvider } from './paypal-payout.provider';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('PaypalPayoutProvider', () => {
  const OLD_FETCH = global.fetch;
  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('is unconfigured (and does not call the API) without client id/secret', async () => {
    const provider = new PaypalPayoutProvider(configWith({}));
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    expect(provider.isConfigured).toBe(false);
    await expect(
      provider.createPayout({
        requestId: 'req1',
        email: 'a@b.com',
        amount: 100,
        currency: 'EGP',
      }),
    ).resolves.toEqual({ status: 'unconfigured' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('creates a payout with an idempotent sender_batch_id and returns the batch id', async () => {
    const provider = new PaypalPayoutProvider(
      configWith({
        PAYPAL_CLIENT_ID: 'id',
        PAYPAL_CLIENT_SECRET: 'secret',
        PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
      }),
    );

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/v1/oauth2/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ batch_header: { payout_batch_id: 'BATCH123' } }),
      } as Response;
    }) as unknown as typeof fetch;

    const result = await provider.createPayout({
      requestId: 'req-42',
      email: 'instructor@example.com',
      amount: 150.5,
      currency: 'EGP',
    });

    expect(result).toEqual({ status: 'processing', reference: 'BATCH123' });
    const payoutCall = calls.find((c) => c.url.endsWith('/v1/payments/payouts'));
    expect(payoutCall).toBeDefined();
    const body = JSON.parse(payoutCall!.init!.body as string);
    // requestId drives both idempotency ids so a re-approval can't double-pay.
    expect(body.sender_batch_header.sender_batch_id).toBe('req-42');
    expect(body.items[0].sender_item_id).toBe('req-42');
    expect(body.items[0].receiver).toBe('instructor@example.com');
    expect(body.items[0].amount).toEqual({ value: '150.50', currency: 'EGP' });
  });

  it('throws when PayPal rejects the payout create call', async () => {
    const provider = new PaypalPayoutProvider(
      configWith({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret' }),
    );
    global.fetch = (async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        } as Response;
      }
      return {
        ok: false,
        status: 422,
        text: async () => 'UNPROCESSABLE',
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      provider.createPayout({
        requestId: 'r',
        email: 'a@b.com',
        amount: 10,
        currency: 'EGP',
      }),
    ).rejects.toThrow(/PayPal payout failed \(422\)/);
  });
});
