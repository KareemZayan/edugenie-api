import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  performedBy: Types.ObjectId;

  // Optional: some audited actions (e.g. inviting a not-yet-created admin) have
  // no existing target user to reference.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  targetUser?: Types.ObjectId | null;

  @Prop({ type: Object, required: true })
  details: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
