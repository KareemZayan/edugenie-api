import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class AttachmentSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;

  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  sectionId: string;

  @Expose()
  @ApiProperty({ example: 'Course Syllabus' })
  title: string;

  @Expose()
  @ApiProperty({ example: 'syllabus-2026.pdf' })
  originalFilename: string;

  @Expose()
  @ApiProperty({ example: 'https://res.cloudinary.com/.../syllabus.pdf' })
  fileUrl: string;

  @Expose()
  @ApiProperty({ example: 'pdf' })
  fileType: string;

  @Expose()
  @ApiProperty({ example: 204800 })
  fileSize: number;

  @Expose()
  @ApiProperty({ example: false })
  isPublic: boolean;

  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  // Internal-only fields, never sent to the client.
  @Exclude()
  instructorId?: unknown;

  @Exclude()
  filePublicId?: string;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?._id) {
      this.id = partial._id.toString();
      delete (this as any)._id;
    }
    if (this.courseId) this.courseId = this.courseId.toString();
    if (this.sectionId) this.sectionId = this.sectionId.toString();
  }
}