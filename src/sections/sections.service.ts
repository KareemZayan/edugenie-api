import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { CreateSectionDto } from './dto/create-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
  ) {}

  async addSection(
    courseId: string,
    instructorId: string,
    dto: CreateSectionDto,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
        },
        { $push: { sections: { ...dto, lessons: [] } } },
        { new: true },
      )
      .exec();

    if (!updated)
      throw new NotFoundException('Course not found or ownership mismatch');
    return updated.sections;
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    instructorId: string,
    title: string,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        {
          $set: { 'sections.$.title': title },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(
        'Could not find the section or you are not authorized',
      );
    }

    return updated.sections;
  }

  async removeSection(
    courseId: string,
    sectionId: string,
    instructorId: string,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
        },
        { $pull: { sections: { _id: new Types.ObjectId(sectionId) } } },
        { new: true },
      )
      .exec();

    if (!updated)
      throw new NotFoundException('Failed to remove section. Verify IDs');
    return updated.sections;
  }
}
