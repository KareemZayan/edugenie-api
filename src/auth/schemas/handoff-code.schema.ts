import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HandoffCodeDocument = HandoffCode & Document;

@Schema()
export class HandoffCode {
  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userRole: string;

  @Prop({ default: false })
  used: boolean;

  @Prop({ required: true, type: Date, expires: 0 })
  expiresAt: Date;
}

export const HandoffCodeSchema = SchemaFactory.createForClass(HandoffCode);
