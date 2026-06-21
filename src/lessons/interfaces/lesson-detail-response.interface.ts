export interface LessonDetailResponse {
  _id: string;
  title: string;
  videoUrl: string;
  videoDuration: number;
  transcript: string | null;
  sectionId: string;
}
