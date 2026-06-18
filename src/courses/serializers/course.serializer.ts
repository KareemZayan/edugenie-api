import { Exclude, Expose } from 'class-transformer';
import { CourseResponse } from '../interfaces/course-response.interface';

export class CourseSerializer implements CourseResponse {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() description: string;
  @Expose() price: number;
  @Expose() thumbnail: string;
  @Expose() level: string;
  @Expose() courseStatus: string;
  @Expose() instructor: any;
  @Expose() category: any;
  @Expose() goals: string[];
  @Expose() requirements: string[];
  @Expose() ratingAverage: number;
  @Expose() totalEnrollments: number;
  @Expose() totalLessons: number;
  @Expose() totalHours: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<CourseSerializer>) {
    Object.assign(this, partial);
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
    if ((partial as any).instructorId) {
       this.instructor = (partial as any).instructorId.toString();
       delete (this as any).instructorId;
    }
    if ((partial as any).categoryId) {
       this.category = (partial as any).categoryId.toString();
       delete (this as any).categoryId;
    }
  }
}
