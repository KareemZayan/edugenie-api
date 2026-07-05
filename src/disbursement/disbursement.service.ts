import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PaypalPayoutProvider,
  PaypalPayoutResult,
} from './paypal-payout.provider';
import {
  PayoutRequest,
  PayoutRequestDocument,
} from '../earnings/schema/payout-request.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);
  // PayPal Payouts rejects EGP, so earnings (EGP) are converted to a supported
  // currency: payoutAmount = egpAmount * fxRate. Configure both before live.
  private readonly payoutCurrency: string;
  private readonly fxRate: number;

  constructor(
    private readonly paypal: PaypalPayoutProvider,
    private readonly configService: ConfigService,
    @InjectModel(PayoutRequest.name)
    private payoutRequestModel: Model<PayoutRequest>,
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
  ) {
    this.payoutCurrency =
      this.configService.get<string>('PAYOUT_CURRENCY') || 'USD';
    this.fxRate = Number(this.configService.get('PAYOUT_FX_RATE') ?? 1);
  }

  get isConfigured(): boolean {
    return this.paypal.isConfigured;
  }

  /**
   * Attempt an automated payout for an approved request. Returns:
   *  - `processing` — payout created at the gateway; the webhook will finalize.
   *  - `unconfigured` — no gateway creds; caller falls back to the manual path.
   * Throws if the gateway rejects the create call (caller marks the request
   * FAILED so it can be retried).
   */
  async disburse(request: {
    _id: Types.ObjectId | string;
    amount: number;
    destination?: { type: string; paypalEmail: string } | null;
  }): Promise<PaypalPayoutResult> {
    if (!this.paypal.isConfigured) return { status: 'unconfigured' };

    const email = request.destination?.paypalEmail;
    if (!email) {
      throw new Error('Payout request has no PayPal destination email');
    }

    // Convert the EGP earning amount into the PayPal-supported payout currency.
    const payoutAmount = Math.round(request.amount * this.fxRate * 100) / 100;

    return this.paypal.createPayout({
      requestId: request._id.toString(),
      email,
      amount: payoutAmount,
      currency: this.payoutCurrency,
      note: 'EduGenie instructor payout',
    });
  }

  /** Verify a raw PayPal webhook body + headers. */
  verifyWebhook(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): Promise<boolean> {
    return this.paypal.verifyWebhookSignature(headers, rawBody);
  }

  /**
   * Apply a verified PayPal payout webhook to the matching request. Idempotent:
   * a request already in a terminal state (APPROVED/REJECTED) is left untouched.
   * SUCCEEDED → earnings PAID_OUT + request APPROVED. Denied/failed/returned →
   * request FAILED, earnings stay REQUESTED (retryable), instructor notified.
   */
  async applyWebhookEvent(event: {
    event_type?: string;
    resource?: Record<string, any>;
  }): Promise<void> {
    const eventType = event.event_type || '';
    const requestId = this.extractRequestId(event.resource);
    if (!requestId || !Types.ObjectId.isValid(requestId)) {
      this.logger.warn(
        `PayPal webhook ${eventType} without a resolvable requestId — ignored`,
      );
      return;
    }

    const request = await this.payoutRequestModel.findById(requestId).exec();
    if (!request) return;
    // Only act on a request we handed to the gateway and haven't finalized.
    if (
      request.status !== PayoutRequestStatus.PROCESSING &&
      request.status !== PayoutRequestStatus.FAILED
    ) {
      return;
    }

    if (eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
      await this.markSucceeded(request);
    } else if (
      eventType === 'PAYMENT.PAYOUTS-ITEM.DENIED' ||
      eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED' ||
      eventType === 'PAYMENT.PAYOUTS-ITEM.RETURNED' ||
      eventType === 'PAYMENT.PAYOUTS-ITEM.BLOCKED'
    ) {
      const reason =
        (event.resource?.errors?.message as string) ||
        eventType.split('.').pop() ||
        'PayPal payout failed';
      await this.markFailed(request, reason);
    }
    // Batch-level events (PAYMENT.PAYOUTSBATCH.*) are informational — the item
    // events above drive the state, so they're intentionally ignored.
  }

  private async markSucceeded(
    request: PayoutRequestDocument,
  ): Promise<void> {
    const session = await this.earningModel.db.startSession();
    session.startTransaction();
    try {
      await this.earningModel.updateMany(
        {
          instructorId: request.instructorId,
          status: EarningStatus.REQUESTED,
        },
        { $set: { status: EarningStatus.PAID_OUT } },
        { session },
      );
      request.status = PayoutRequestStatus.APPROVED;
      request.failureReason = null;
      request.processedAt = new Date();
      await request.save({ session });

      await this.notificationModel.create(
        [
          {
            userId: request.instructorId,
            title: 'Payout Sent',
            message: `Your payout of ${request.amount} EGP was sent to your PayPal account. Reference: ${request.gatewayReference ?? request._id.toString()}`,
            type: 'PAYOUT_PROCESSED',
            isRead: false,
          },
        ],
        { session },
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
    this.logger.log(`Payout ${request._id.toString()} succeeded via PayPal`);
  }

  private async markFailed(
    request: PayoutRequestDocument,
    reason: string,
  ): Promise<void> {
    request.status = PayoutRequestStatus.FAILED;
    request.failureReason = reason;
    await request.save();
    await this.notificationModel.create({
      userId: request.instructorId,
      title: 'Payout Failed',
      message: `Your payout of ${request.amount} EGP could not be completed (${reason}). Our team will retry or contact you.`,
      type: 'PAYOUT_FAILED',
      isRead: false,
    });
    this.logger.warn(
      `Payout ${request._id.toString()} failed via PayPal: ${reason}`,
    );
  }

  /**
   * The requestId we set as sender_batch_id / sender_item_id when creating the
   * payout. PayPal echoes it back in item and batch webhook resources.
   */
  private extractRequestId(
    resource?: Record<string, any>,
  ): string | undefined {
    if (!resource) return undefined;
    return (
      resource.payout_item?.sender_item_id ||
      resource.sender_item_id ||
      resource.batch_header?.sender_batch_header?.sender_batch_id ||
      resource.sender_batch_header?.sender_batch_id
    );
  }
}
