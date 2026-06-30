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
  /** Course progress over the student's OWNED scope (sections or full course). */
  courseProgress: number;
  /** Completed lessons within the owned scope. */
  completedLessons: number;
  /** Total lessons within the owned scope. */
  totalLessons: number;
}
