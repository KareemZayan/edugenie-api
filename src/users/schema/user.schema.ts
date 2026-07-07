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

  // AI roadmap builds used in the current calendar month (capped at 3). Resets
  // when `roadmapQuotaMonth` no longer matches the current 'YYYY-MM'.
  @Prop({ default: 0 })
  roadmapGenerationsUsed!: number;

  // The 'YYYY-MM' month that `roadmapGenerationsUsed` is counted against. When a
  // new month starts, the count is treated as 0 and reset on the next build.
  @Prop({ default: '' })
  roadmapQuotaMonth!: string;

  // One-time onboarding gate: true once the student has completed the
  // post-verification onboarding wizard. Drives the frontend gate — an
  // email-verified student with this false is forced through /onboarding.
  @Prop({ default: false })
  hasOnboarded!: boolean;

  // Raw onboarding answers (kept for later editing) plus a generated
  // natural-language `profileSummary` fed to the AI roadmap/RAG. Set once the
  // wizard is submitted. Absent until then.
  @Prop({
    type: {
      specialization: { type: String },
      currentLevel: { type: String },
      hoursPerWeek: { type: String },
      pace: { type: String },
      priorExperience: { type: String },
      endGoal: { type: String },
      learningStyle: { type: String },
      knownTopics: { type: [String], default: [] },
      focusTopics: { type: [String], default: [] },
      extraNotes: { type: String },
      profileSummary: { type: String },
      completedAt: { type: Date },
    },
    _id: false,
  })
  onboarding?: {
    specialization: string;
    currentLevel: string;
    hoursPerWeek: string;
    pace: string;
    priorExperience: string;
    endGoal: string;
    learningStyle?: string;
    knownTopics: string[];
    focusTopics: string[];
    extraNotes?: string;
    profileSummary: string;
    completedAt: Date;
  };

  // Track instructor quiz generations (for rate limiting)
  @Prop({ default: 0 })
  quizGenerationsUsed!: number;

  @Prop({ type: Date, default: null })
  lastQuizGenerationAt?: Date | null;

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

  // Instructor's Stripe Connect (Express) connected-account id. Their revenue
  // share lands in this account's balance (destination charges) and is paid out
  // to their bank via Stripe Payouts. Null until they start onboarding.
  @Prop({ type: String, default: null })
  stripeAccountId?: string | null;

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

  @Prop({ required: false, default: false })
  isBlocked?: boolean;

  @Prop({ type: String, default: null })
  blockedReason?: string | null;

  @Prop({ type: Date, default: null })
  blockedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  blockedBy?: Types.ObjectId | null;

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

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedReason?: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
