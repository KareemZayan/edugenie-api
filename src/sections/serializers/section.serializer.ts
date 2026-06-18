import { Exclude, Expose } from 'class-transformer';
import { SectionResponse } from '../interfaces/section-response.interface';
import { LessonSerializer } from '../../lessons/serializers/lesson.serializer';

export class SectionSerializer implements SectionResponse {
  @Expose() id: string;
  @Expose() courseId: string;
  @Expose() title: string;
  @Expose() order: number;
  @Expose() description?: string;
  @Expose() isPublished: boolean;
  @Expose() lessons: LessonSerializer[];
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<SectionSerializer>) {
    Object.assign(this, partial);
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
    }
    if (doc.courseId) {
       this.courseId = doc.courseId.toString();
    }
  }
}
