import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EarningStatus } from '../../common/enums/earning-status.enum';

export type EarningDocument = HydratedDocument<Earning>;

/**
 * Canonical Earning schema for the whole application.
 *
 * NOTE: this is the single source of truth — do not redefine an `Earning`
 * model anywhere else. Mongoose compiles one model per name, so a second
 * divergent definition under the same name causes nondeterministic behaviour.
 */
@Schema({ timestamps: true })
export class Earning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  instructorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Section', default: null })
  sectionId: Types.ObjectId | null;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    type: String,
    enum: EarningStatus,
    default: EarningStatus.PENDING,
    index: true,
  })
  status: EarningStatus;
}

export const EarningSchema = SchemaFactory.createForClass(Earning);

// Speeds up the per-instructor / per-status payout aggregations.
EarningSchema.index({ instructorId: 1, status: 1 });
