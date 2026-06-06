import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CoursesService } from '../courses/courses.service';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import { getVideoDurationInSeconds } from 'get-video-duration';

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private coursesService: CoursesService,
  ) { }

  async addLesson(
    courseId: string,
    sectionId: string,
    instructorId: string,
    createLessonDto: CreateLessonDto,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        { $push: { 'sections.$.lessons': createLessonDto } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated)
      throw new NotFoundException('Invalid Course, Section, or Ownership');

    await this.coursesService.syncMetadata(courseId);
    return updated.sections;
  }

  async updateLesson(
    courseId: string,
    sectionId: string,
    lessonId: string,
    instructorId: string,
    updateLessonDto: UpdateLessonDto,
  ) {
    if (!updateLessonDto || Object.keys(updateLessonDto).length === 0) {
      throw new BadRequestException(
        'Update data (Request Body) cannot be empty',
      );
    }

    const updateFields: Record<string, any> = {};

    Object.keys(updateLessonDto).forEach((key) => {
      const safeKey = key as keyof UpdateLessonDto;
      updateFields[`sections.$[s].lessons.$[l].${safeKey}`] =
        updateLessonDto[safeKey];
    });

    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
        },
        { $set: updateFields },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
          returnDocument: 'after', runValidators: true
        }
      )
      .exec();

    if (!updated)
      throw new BadRequestException(
        'Update failed: Course/Section not found or Unauthorized',
      );

    await this.coursesService.syncMetadata(courseId);
    return updated.sections;
  }

  async removeLesson(
    courseId: string,
    sectionId: string,
    lessonId: string,
    instructorId: string,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        {
          $pull: {
            'sections.$.lessons': { _id: new Types.ObjectId(lessonId) },
          },
        },
        { returnDocument: 'after', runValidators: true }
      )
      .exec();

    if (!updated) throw new BadRequestException('Delete failed');

    await this.coursesService.syncMetadata(courseId);
    return { success: true, message: 'Lesson removed successfully' };
  }

  async addLessonWithVideo(
    courseId: string,
    sectionId: string,
    instructorId: string,
    createLessonDto: any,
    localFilePath: string,
  ) {
    try {
      // 1. Check Video Duration
      const durationInSeconds = await getVideoDurationInSeconds(localFilePath);
      const durationInMinutes = Math.floor(durationInSeconds / 60);
      if (durationInMinutes > 20) {
        fs.unlinkSync(localFilePath); // Delete local file
        throw new BadRequestException('Video exceeds the 20-minute maximum limit.');
      }
      // 2. Upload to Cloudinary (It will automatically use CLOUDINARY_URL from your .env)
      const cloudinaryResponse = await cloudinary.uploader.upload(localFilePath, {
        resource_type: 'video',
        folder: `edugenie/courses/${courseId}`,
      });
      // 3. Delete the local file to save space
      fs.unlinkSync(localFilePath);
      // 4. Attach Cloudinary URL and duration to the DTO
      const newLesson = {
        ...createLessonDto,
        videoUrl: cloudinaryResponse.secure_url,
        videoPublicId: cloudinaryResponse.public_id,
        videoDuration: durationInSeconds,
      };
      // 5. Save to MongoDB
      const updatedCourse = await this.courseModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(courseId),
            instructorId: new Types.ObjectId(instructorId),
            'sections._id': new Types.ObjectId(sectionId),
          },
          { $push: { 'sections.$.lessons': newLesson } },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
      if (!updatedCourse) {
        throw new NotFoundException('Course or Section not found, or Unauthorized');
      }
      await this.coursesService.syncMetadata(courseId);
      return { success: true, message: 'Lesson created successfully!', data: newLesson };
    } catch (error) {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
      throw error;
    }
  }
}
