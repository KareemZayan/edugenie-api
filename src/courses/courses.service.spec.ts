import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import { CourseStatus } from '../common/enums/course-status.enum';
import { PurchaseType } from '../common/enums/purchase-type.enum';

// Direct instantiation (the constructor has many deps; the tested method only
// touches courseModel + retrieval). Unused deps are empty stubs.
function make(overrides: {
  courseModel?: any;
  retrieval?: any;
  enrollmentModel?: any;
} = {}) {
  const empty = {} as any;
  return new CoursesService(
    overrides.courseModel ?? empty, // courseModel
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

const courseFind = (rows: any[]) => ({
  find: jest.fn().mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(rows) }),
  }),
});

describe('CoursesService.searchLessons', () => {
  it('returns [] for a blank query', async () => {
    const svc = make();
    expect(await svc.searchLessons('   ')).toEqual([]);
  });

  it('returns [] when there are no published courses', async () => {
    const retrieval = { retrieveScoped: jest.fn() };
    const svc = make({ courseModel: courseFind([]), retrieval });
    expect(await svc.searchLessons('closures')).toEqual([]);
    expect(retrieval.retrieveScoped).not.toHaveBeenCalled();
  });

  it('scopes to published courses, dedupes lessons, and adds the course title', async () => {
    const c1 = new Types.ObjectId();
    const c2 = new Types.ObjectId();
    const courseModel = courseFind([
      { _id: c1, title: 'Node.js' },
      { _id: c2, title: 'C#' },
    ]);
    const retrieval = {
      retrieveByText: jest.fn().mockResolvedValue([]),
      retrieveScoped: jest.fn().mockResolvedValue([
        {
          courseId: c1.toString(),
          lessonId: 'L1',
          lessonTitle: 'Event loop',
          sectionTitle: 'Async',
          text: 'about the event loop',
          score: 0.9,
        },
        // duplicate lesson — must be collapsed
        {
          courseId: c1.toString(),
          lessonId: 'L1',
          lessonTitle: 'Event loop',
          sectionTitle: 'Async',
          text: 'more event loop',
          score: 0.8,
        },
        {
          courseId: c2.toString(),
          lessonId: 'L2',
          lessonTitle: 'Delegates',
          sectionTitle: 'OOP',
          text: 'about delegates',
          score: 0.7,
        },
      ]),
    };
    const svc = make({ courseModel, retrieval });

    const res = await svc.searchLessons('closures');

    // published-only status filter
    expect(courseModel.find).toHaveBeenCalledWith({
      courseStatus: CourseStatus.PUBLISHED,
    });
    // filter passed to retrieval scopes to the published course ids
    const filter = retrieval.retrieveScoped.mock.calls[0][1];
    expect(filter.courseId.$in.map((x: Types.ObjectId) => x.toString())).toEqual(
      [c1.toString(), c2.toString()],
    );
    // deduped by lesson, no transcript text, title resolved
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      courseId: c1.toString(),
      courseTitle: 'Node.js',
      lessonId: 'L1',
      sectionTitle: 'Async',
    });
    expect(res[0]).not.toHaveProperty('snippet');
    expect(res[1]).toMatchObject({ courseId: c2.toString(), courseTitle: 'C#' });
  });

  it('ranks literal substring hits first and applies the relevance floor', async () => {
    const c1 = new Types.ObjectId();
    const courseModel = courseFind([{ _id: c1, title: 'Node.js' }]);
    const retrieval = {
      // literal match on a distinct lesson — must come first
      retrieveByText: jest.fn().mockResolvedValue([
        { courseId: c1.toString(), lessonId: 'LIT', lessonTitle: 'Part 24', sectionTitle: 'S', text: 't', score: 1 },
      ]),
      retrieveScoped: jest.fn().mockResolvedValue([
        { courseId: c1.toString(), lessonId: 'SEM', lessonTitle: 'Semantic', sectionTitle: 'S', text: 't', score: 0.82 },
      ]),
    };
    const svc = make({ courseModel, retrieval });

    const res = await svc.searchLessons('part 24');

    // floor forwarded to the semantic call
    expect(retrieval.retrieveScoped).toHaveBeenCalledWith(
      'part 24',
      expect.any(Object),
      24,
      0.8,
    );
    expect(res.map((r) => r.lessonId)).toEqual(['LIT', 'SEM']);
  });

  it('flags owned lessons (full-course + owned-section) and carries start', async () => {
    const fullCourse = new Types.ObjectId();
    const secCourse = new Types.ObjectId();
    const ownedSec = new Types.ObjectId();
    const other = new Types.ObjectId();
    const courseModel = courseFind([
      { _id: fullCourse, title: 'Full' },
      { _id: secCourse, title: 'Sec' },
      { _id: other, title: 'Other' },
    ]);
    const enrollmentModel = {
      find: () => ({
        select: () => ({
          lean: () =>
            Promise.resolve([
              { courseId: fullCourse, type: PurchaseType.FULL_COURSE, sectionIds: [] },
              { courseId: secCourse, type: PurchaseType.SECTION, sectionIds: [ownedSec] },
            ]),
        }),
      }),
    };
    const retrieval = {
      retrieveByText: jest.fn().mockResolvedValue([]),
      retrieveScoped: jest.fn().mockResolvedValue([
        { courseId: fullCourse.toString(), lessonId: 'A', lessonTitle: 'a', sectionId: 'x', sectionTitle: 's', start: 12, score: 0.9 },
        { courseId: secCourse.toString(), lessonId: 'B', lessonTitle: 'b', sectionId: ownedSec.toString(), sectionTitle: 's', start: 30, score: 0.9 },
        { courseId: other.toString(), lessonId: 'C', lessonTitle: 'c', sectionId: 'z', sectionTitle: 's', score: 0.9 },
      ]),
    };
    const svc = make({ courseModel, retrieval, enrollmentModel });

    const res = await svc.searchLessons('closures', new Types.ObjectId().toString());

    const byLesson = Object.fromEntries(res.map((r) => [r.lessonId, r]));
    expect(byLesson.A).toMatchObject({ owned: true, start: 12 }); // full course
    expect(byLesson.B).toMatchObject({ owned: true, start: 30 }); // owned section
    expect(byLesson.C).toMatchObject({ owned: false }); // neither
    expect(byLesson.C.start).toBeUndefined();
  });
});
