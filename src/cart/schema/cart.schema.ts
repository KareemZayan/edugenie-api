import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  studentId: Types.ObjectId;

  @Prop([{
    itemType: { type: String, enum: ['course', 'section'], required: true, default: 'course' },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true },
    sectionId: { type: Types.ObjectId, default: null },
    price: { type: Number, required: true }
  }])
  items: { itemType: string; courseId: Types.ObjectId; sectionId: Types.ObjectId | null; price: number }[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);