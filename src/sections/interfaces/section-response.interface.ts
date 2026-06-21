import { LessonResponse } from '../../lessons/interfaces/lesson-response.interface';

export interface SectionResponse {
  id: string;
  courseId: string;
  title: string;
  order: number;
  description?: string;
  isPublished: boolean;
  lessons: LessonResponse[];
  createdAt: Date;
  updatedAt: Date;
}
