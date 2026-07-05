import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Result of attempting a payout through PayPal. */
export type PaypalPayoutResult =
  | { status: 'processing'; reference: string }
  | { status: 'unconfigured' };

/**
 * Thin wrapper over the PayPal Payouts REST API. Uses native `fetch` (Node 18+),
 * mirroring GeminiTranscriptionProvider — no HttpModule wiring needed.
 *
 * PayPal payouts are ASYNC: creating a payout returns a `payout_batch_id`
 * immediately with the batch PENDING; final delivery (or denial) arrives later
 * via a webhook. So a successful create maps to `status: 'processing'`.
 *
 * Degrades gracefully: when the client id/secret are unset, `isConfigured` is
 * false and callers fall back to the manual payout path instead of throwing.
 */
@Injectable()
export class PaypalPayoutProvider {
  private readonly logger = new Logger(PaypalPayoutProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiBase: string;
  private readonly webhookId: string;

  // Cached OAuth token (client-credentials). Refreshed a minute before expiry.
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
    this.apiBase = (
      this.configService.get<string>('PAYPAL_API_BASE') ||
      'https://api-m.sandbox.paypal.com'
    ).replace(/\/+$/, '');
    this.webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID') || '';
  }

  get isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.value;
    }
    const basic = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');
    const res = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`PayPal OAuth failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cachedToken = {
      value: json.access_token,
      // Refresh 60s early to avoid using a token that expires mid-request.
      expiresAt: now + (json.expires_in - 60) * 1000,
    };
    return json.access_token;
  }

  /**
   * Create a single-item payout. `requestId` is used as the idempotent
   * `sender_batch_id` so a re-approval never double-pays. Returns the batch id;
   * the payout is PENDING at PayPal until its webhook confirms.
   */
  async createPayout(params: {
    requestId: string;
    email: string;
    amount: number;
    currency: string;
    note?: string;
  }): Promise<PaypalPayoutResult> {
    if (!this.isConfigured) return { status: 'unconfigured' };

    const token = await this.getAccessToken();
    const body = {
      sender_batch_header: {
        sender_batch_id: params.requestId,
        email_subject: 'You have a payout from EduGenie',
        email_message: 'Your instructor earnings payout has been sent.',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: params.amount.toFixed(2),
            currency: params.currency,
          },
          receiver: params.email,
          note: params.note || 'EduGenie instructor payout',
          sender_item_id: params.requestId,
        },
      ],
    };

    const res = await fetch(`${this.apiBase}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      throw new Error(`PayPal payout failed (${res.status}): ${raw.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      batch_header?: { payout_batch_id?: string };
    };
    const reference = json?.batch_header?.payout_batch_id;
    if (!reference) {
      throw new Error('PayPal payout response missing payout_batch_id');
    }
    return { status: 'processing', reference };
  }

  /**
   * Verify a PayPal webhook signature server-side. Returns false (reject) when
   * the webhook id is unset — an unverifiable notification is not trusted.
   */
  async verifyWebhookSignature(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): Promise<boolean> {
    if (!this.isConfigured || !this.webhookId) return false;
    try {
      const token = await this.getAccessToken();
      const res = await fetch(
        `${this.apiBase}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: this.webhookId,
            webhook_event: JSON.parse(rawBody),
          }),
        },
      );
      if (!res.ok) return false;
      const json = (await res.json()) as { verification_status?: string };
      return json?.verification_status === 'SUCCESS';
    } catch (err) {
      this.logger.warn(
        `PayPal webhook verification error: ${(err as Error)?.message}`,
      );
      return false;
    }
  }
}
