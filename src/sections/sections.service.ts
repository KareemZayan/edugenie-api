import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course } from '../courses/schemas/course.schema';
import { CreateSectionDto } from './dto/create-section.dto';

@Injectable()
export class SectionsService {
    constructor(
        @InjectModel(Course.name)
        private courseModel: Model<Course>,
    ) { }

    private async getCourse(courseId: string) {
        const course = await this.courseModel.findById(courseId);

        if (!course) {
            throw new NotFoundException('Course not found');
        }

        return course;
    }

    // ADD SECTION
    async addSection(courseId: string, dto: CreateSectionDto) {
        const course = await this.getCourse(courseId);

        const newSection = {
            ...dto,
            lessons: [],
        };

        course.sections.push(newSection as any);

        await course.save();

        return course.sections;
    }

    //  GET ALL SECTIONS
    async getSections(courseId: string) {
        const course = await this.getCourse(courseId);
        return course.sections;
    }

    //  GET ONE SECTION
    async getSection(courseId: string, sectionId: string) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) {
            throw new NotFoundException('Section not found');
        }

        return section;
    }

    //  UPDATE SECTION
    async updateSection(
        courseId: string,
        sectionId: string,
        dto: Partial<CreateSectionDto>,
    ) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) {
            throw new NotFoundException('Section not found');
        }

        Object.assign(section, dto);

        await course.save();

        return section;
    }

    //  DELETE SECTION
    async deleteSection(courseId: string, sectionId: string) {
  const course = await this.getCourse(courseId);

  const section = (course.sections as any).id(sectionId);

  if (!section) {
    throw new NotFoundException('Section not found');
  }

  course.sections = course.sections.filter(
    (s: any) => s._id.toString() !== sectionId,
  );

  await course.save();

  return { message: 'Section deleted successfully' };
}
}