export interface MyCourseItem {
  courseId: string;
  title: string;
  thumbnail: string;
  thumbnailPublicId: string;
  price: number;
  level: string;
  progressPercent: number;
  enrolledAt: string;
  /** Whether the student owns the whole course or only specific sections. */
  accessType: 'full' | 'section';
  /** How many sections the student owns (0 for a full-course enrollment). */
  ownedSectionCount: number;
  /** True once the enrolled scope is fully completed. */
  isCompleted: boolean;
}
