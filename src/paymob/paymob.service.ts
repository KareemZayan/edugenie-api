import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

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
    this.secretKey = this.configService.get<string>('PAYMOB_SECRET_KEY') || 'dummy_secret_key';
    this.hmacSecret = this.configService.get<string>('PAYMOB_HMAC_SECRET') || 'dummy_hmac_secret';
    this.integrationId = this.configService.get<string>('PAYMOB_INTEGRATION_ID') || '4856475';
  }

  async createPaymentUrl(amountCents: number, orderId: string, billingData?: any): Promise<{ clientSecret: string, paymentUrl?: string }> {
    try {
      const intentionPayload = {
        amount: amountCents,
        currency: 'EGP',
        payment_methods: [Number(this.integrationId)],
        billing_data: billingData || {
          first_name: "Test",
          last_name: "User",
          email: "test@example.com",
          phone_number: "+201000000000",
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "NA",
          postal_code: "NA",
          city: "NA",
          country: "NA",
          state: "NA"
        },
        special_reference: orderId,
      };

      const response = await firstValueFrom(
        this.httpService.post(this.intentionApiUrl, intentionPayload, {
          headers: {
            'Authorization': `Token ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
      );

      return { clientSecret: response.data.client_secret };
    } catch (error: any) {
      console.error('Paymob Intention API Error:', error?.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initialize payment intention');
    }
  }

  /**
   * Verifies a Paymob transaction-processed callback HMAC.
   *
   * Paymob computes HMAC-SHA512 over a fixed, ordered concatenation of specific
   * fields from the transaction object (`obj`) — NOT over the raw JSON body.
   * See: https://developers.paymob.com/egypt/manage-callback/hmac-calculation
   *
   * There is intentionally NO bypass flag and NO mock-signature shortcut: this
   * function must fail closed so a forged webhook can never grant enrollments.
   */
  verifyWebhookHmac(payload: any, signature: string): boolean {
    if (!signature || !this.hmacSecret || this.hmacSecret === 'dummy_hmac_secret') {
      this.logger.warn('Rejecting webhook: missing signature or HMAC secret');
      return false;
    }

    const obj = payload?.obj;
    if (!obj) {
      this.logger.warn('Rejecting webhook: missing transaction object');
      return false;
    }

    // Order is dictated by Paymob and must not change.
    const fields = [
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

    const concatenated = fields.map((f) => String(f)).join('');
    const computed = crypto
      .createHmac('sha512', this.hmacSecret)
      .update(concatenated)
      .digest('hex');

    try {
      const computedBuf = Buffer.from(computed, 'hex');
      const signatureBuf = Buffer.from(String(signature), 'hex');
      if (computedBuf.length !== signatureBuf.length) return false;
      return crypto.timingSafeEqual(computedBuf, signatureBuf);
    } catch {
      return false;
    }
  }
}
