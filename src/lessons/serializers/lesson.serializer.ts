import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';

export class LessonSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  title: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoUrl: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoPublicId: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoDuration: number;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  transcript: string;
  @Expose()
  @ApiProperty({ required: false, example: 'ready' })
  transcriptStatus?: 'pending' | 'ready' | 'failed';
  @Expose()
  @ApiProperty({ example: 1 })
  order: number;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<LessonSerializer>) {
    Object.assign(this, partial);

    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
  }
}
