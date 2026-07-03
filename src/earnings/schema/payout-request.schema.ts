import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PayoutRequestStatus } from '../../common/enums/payout-request-status.enum';

export type PayoutRequestDocument = HydratedDocument<PayoutRequest>;

/**
 * An instructor's request to be paid out. Created when the instructor asks for a
 * payout; a superadmin then APPROVES (→ the covered earnings become PAID_OUT) or
 * REJECTS (→ the covered earnings revert to PENDING). `amount`/`earningsCount`
 * are a snapshot taken at request time.
 */
@Schema({ timestamps: true })
export class PayoutRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  instructorId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, min: 0 })
  earningsCount: number;

  @Prop({
    type: String,
    enum: PayoutRequestStatus,
    default: PayoutRequestStatus.PENDING,
    index: true,
  })
  status: PayoutRequestStatus;

  // Set at approval time (bank_transfer | paypal) + external reference.
  @Prop({ type: String, default: null })
  method: string | null;

  @Prop({ type: String, default: null })
  reference: string | null;

  // Rejection reason / free note.
  @Prop({ type: String, default: null })
  note: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  processedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  processedAt: Date | null;
}

export const PayoutRequestSchema = SchemaFactory.createForClass(PayoutRequest);
