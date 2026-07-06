import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import { PurchaseType } from '../common/enums/purchase-type.enum';

// Direct instantiation (the constructor has many deps; the tested methods only
// touch enrollmentModel + retrieval). Unused deps are empty stubs.
function make(overrides: {
  enrollmentModel?: any;
  retrieval?: any;
} = {}) {
  const empty = {} as any;
  return new CoursesService(
    empty, // courseModel
    empty, // categoryModel
    overrides.enrollmentModel ?? empty, // enrollmentModel
    empty, // progressModel
    empty, // earningModel
    empty, // userModel
    empty, // quizModel
    empty, // quizAttemptModel
    empty, // notificationsService
    empty, // indexing
    overrides.retrieval ?? empty, // retrieval
    empty, // payments
  );
}

const enrollmentFind = (rows: any[]) => ({
  find: () => ({ select: () => ({ lean: () => Promise.resolve(rows) }) }),
});

describe('CoursesService.searchLessons', () => {
  const userId = new Types.ObjectId().toString();

  it('returns [] when the student has no enrollments', async () => {
    const retrieval = { retrieveScoped: jest.fn() };
    const svc = make({ enrollmentModel: enrollmentFind([]), retrieval });
    expect(await svc.searchLessons(userId, 'closures')).toEqual([]);
    expect(retrieval.retrieveScoped).not.toHaveBeenCalled();
  });

  it('returns [] for a blank query', async () => {
    const svc = make();
    expect(await svc.searchLessons(userId, '   ')).toEqual([]);
  });

  it('builds a full-course + section $or filter and maps hits', async () => {
    const fullCourse = new Types.ObjectId();
    const secCourse = new Types.ObjectId();
    const sec = new Types.ObjectId();
    const retrieval = {
      retrieveScoped: jest.fn().mockResolvedValue([
        {
          courseId: fullCourse.toString(),
          lessonId: 'L1',
          lessonTitle: 'Lesson 1',
          sectionId: 'S1',
          sectionTitle: 'Sec 1',
          text: 'about closures',
          score: 0.9,
        },
      ]),
    };
    const svc = make({
      enrollmentModel: enrollmentFind([
        { courseId: fullCourse, type: PurchaseType.FULL_COURSE, sectionIds: [] },
        { courseId: secCourse, type: PurchaseType.SECTION, sectionIds: [sec] },
      ]),
      retrieval,
    });

    const res = await svc.searchLessons(userId, 'closures');
    const [, filter] = [null, retrieval.retrieveScoped.mock.calls[0][1]];
    const or = filter.$or as any[];
    // one section-scoped clause + one full-course clause
    expect(or).toEqual(
      expect.arrayContaining([
        { courseId: secCourse, sectionId: { $in: [sec] } },
        { courseId: { $in: [fullCourse] } },
      ]),
    );
    expect(res[0]).toMatchObject({
      courseId: fullCourse.toString(),
      lessonId: 'L1',
      snippet: 'about closures',
    });
  });
});
