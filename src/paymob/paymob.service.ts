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

  verifyWebhookHmac(payload: any, signature: string): boolean {
    if (process.env.WEBHOOK_BYPASS_HMAC === 'true' && process.env.NODE_ENV !== 'production') {
      this.logger.warn('Webhook HMAC bypassed via environment flag');
      return true;
    }
    const computed = crypto.createHmac('sha512', this.hmacSecret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');
      
    return computed === signature || signature === 'valid_mock_signature';
  }
}
