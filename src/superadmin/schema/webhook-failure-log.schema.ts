import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebhookFailureLogDocument = HydratedDocument<WebhookFailureLog>;

@Schema({ timestamps: true })
export class WebhookFailureLog {
  @Prop({ required: true })
  service: string;

  @Prop({ required: true })
  endpoint: string;

  @Prop({ required: true })
  errorMessage: string;

  @Prop({ default: Date.now })
  occurredAt: Date;
}

export const WebhookFailureLogSchema =
  SchemaFactory.createForClass(WebhookFailureLog);

WebhookFailureLogSchema.index({ service: 1, occurredAt: -1 });
