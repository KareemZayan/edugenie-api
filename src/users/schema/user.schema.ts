import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { UserRole } from '../../common/enums/user-role.enum';
import { UserLevel } from '../../common/enums/user-level.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  // Set when the account is linked to a Google identity (OAuth sign-in). Sparse
  // so non-Google accounts (null) don't collide on the unique index.
  @Prop({ type: String, unique: true, sparse: true })
  googleId?: string;

  @Prop({ type: String, required: true, enum: UserRole })
  role!: UserRole;

  @Prop()
  avatar?: string;

  @Prop()
  avatarPublicId?: string;

  @Prop({ type: String, enum: UserLevel })
  level?: UserLevel;

  @Prop({ type: [String], default: [] })
  skills!: string[];

  @Prop({ type: [String], default: [] })
  interests!: string[];

  @Prop()
  bio?: string;

  @Prop({ min: 0, max: 5 })
  averageInstructorRating?: number;

  @Prop({ default: 0 })
  profileViews!: number;

  // Lifetime count of AI roadmap builds (capped at 3 — never decremented).
  @Prop({ default: 0 })
  roadmapGenerationsUsed!: number;

  @Prop({
    type: {
      code: { type: String },
      expiresAt: { type: Date },
    },
    _id: false,
  })
  passwordReset?: {
    code: string;
    expiresAt: Date;
  };

  // Email-verification token (sha256 hash of the raw token emailed to the user).
  @Prop({
    type: {
      code: { type: String },
      expiresAt: { type: Date },
    },
    _id: false,
  })
  emailVerification?: {
    code: string;
    expiresAt: Date;
  };

  @Prop({ required: true, default: false })
  isVerified!: boolean;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Prop({ type: String, default: null })
  deactivatedReason?: string | null;

  @Prop({ type: Date, default: null })
  deactivatedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  deactivatedBy?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  lastLoginFingerprint?: string | null;

  @Prop({ type: String, default: null })
  lastLoginIp?: string | null;

  @Prop({ type: String, default: null })
  lastLoginDevice?: string | null;

  @Prop({ type: String, default: null })
  lastLoginLocation?: string | null;

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
