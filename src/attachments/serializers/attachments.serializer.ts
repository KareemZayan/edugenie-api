import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { AttachmentParentType } from '../schema/attachment.schema';

export class AttachmentSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ enum: AttachmentParentType, example: AttachmentParentType.LESSON })
  parentType: AttachmentParentType;

  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;

  @Expose()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  sectionId?: string | null;

  @Expose()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  lessonId?: string | null;

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

  // Typed `any` rather than Partial<AttachmentSerializer> because callers
  // pass raw Mongoose .toObject() output, where courseId/sectionId/lessonId
  // are still ObjectId instances, not the post-conversion strings this class
  // declares — same convention as LessonSerializer/SectionSerializer's `_id`.
  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?._id) {
      this.id = partial._id.toString();
      delete (this as any)._id;
    }
    if (this.courseId) this.courseId = this.courseId.toString();
    if (this.sectionId) this.sectionId = this.sectionId.toString();
    if (this.lessonId) this.lessonId = this.lessonId.toString();
  }
}