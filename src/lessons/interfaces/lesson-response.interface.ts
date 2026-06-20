export interface LessonResponse {
  id: string;
  courseId: string;
  sectionId: string;
  title: string;
  order: number;
  description?: string;
  videoUrl?: string;
  videoDuration?: number;
  isFree: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}
