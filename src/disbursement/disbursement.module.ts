import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DisbursementController } from './disbursement.controller';
import { DisbursementService } from './disbursement.service';
import { PaypalPayoutProvider } from './paypal-payout.provider';
import {
  PayoutRequest,
  PayoutRequestSchema,
} from '../earnings/schema/payout-request.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schema/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [DisbursementController],
  providers: [DisbursementService, PaypalPayoutProvider],
  exports: [DisbursementService],
})
export class DisbursementModule {}
