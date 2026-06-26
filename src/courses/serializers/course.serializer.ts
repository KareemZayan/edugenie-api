import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';
import { CourseResponse } from '../interfaces/course-response.interface';

export class CourseSerializer implements CourseResponse {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  title: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  description: string;
  @Expose()
  @ApiProperty({ example: 1 })
  price: number;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  thumbnail: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  level: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  courseStatus: string;
  @Expose()
  @ApiProperty()
  instructor: any;
  @Expose()
  @ApiProperty()
  category: any;
  @Expose()
  @ApiProperty()
  sections: any[];
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  thumbnailPublicId: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  goals: string[];
  @Expose()
  @ApiProperty({ example: 'string_example' })
  requirements: string[];
  @Expose()
  @ApiProperty({ example: 1 })
  ratingAverage: number;
  @Expose()
  @ApiProperty({ example: 1 })
  totalEnrollments: number;
  @Expose()
  @ApiProperty({ example: 1 })
  totalLessons: number;
  @Expose()
  @ApiProperty({ example: 1 })
  totalHours: number;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<CourseSerializer>) {
    Object.assign(this, partial);

    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if ((partial as any).instructorId) {
      const inst = (partial as any).instructorId;
      if (inst && typeof inst === 'object' && inst._id) {
        this.instructor = Object.assign({}, inst);
        this.instructor.id = inst._id.toString();
        delete this.instructor._id;
      } else {
        this.instructor = inst?.toString() || inst;
      }
      delete (this as any).instructorId;
    }

    if ((partial as any).categoryId) {
      const cat = (partial as any).categoryId;
      if (cat && typeof cat === 'object' && cat._id) {
        this.category = Object.assign({}, cat);
        this.category.id = cat._id.toString();
        delete this.category._id;
      } else {
        this.category = cat?.toString() || cat;
      }
      delete (this as any).categoryId;
    }

    if (this.sections && Array.isArray(this.sections)) {
      this.sections = this.sections.map((section: any) => {
        const secObj =
          typeof section.toObject === 'function' ? section.toObject() : section;
        if (secObj._id) {
          secObj.id = secObj._id.toString();
          delete secObj._id;
        }

        if (secObj.lessons && Array.isArray(secObj.lessons)) {
          secObj.lessons = secObj.lessons.map((lesson: any) => {
            const lesObj =
              typeof lesson.toObject === 'function'
                ? lesson.toObject()
                : lesson;
            if (lesObj._id) {
              lesObj.id = lesObj._id.toString();
              delete lesObj._id;
            }
            return lesObj;
          });
        }
        return secObj;
      });
    }
  }
}
