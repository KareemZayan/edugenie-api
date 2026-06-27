import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';
import { UserResponse } from '../interfaces/user-response.interface';

export class UserSerializer implements UserResponse {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  firstName: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  lastName: string;
  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  email: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  role: string;
  @Expose()
  @ApiProperty({ required: false, example: 'string_example' })
  avatar?: string;
  @Expose()
  @ApiProperty({ required: false, example: 'string_example' })
  level?: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  skills: string[];
  @Expose()
  @ApiProperty({ example: 'string_example' })
  interests: string[];
  @Expose()
  @ApiProperty({ required: false, example: 'string_example' })
  bio?: string;
  @Expose()
  @ApiProperty({ required: false, example: 1 })
  averageInstructorRating?: number;
  @Expose()
  @ApiProperty({ example: 1 })
  profileViews: number;
  @Expose()
  @ApiProperty({ example: true })
  isVerified: boolean;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiHideProperty()
  password!: string;
  @Exclude()
  @ApiProperty({ required: false, example: '2026-01-15T10:30:00.000Z' })
  passwordReset?: { code: string; expiresAt: Date };
  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<UserSerializer>) {
    Object.assign(this, partial);
    // Convert Mongo _id to id if present
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
      delete (this as any)._id;
    }
  }
}
