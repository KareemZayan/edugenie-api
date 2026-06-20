import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Earning } from './schema/earning.schema';
import { Course } from '../courses/schema/course.schema';

@Injectable()
export class EarningsService {
  constructor(
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(Course.name) private courseModel: Model<Course>
  ) {}

  async getMyPayouts(instructorId: string) {
    const instructorObjId = new Types.ObjectId(instructorId);

    const earnings = await this.earningModel.find({ instructorId: instructorObjId }).exec() as unknown as Array<{ amount: number; status: string; sectionId?: Types.ObjectId; courseId?: Types.ObjectId; createdAt: Date; orderId?: Types.ObjectId }>;

    let totalEarned = 0;
    let pendingPayout = 0;
    let fromFullCourses = 0;
    let fromSections = 0;

    const historyPromises = earnings.map(async (e) => {
      totalEarned += e.amount;
      if (e.status === 'PENDING') {
        pendingPayout += e.amount;
      }

      const type = e.sectionId ? 'section' : 'full_course';
      if (type === 'section') {
        fromSections += e.amount;
      } else {
        fromFullCourses += e.amount;
      }

      // Fetch course and section title
      let courseTitle = 'Unknown Course';
      let sectionTitle = null;

      if (e.courseId) {
        const course = await this.courseModel.findById(e.courseId).select('title sections').exec() as unknown as { title: string; sections: Array<{ _id: Types.ObjectId; title: string }> } | null;
        if (course) {
          courseTitle = course.title;
          if (e.sectionId && course.sections) {
            const section = course.sections.find((s) => s._id.toString() === e.sectionId?.toString());
            if (section) {
              sectionTitle = section.title;
            }
          }
        }
      }

      return {
        date: e.createdAt,
        amount: e.amount,
        type: type as 'section' | 'full_course',
        courseTitle,
        sectionTitle,
        orderId: e.orderId ? e.orderId.toString() : 'Unknown',
      };
    });

    const history = await Promise.all(historyPromises);
    history.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      totalEarned,
      pendingPayout,
      breakdown: {
        fromFullCourses,
        fromSections,
      },
      history,
    };
  }
}
