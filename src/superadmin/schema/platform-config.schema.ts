import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlatformConfigDocument = HydratedDocument<PlatformConfig>;

@Schema({ timestamps: true })
export class PlatformConfig {
  @Prop({ required: true, default: 20 })
  platformFeePercent: number;

  @Prop({ required: true, default: 80 })
  instructorSharePercent: number;

  @Prop({ required: true, default: false })
  maintenanceMode: boolean;

  @Prop({ required: true, default: 50 })
  minimumPayoutThreshold: number;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;
}

export const PlatformConfigSchema = SchemaFactory.createForClass(PlatformConfig);
