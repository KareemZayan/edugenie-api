import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PurchaseType } from '../../common/enums/purchase-type.enum';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  studentId: Types.ObjectId;

  @Prop([{
    itemType: { type: String, enum: PurchaseType, required: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true },
    sectionId: { type: Types.ObjectId, ref: 'Section' },
    price: { type: Number, required: true }
  }])
  items: { itemType: PurchaseType; courseId: Types.ObjectId; sectionId?: Types.ObjectId; price: number; _id?: Types.ObjectId }[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);