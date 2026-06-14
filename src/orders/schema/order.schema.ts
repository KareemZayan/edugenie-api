import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  // We embed the specific courseId and the price they paid
  @Prop([{
    courseId: { type: Types.ObjectId, ref: 'Course', required: true },
    price: { type: Number, required: true }
  }])
  items: { courseId: Types.ObjectId; price: number }[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  // In the next step, Stripe will update this to 'COMPLETED'
  @Prop({ type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' })
  status: string;

  @Prop({ type: String }) // This will hold the Stripe Session ID later
  stripeSessionId?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);