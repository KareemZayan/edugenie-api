import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';

export class NotificationSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  userId: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  title: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  message: string;
  @Expose()
  @ApiProperty({ example: true })
  isRead: boolean;
  @Expose()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  courseId?: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  type: string;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<NotificationSerializer>) {
    Object.assign(this, partial);
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
      delete (this as any)._id;
    }
    if (doc.userId) {
      this.userId = doc.userId.toString();
    }
  }
}
