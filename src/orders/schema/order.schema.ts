import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  // We embed the specific courseId and the price they paid
  @Prop([{
    itemType: { type: String, enum: ['course', 'section'], required: true, default: 'course' },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true },
    sectionId: { type: Types.ObjectId, default: null },
    instructorId: { type: Types.ObjectId, ref: 'User', required: true },
    price: { type: Number, required: true }
  }])
  items: { itemType: string; courseId: Types.ObjectId; sectionId: Types.ObjectId | null; instructorId: Types.ObjectId; price: number }[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  // In the next step, Stripe will update this to 'COMPLETED'
  @Prop({ type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' })
  status: string;

  @Prop({ type: String }) // This will hold the Stripe Session ID later
  stripeSessionId?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);