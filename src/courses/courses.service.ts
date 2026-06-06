import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from './schema/course.schema';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseStatus } from '../common/enums/course-status.enum';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
  ) { }

  async create(dto: CreateCourseDto, instructorId: string): Promise<Course> {
    if (!instructorId)
      throw new BadRequestException('Instructor ID is required');

    return await this.courseModel.create({
      ...dto,
      instructorId: new Types.ObjectId(instructorId),
      courseStatus: CourseStatus.DRAFT,
    });
  }

  async findAll(skip = 0, limit = 10) {
    const [data, total] = await Promise.all([
      this.courseModel
        .find({ courseStatus: CourseStatus.PUBLISHED })
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'name avatar')
        .exec(),
      this.courseModel.countDocuments({ courseStatus: CourseStatus.PUBLISHED }),
    ]);

    return {
      data,
      total,
      skip,
      limit,
    };
  }

  async findInstructorCourses(instructorId: string) {
    if (!instructorId) return [];

    return await this.courseModel
      .find({ instructorId: new Types.ObjectId(instructorId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid ID');
    const course = await this.courseModel
      .findById(id)
      .populate('instructorId', 'name bio')
      .exec();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async update(id: string, instructorId: string, dto: UpdateCourseDto) {
    const updated = await this.courseModel.findOneAndUpdate(
      { _id: id, instructorId: new Types.ObjectId(instructorId) },
      { $set: dto },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw new ForbiddenException('Not authorized');
    return updated;
  }

  async remove(id: string) {
    const result = await this.courseModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Course not found');
    return { success: true };
  }

  async syncMetadata(courseId: string) {
    // Use MongoDB Aggregation to calculate totals entirely inside the database (Super fast, zero memory overhead)
    const [stats] = await this.courseModel.aggregate([
      { $match: { _id: new Types.ObjectId(courseId) } },
      { $unwind: '$sections' },
      { $unwind: { path: '$sections.lessons', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$_id',
          totalLessons: { $sum: { $cond: [{ $ifNull: ['$sections.lessons._id', false] }, 1, 0] } },
          // IMPORTANT: Assuming you fixed lessons.service.ts to save `duration` in SECONDS
          totalDurationSeconds: { $sum: '$sections.lessons.duration' },
        },
      },
    ]);

    if (!stats) return;

    const totalHour = Math.round((stats.totalDurationSeconds || 0) / 3600);

    // Update the course with the new metadata
    await this.courseModel.updateOne(
      { _id: new Types.ObjectId(courseId) },
      {
        $set: {
          totalLessons: stats.totalLessons,
          totalHour: totalHour,
        },
      },
    );
  }

}
