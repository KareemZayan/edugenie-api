import { Exclude, Expose } from 'class-transformer';

export class ReviewSerializer {
  @Expose() id: string;
  @Expose() courseId: string;
  @Expose() studentId: string;
  @Expose() studentName: string;
  @Expose() studentAvatar?: string;
  @Expose() rating: number;
  @Expose() comment: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<ReviewSerializer>) {
    Object.assign(this, partial);
    const doc = partial as Record<string, unknown>;
    if (doc._id) this.id = doc._id.toString();
    if (doc.courseId) this.courseId = doc.courseId.toString();
    if (doc.studentId) {
      if (typeof doc.studentId === 'object' && doc.studentId !== null && '_id' in doc.studentId) {
        const student = doc.studentId as Record<string, unknown>;
        this.studentId = student._id?.toString() || '';
        this.studentName = `${student.firstName} ${student.lastName}`;
        this.studentAvatar = student.avatar as string;
      } else {
        this.studentId = doc.studentId.toString();
      }
    }
  }
}
