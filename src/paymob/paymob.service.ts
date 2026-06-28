import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
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
export class PaymobService implements OnModuleInit {
  private readonly logger = new Logger(PaymobService.name);
  private readonly intentionApiUrl = 'https://accept.paymob.com/v1/intention/';
  private readonly secretKey: string;
  private readonly integrationId: string;
  /** All payment-method integration ids offered at checkout (card, wallet, …). */
  private readonly paymentMethodIds: number[];
  public readonly hmacSecret: string;
  /** Student-web base URL — where Paymob returns the browser after payment. */
  private readonly studentAppUrl: string;
  /** Optional server-to-server webhook URL (else configured in the dashboard). */
  private readonly webhookUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const secretKey = this.configService.get<string>('PAYMOB_SECRET_KEY') || '';
    const hmacSecret =
      this.configService.get<string>('PAYMOB_HMAC_SECRET') || '';
    const integrationId =
      this.configService.get<string>('PAYMOB_INTEGRATION_ID') || '';

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
    // PAYMOB_INTEGRATION_ID may be a single id or a comma-separated list, so you
    // can offer several methods (e.g. "5734317,1234567" = card + mobile wallet).
    // Each id is a separate integration created in the Paymob dashboard.
    this.paymentMethodIds = this.integrationId
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    this.studentAppUrl = (
      this.configService.get<string>('STUDENT_APP_URL') ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.webhookUrl =
      this.configService.get<string>('PAYMOB_WEBHOOK_URL') || '';
  }

  /**
   * Fix 2 — surface the real Paymob configuration at boot. KEEP these logs; they
   * are how you tell, in Railway/Vercel logs, whether the deployment is running
   * with REAL keys or silently falling back to dummies (the latter makes every
   * Paymob call fail with a 401 that looks like a generic 500). No secret values
   * are printed — only presence booleans and the non-secret integration id.
   */
  onModuleInit(): void {
    const required = [
      'PAYMOB_SECRET_KEY',
      'PAYMOB_INTEGRATION_ID',
      'PAYMOB_HMAC_SECRET',
    ];
    const missing = required.filter(
      (key) => !this.configService.get<string>(key),
    );

    if (missing.length > 0) {
      // In production the constructor already throws on missing keys; outside
      // production we only warn so local dev/tests keep booting on the dummies.
      this.logger.warn(
        `Paymob env vars missing (dummy fallbacks in use): ${missing.join(', ')}`,
      );
    }

    const usingRealSecret = this.secretKey !== 'dummy_secret_key';
    const usingRealHmac = this.hmacSecret !== 'dummy_hmac_secret';
    this.logger.log(
      `Paymob initialized — paymentMethods=[${this.paymentMethodIds.join(', ')}], ` +
        `realSecretKey=${usingRealSecret}, realHmacSecret=${usingRealHmac}`,
    );
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
        payment_methods: this.paymentMethodIds,
        billing_data: billingData ?? this.fallbackBillingData(),
        special_reference: orderId,
        // Where Paymob's hosted checkout sends the customer's browser after the
        // payment attempt. Paymob appends its own result params (?success=...),
        // and our success page reads orderId + success from the query string.
        redirection_url: `${this.studentAppUrl}/checkout/success?orderId=${orderId}`,
        // Optional per-intention server callback; otherwise the "Transaction
        // processed callback" set in the Paymob dashboard is used.
        ...(this.webhookUrl ? { notification_url: this.webhookUrl } : {}),
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
      // Fix 1 — log the REAL Paymob error so a 400/401 from the gateway is
      // visible instead of a bare 500. KEEP these logs (ongoing debugging).
      // The Authorization header is redacted — the secret key is never logged.
      const safeHeaders = { ...(error?.config?.headers ?? {}) };
      if (safeHeaders.Authorization)
        safeHeaders.Authorization = 'Token <redacted>';

      this.logger.error('=== PAYMOB ERROR ===');
      this.logger.error(
        `Status: ${error?.response?.status ?? 'n/a'} ${error?.response?.statusText ?? ''}`.trim(),
      );
      this.logger.error(
        `Response Data: ${JSON.stringify(error?.response?.data ?? error?.message, null, 2)}`,
      );
      this.logger.error(
        `Request URL: ${error?.config?.url ?? this.intentionApiUrl}`,
      );
      this.logger.error(`Request Body: ${error?.config?.data ?? 'n/a'}`);
      this.logger.error(`Request Headers: ${JSON.stringify(safeHeaders)}`);
      this.logger.error('====================');

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
      this.logger.warn(
        'Webhook HMAC bypassed via WEBHOOK_BYPASS_HMAC (non-prod)',
      );
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
