import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';

export type AdminInviteDocument = HydratedDocument<AdminInvite>;

@Schema({ timestamps: true })
export class AdminInvite {
  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  // Only the SHA-256 hash of the invite token is stored; the raw token only
  // ever lives in the emailed link. A leaked DB can't be used to accept invites.
  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.ADMIN,
  })
  role: UserRole;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  acceptedAt: Date | null;
}

export const AdminInviteSchema = SchemaFactory.createForClass(AdminInvite);
