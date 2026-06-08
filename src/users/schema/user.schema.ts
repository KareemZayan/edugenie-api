import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { UserRole } from '../../common/enums/user-role.enum';
import { UserLevel } from '../../common/enums/user-level.enum';

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

  @Prop({ required: true, enum: UserRole })
  role!: UserRole;

  @Prop()
  avatar?: string;

  @Prop()
  avatarPublicId?: string;

  @Prop({ enum: UserLevel })
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

  @Prop({ required: true, default: false })
  isVerified!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
