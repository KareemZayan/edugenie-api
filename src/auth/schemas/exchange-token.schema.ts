import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExchangeTokenDocument = ExchangeToken & Document;

@Schema()
export class ExchangeToken {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token: string;

  // TTL index: automatically expire and remove the document after 60 seconds
  @Prop({ type: Date, default: Date.now, expires: 60 })
  createdAt: Date;
}

export const ExchangeTokenSchema = SchemaFactory.createForClass(ExchangeToken);
