export interface ProgressResponse {
  lessonState: 'not_started' | 'in_progress' | 'completed';
  nextLessonUnlocked: boolean;
  nextLesson: {
    _id: string;
    title: string;
  } | null;
  sectionCompleted: boolean;
  quizRequired: boolean;
  quizSectionId: string | null;
}
