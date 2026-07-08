import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EarningStatus } from '../../common/enums/earning-status.enum';

export type EarningDocument = HydratedDocument<Earning>;

@Schema({ timestamps: true })
export class Earning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  instructorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  sectionId: Types.ObjectId | null;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: EarningStatus, default: EarningStatus.PENDING })
  status: EarningStatus;

  // Set when this earning is reconciled as PAID_OUT from a Stripe `payout.paid`
  // webhook. `stripePayoutId` is the Stripe Payout id (also used for idempotency
  // so a re-delivered event doesn't double-mark earnings).
  @Prop({ type: String, default: null, index: true })
  stripePayoutId?: string | null;

  @Prop({ type: Date, default: null })
  paidOutAt?: Date | null;
}

export const EarningSchema = SchemaFactory.createForClass(Earning);
