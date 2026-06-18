import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaymobService {
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

  async createPaymentUrl(amountCents: number, orderId: string, billingData: any): Promise<string> {
    try {
      const intentionPayload = {
        amount: amountCents,
        currency: 'EGP',
        payment_methods: [Number(this.integrationId)],
        billing_data: billingData,
        special_reference: orderId, // We map our internal order ID here
      };

      const response = await firstValueFrom(
        this.httpService.post(this.intentionApiUrl, intentionPayload, {
          headers: {
            'Authorization': `Token ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
      );

      // The new API returns a client_secret for the Pixel SDK
      // We return this secret, and the frontend will use it.
      return response.data.client_secret;
    } catch (error: any) {
      console.error('Paymob Intention API Error:', error?.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initialize payment intention');
    }
  }
}
