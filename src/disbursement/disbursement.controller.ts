import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DisbursementService } from './disbursement.service';

@Controller('disbursement')
@ApiTags('Disbursement')
export class DisbursementController {
  constructor(private readonly disbursement: DisbursementService) {}

  /**
   * PayPal Payouts webhook. Confirms (or fails) an in-flight payout. Always
   * returns 200 so PayPal doesn't retry after we've recorded the outcome; a
   * bad/unverifiable signature is silently ignored (logged), not retried.
   */
  @SkipThrottle()
  @Post('webhook/paypal')
  @HttpCode(200)
  @ApiOperation({ summary: 'PayPal payouts webhook' })
  @ApiResponse({ status: 200, description: 'Acknowledged.' })
  async paypalWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, any>,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    const verified = await this.disbursement.verifyWebhook(headers, rawBody);
    if (!verified) {
      return { received: true };
    }
    await this.disbursement.applyWebhookEvent(body);
    return { received: true };
  }
}
