import { Exclude, Expose } from 'class-transformer';
import { SectionResponse } from '../interfaces/section-response.interface';

export class SectionSerializer implements SectionResponse {
  @Expose() id: string;
  @Expose() courseId: string;
  @Expose() title: string;
  @Expose() order: number;
  @Expose() description: string;
  @Expose() expectedOutcomes: string[];
  @Expose() price: number | null;
  @Expose() isPublished: boolean;
  @Expose() lessons: any[];
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<SectionSerializer>) {
    Object.assign(this, partial);

    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if (this.lessons && Array.isArray(this.lessons)) {
      this.lessons = this.lessons.map((lesson: any) => {
        const lesObj = typeof lesson.toObject === 'function' ? lesson.toObject() : lesson;
        if (lesObj._id) {
          lesObj.id = lesObj._id.toString();
          delete lesObj._id;
        }
        return lesObj;
      });
    }
  }
}
