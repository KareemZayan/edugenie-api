import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { CoursesService } from '../courses/courses.service';
import { SectionSerializer } from './serializers/section.serializer';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SectionPurchaseInfo } from '../common/interfaces/frontend-contracts';

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) { }

  async addSection(
    courseId: string,
    instructorId: string,
    dto: CreateSectionDto,
  ): Promise<SectionSerializer[]> {
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

    // Trigger metadata sync (recalculates course total price, hours, and lessons)
    await this.coursesService.syncMetadata(courseId);
    return updated.sections.map((s) => new SectionSerializer(s.toObject() as any));
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    instructorId: string,
    dto: UpdateSectionDto,
  ): Promise<SectionSerializer[]> {
    const updateFields: Record<string, unknown> = {};
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

    // Trigger metadata sync
    await this.coursesService.syncMetadata(courseId);
    return updated.sections.map((s) => new SectionSerializer(s.toObject() as any));
  }

  async removeSection(
    courseId: string,
    sectionId: string,
    instructorId: string,
  ): Promise<SectionSerializer[]> {
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

    // Trigger metadata sync
    await this.coursesService.syncMetadata(courseId);
    return updated.sections.map((s) => new SectionSerializer(s.toObject() as any));
  }

  // Phase 9: New Endpoints
  async getPurchaseInfo(sectionId: string, studentId: string): Promise<SectionPurchaseInfo> {
    const course = await this.courseModel.findOne({ 'sections._id': new Types.ObjectId(sectionId) }).exec();
    if (!course) throw new NotFoundException('Section not found');

    const section = course.sections.find(s => s._id.toString() === sectionId);
    if (!section) throw new NotFoundException('Section not found');

    const isAlreadyOwned = await this.enrollmentsService.canAccessSection(studentId, sectionId);

    return {
      sectionId: section._id.toString(),
      title: section.title,
      price: section.price ?? null,
      isPurchasable: section.price !== null && section.price !== undefined,
      isAlreadyOwned,
      courseId: course._id.toString(),
      courseTitle: course.title,
    };
  }

  async setPrice(courseId: string, sectionId: string, instructorId: string, price: number | null) {
    if (price !== null && price < 0) {
      throw new BadRequestException('Price cannot be negative');
    }

    const updated = await this.courseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(courseId),
        instructorId: new Types.ObjectId(instructorId),
        'sections._id': new Types.ObjectId(sectionId),
      },
      {
        $set: { 'sections.$.price': price },
      },
      { returnDocument: 'after', runValidators: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException('Section not found or unauthorized');
    }

    return { success: true, message: 'Section price updated successfully' };
  }

  async reorderSections(
    courseId: string,
    instructorId: string,
    sectionIds: string[],
  ) {
    const course = await this.courseModel.findOne({
      _id: new Types.ObjectId(courseId),
      instructorId: new Types.ObjectId(instructorId),
    });

    if (!course)
      throw new NotFoundException('Course not found or unauthorized');

    const sectionMap = new Map(
      course.sections.map((s) => [s._id.toString(), s]),
    );

    if (sectionIds.length !== sectionMap.size) {
      throw new BadRequestException(
        'sectionIds count does not match course sections',
      );
    }

    const reordered = sectionIds.map((id) => {
      const section = sectionMap.get(id);
      if (!section)
        throw new BadRequestException(`Section ${id} not found in this course`);
      return section;
    });

    course.sections.splice(0, course.sections.length, ...reordered);
    course.markModified('sections');
    await course.save();

    await this.coursesService.syncMetadata(courseId);

    return course.sections;
  }
}
