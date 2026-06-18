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
  @Expose() sections: any[];
  @Expose() thumbnailPublicId: string;
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
         const secObj = typeof section.toObject === 'function' ? section.toObject() : section;
         if (secObj._id) {
           secObj.id = secObj._id.toString();
           delete secObj._id;
         }
         
         if (secObj.lessons && Array.isArray(secObj.lessons)) {
           secObj.lessons = secObj.lessons.map((lesson: any) => {
             const lesObj = typeof lesson.toObject === 'function' ? lesson.toObject() : lesson;
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
