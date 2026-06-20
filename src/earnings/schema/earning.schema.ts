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

  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, enum: EarningStatus, default: EarningStatus.PENDING })
  status: EarningStatus;
}

export const EarningSchema = SchemaFactory.createForClass(Earning);
