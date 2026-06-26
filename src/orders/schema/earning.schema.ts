import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

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

  @Prop({ required: true, default: 'PENDING' })
  status: string;
}

export const EarningSchema = SchemaFactory.createForClass(Earning);
