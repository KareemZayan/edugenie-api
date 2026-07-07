import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';

export class ReviewSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  studentId: string;
  @Expose()
@ApiProperty({ example: '507f1f77bcf86cd799439011' })
sectionId: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  studentName: string;
  @Expose()
  @ApiProperty({ required: false, example: 'string_example' })
  studentAvatar?: string;
  @Expose()
  @ApiProperty({ example: 1 })
  rating: number;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  comment: string;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<ReviewSerializer>) {
    Object.assign(this, partial);
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
      delete (this as any)._id;
    }
    if (doc.courseId) {
      this.courseId = doc.courseId.toString();
      delete (this as any).courseId;
    }
    if (doc.studentId) {
      if (
        typeof doc.studentId === 'object' &&
        doc.studentId !== null &&
        '_id' in doc.studentId
      ) {
        const student = doc.studentId as Record<string, unknown>;
        this.studentId = student._id?.toString() || '';
        this.studentName = `${student.firstName} ${student.lastName}`;
        this.studentAvatar = student.avatar as string;
      } else {
        this.studentId = doc.studentId.toString();
      }
      delete (this as any).studentId;
    }
  }
}
