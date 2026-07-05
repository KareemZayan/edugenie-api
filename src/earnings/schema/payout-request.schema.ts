import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
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

  // Set at approval time (bank_transfer | paypal) + external reference. For a
  // gateway (PayPal) payout, `reference` also mirrors the gateway batch id.
  @Prop({ type: String, default: null })
  method: string | null;

  @Prop({ type: String, default: null })
  reference: string | null;

  // Snapshot of the instructor's chosen payout destination, taken at request
  // time so a later profile edit can't reroute an in-flight payout. Currently
  // PayPal only.
  // `raw()` is required here because this nested object has a field literally
  // named `type` — without it Mongoose treats `destination` as a String path
  // and rejects the object ("Cast to Object failed at path destination.type").
  @Prop(
    raw({
      type: { type: String }, // 'paypal'
      paypalEmail: { type: String },
    }),
  )
  destination?: { type: string; paypalEmail: string } | null;

  // Automated-disbursement bookkeeping. `gatewayProvider` is the gateway that
  // handled (or is handling) the payout; `gatewayReference` is its batch/txn id;
  // `failureReason` is set when a gateway payout is denied/returned.
  @Prop({ type: String, default: null })
  gatewayProvider: string | null;

  @Prop({ type: String, default: null })
  gatewayReference: string | null;

  @Prop({ type: String, default: null })
  failureReason: string | null;

  // Rejection reason / free note.
  @Prop({ type: String, default: null })
  note: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  processedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  processedAt: Date | null;
}

export const PayoutRequestSchema = SchemaFactory.createForClass(PayoutRequest);
