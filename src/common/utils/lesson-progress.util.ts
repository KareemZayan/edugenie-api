import { Types } from 'mongoose';
import { PurchaseType } from '../enums/purchase-type.enum';

interface ScopeCourse {
  sections: { _id: Types.ObjectId; lessons: { _id: Types.ObjectId }[] }[];
}

interface ScopeEnrollment {
  type: PurchaseType;
  sectionIds: Types.ObjectId[];
  completedLessons: Types.ObjectId[];
}

/**
 * The lesson ids a student OWNS in a course: a full-course enrollment owns every
 * lesson; a section enrollment owns only the lessons in its purchased sections.
 */
export function computeOwnedLessonScope(
  course: ScopeCourse,
  enrollment: Pick<ScopeEnrollment, 'type' | 'sectionIds'>,
): { ownedLessonIds: Set<string>; total: number } {
  const fullCourse = enrollment.type === PurchaseType.FULL_COURSE;
  const ownedSectionIds = new Set(
    (enrollment.sectionIds ?? []).map((id) => id.toString()),
  );
  const ids = new Set<string>();
  for (const section of course.sections) {
    const owned = fullCourse || ownedSectionIds.has(section._id.toString());
    if (!owned) continue;
    for (const lesson of section.lessons) ids.add(lesson._id.toString());
  }
  return { ownedLessonIds: ids, total: ids.size };
}

/**
 * Course progress measured over the student's OWNED scope, so a section-buyer
 * can reach 100%. Shared by ProgressService.trackProgress (the player path) and
 * EnrollmentsService.markLessonComplete so the two never diverge.
 */
export function computeCourseProgress(
  course: ScopeCourse,
  enrollment: ScopeEnrollment,
): { completed: number; total: number; percentage: number } {
  const { ownedLessonIds, total } = computeOwnedLessonScope(course, enrollment);
  const completedSet = new Set(
    (enrollment.completedLessons ?? []).map((id) => id.toString()),
  );
  const completed = [...ownedLessonIds].filter((id) =>
    completedSet.has(id),
  ).length;
  const percentage =
    total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;
  return { completed, total, percentage };
}
