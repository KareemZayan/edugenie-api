import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';
import { SectionResponse } from '../interfaces/section-response.interface';

export class SectionSerializer implements SectionResponse {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  title: string;
  @Expose()
  @ApiProperty({ example: 1 })
  order: number;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  description: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  expectedOutcomes: string[];
  @Expose()
  @ApiProperty({ example: 1 })
  price: number | null;
  @Expose()
  @ApiProperty({ example: true })
  isPublished: boolean;
  @Expose()
  @ApiProperty()
  lessons: any[];
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<SectionSerializer>) {
    Object.assign(this, partial);

    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if (this.lessons && Array.isArray(this.lessons)) {
      this.lessons = this.lessons.map((lesson: any) => {
        const lesObj =
          typeof lesson.toObject === 'function' ? lesson.toObject() : lesson;
        if (lesObj._id) {
          lesObj.id = lesObj._id.toString();
          delete lesObj._id;
        }
        return lesObj;
      });
    }
  }
}
