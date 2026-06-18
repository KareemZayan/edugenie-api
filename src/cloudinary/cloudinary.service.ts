import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Course } from '../courses/schema/course.schema';
import { CoursesService } from '../courses/courses.service';
import * as crypto from 'crypto';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private coursesService: CoursesService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  generateSignature(folderPath: string) {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');

    const folder = folderPath.startsWith('courses/')
      ? folderPath                      
      : `${folderPath}`;                

    const paramsToSign: Record<string, any> = {
      timestamp,
      folder,
    };

   
    if (folderPath.startsWith('courses/')) {
      paramsToSign['resource_type'] = 'video';
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret as string,
    );

    return { signature, timestamp, apiKey, cloudName };
  }

  //  NEW 
  async deleteAsset(
    publicId: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<{ success: boolean }> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      this.logger.log(`Deleted Cloudinary asset: ${publicId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete asset: ${publicId}`, error);
      return { success: false };
    }
  }
  

  verifyWebhookSignature(
    body: Record<string, unknown>,
    signature: string,
    timestamp: string,
  ): boolean {
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    if (!apiSecret) return false;

    const payload = JSON.stringify(body);
    const expectedSignature = crypto
      .createHash('sha1')
      .update(payload + timestamp + apiSecret)
      .digest('hex');

    try {
      if (
        cloudinary.utils.verifyNotificationSignature(
          payload,
          Number(timestamp),
          signature,
        )
      ) {
        return true;
      }
    } catch {
      // fall through to manual check
    }

    return expectedSignature === signature;
  }

  async processUploadWebhook(payload: Record<string, unknown>) {
    const public_id = payload.public_id as string | undefined;
    const secure_url = payload.secure_url as string | undefined;
    const duration = payload.duration as number | undefined;
    if (!public_id) return;

    const pathParts = public_id.split('/');
    const courseIndex   = pathParts.indexOf('courses');
    const sectionsIndex = pathParts.indexOf('sections');
    const lessonsIndex  = pathParts.indexOf('lessons');

    if (
      courseIndex === -1 ||
      sectionsIndex === -1 ||
      lessonsIndex === -1 ||
      lessonsIndex + 1 >= pathParts.length
    ) {
      this.logger.warn(`Could not extract IDs from public_id: ${public_id}`);
      return;
    }

    const courseId  = pathParts[courseIndex + 1];
    const sectionId = pathParts[sectionsIndex + 1];
    const lessonId  = pathParts[lessonsIndex + 1];

    if (
      !Types.ObjectId.isValid(courseId) ||
      !Types.ObjectId.isValid(sectionId) ||
      !Types.ObjectId.isValid(lessonId)
    ) {
      this.logger.warn(`Invalid ObjectIds from public_id: ${public_id}`);
      return;
    }

    try {
      const updated = await this.courseModel.updateOne(
        { _id: new Types.ObjectId(courseId) },
        {
          $set: {
            'sections.$[s].lessons.$[l].videoUrl':       secure_url,
            'sections.$[s].lessons.$[l].videoPublicId':  public_id,
            'sections.$[s].lessons.$[l].videoDuration':  duration || 0,
          },
        },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
        },
      );

      if (updated.modifiedCount > 0) {
        this.logger.log(`Updated lesson ${lessonId} with video ${public_id}`);
        await this.coursesService.syncMetadata(courseId);
      } else {
        this.logger.warn(`No lesson found to update for ${lessonId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update lesson media for ${lessonId}`, error);
    }
  }
}