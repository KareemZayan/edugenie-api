import { Exclude, Expose } from 'class-transformer';
import { LessonResponse } from '../interfaces/lesson-response.interface';

export class LessonSerializer implements LessonResponse {
  @Expose() id: string;
  @Expose() courseId: string;
  @Expose() sectionId: string;
  @Expose() title: string;
  @Expose() order: number;
  @Expose() description?: string;
  @Expose() videoUrl?: string;
  @Expose() videoDuration?: number;
  @Expose() isFree: boolean;
  @Expose() isPublished: boolean;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<LessonSerializer>) {
    Object.assign(this, partial);
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
    if ((partial as any).courseId) {
       this.courseId = (partial as any).courseId.toString();
       delete (this as any).courseId;
    }
  }
}
