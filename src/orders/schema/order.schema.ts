import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PurchaseType } from '../../common/enums/purchase-type.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: String, enum: PurchaseType, required: true })
  itemType: PurchaseType;

  @Prop({ type: Types.ObjectId, ref: 'Section' })
  sectionId?: Types.ObjectId;

  @Prop({ required: true })
  courseTitle: string;

  @Prop({ required: true })
  price: number;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: [OrderItem], required: true })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ type: String, default: null })
  paymobOrderId: string | null;

  @Prop({ type: String, default: null })
  cartSnapshotHash: string | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);