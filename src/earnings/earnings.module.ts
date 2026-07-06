import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Earning, EarningSchema } from './schema/earning.schema';
import {
  PayoutRequest,
  PayoutRequestSchema,
} from './schema/payout-request.schema';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import {
  PlatformConfig,
  PlatformConfigSchema,
} from '../superadmin/schema/platform-config.schema';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    PaymentsModule,
    MongooseModule.forFeature([
      { name: Earning.name, schema: EarningSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: Course.name, schema: CourseSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
    ]),
  ],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [MongooseModule],
})
export class EarningsModule {}
