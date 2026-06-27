import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/** Billing data Paymob requires on the intention (all fields are mandatory). */
export interface PaymobBillingData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  apartment: string;
  floor: string;
  street: string;
  building: string;
  shipping_method: string;
  postal_code: string;
  city: string;
  country: string;
  state: string;
}

@Injectable()
export class PaymobService {
  private readonly logger = new Logger(PaymobService.name);
  private readonly intentionApiUrl = 'https://accept.paymob.com/v1/intention/';
  private readonly secretKey: string;
  private readonly integrationId: string;
  public readonly hmacSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const secretKey = this.configService.get<string>('PAYMOB_SECRET_KEY') || '';
    const hmacSecret = this.configService.get<string>('PAYMOB_HMAC_SECRET') || '';
    const integrationId = this.configService.get<string>('PAYMOB_INTEGRATION_ID') || '';

    // Fail fast in production rather than silently running with dummy keys that
    // make every charge and every signature check wrong.
    if (isProd && (!secretKey || !hmacSecret || !integrationId)) {
      throw new Error(
        'Paymob is not configured: PAYMOB_SECRET_KEY, PAYMOB_HMAC_SECRET and ' +
          'PAYMOB_INTEGRATION_ID are required in production.',
      );
    }

    // Non-production fallbacks keep local dev / tests booting without real keys.
    this.secretKey = secretKey || 'dummy_secret_key';
    this.hmacSecret = hmacSecret || 'dummy_hmac_secret';
    this.integrationId = integrationId || '4856475';
  }

  /**
   * Create a Paymob payment intention.
   *
   * @param amountCents  The charge amount in the smallest currency unit (PIASTRES).
   *                     A 199 EGP course MUST be passed as 19900, not 199.
   * @param orderId      Our order id — sent as `special_reference` and returned
   *                     by Paymob as `obj.order.merchant_order_id` in the webhook.
   */
  async createPaymentUrl(
    amountCents: number,
    orderId: string,
    billingData?: PaymobBillingData,
  ): Promise<{ clientSecret: string; paymobOrderId?: string }> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new InternalServerErrorException(
        `Invalid payment amount (cents): ${amountCents}`,
      );
    }

    try {
      const intentionPayload = {
        amount: amountCents,
        currency: 'EGP',
        payment_methods: [Number(this.integrationId)],
        billing_data: billingData ?? this.fallbackBillingData(),
        special_reference: orderId,
      };

      const response = await firstValueFrom(
        this.httpService.post(this.intentionApiUrl, intentionPayload, {
          headers: {
            Authorization: `Token ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return {
        clientSecret: response.data.client_secret,
        // The intention id — store it for reconciliation/refunds with Paymob.
        paymobOrderId: response.data.id ? String(response.data.id) : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `Paymob Intention API error: ${JSON.stringify(
          error?.response?.data ?? error.message,
        )}`,
      );
      throw new InternalServerErrorException(
        'Failed to initialize payment intention',
      );
    }
  }

  /**
   * Verify a Paymob transaction webhook signature.
   *
   * Paymob does NOT sign the JSON body — it computes HMAC-SHA512 over a fixed,
   * ordered concatenation of selected transaction (`obj`) fields. We rebuild that
   * exact string and compare in constant time.
   * Docs: Paymob "Transaction Processed Callback" HMAC calculation.
   */
  verifyWebhookHmac(payload: any, signature: string): boolean {
    // Local-only escape hatch for manual testing — never honoured in production.
    if (
      this.configService.get<string>('WEBHOOK_BYPASS_HMAC') === 'true' &&
      this.configService.get<string>('NODE_ENV') !== 'production'
    ) {
      this.logger.warn('Webhook HMAC bypassed via WEBHOOK_BYPASS_HMAC (non-prod)');
      return true;
    }

    if (!signature) return false;

    const obj = payload?.obj ?? payload;
    if (!obj || typeof obj !== 'object') return false;

    // The exact field order Paymob concatenates. Do not reorder.
    const ordered = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      obj.order?.id,
      obj.owner,
      obj.pending,
      obj.source_data?.pan,
      obj.source_data?.sub_type,
      obj.source_data?.type,
      obj.success,
    ];

    const concatenated = ordered
      .map((v) => (v === undefined || v === null ? '' : String(v)))
      .join('');

    const computed = crypto
      .createHmac('sha512', this.hmacSecret)
      .update(concatenated)
      .digest('hex');

    // Constant-time comparison; guards against length/format mismatches.
    try {
      const a = Buffer.from(computed, 'hex');
      const b = Buffer.from(signature, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private fallbackBillingData(): PaymobBillingData {
    return {
      first_name: 'EduGenie',
      last_name: 'Student',
      email: 'no-reply@edugenie.app',
      phone_number: '+201000000000',
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'NA',
      country: 'NA',
      state: 'NA',
    };
  }
}
