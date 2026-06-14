import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  studentId: Types.ObjectId;

  // An array of ObjectIds referencing the Course model
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Course' }], default: [] })
  items: Types.ObjectId[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);