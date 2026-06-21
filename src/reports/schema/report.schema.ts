import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReportType } from '../../common/enums/report-type.enum';
import { ReportStatus } from '../../common/enums/report-status.enum';
import { ReportResolvedAction } from '../../common/enums/report-action.enum';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: String, enum: ReportType, required: true })
  type!: ReportType;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reportedBy?: Types.ObjectId | null;

  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.OPEN })
  status!: ReportStatus;

  @Prop({ type: String, default: null })
  resolution?: string | null;

  @Prop({ type: String, enum: ReportResolvedAction, default: null })
  resolvedAction?: ReportResolvedAction | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ status: 1, type: 1 });
