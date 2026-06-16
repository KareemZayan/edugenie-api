import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
  ) { }

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
        { returnDocument: 'after', runValidators: true },
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
    dto: UpdateSectionDto,
  ) {
    const updateFields: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateFields[`sections.$.${key}`] = value;
      }
    }
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        {
          $set: updateFields,
        },
        { returnDocument: 'after', runValidators: true },
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
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated)
      throw new NotFoundException('Failed to remove section. Verify IDs');
    return updated.sections;
  }
}
