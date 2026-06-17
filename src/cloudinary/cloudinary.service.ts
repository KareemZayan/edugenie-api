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

  generateSignature(folderPath: string, context?: string) {
    const timestamp = Math.round(Date.now() / 1000);
  
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
  
    const paramsToSign: Record<string, any> = {
      timestamp,
      folder: folderPath,
    };
  
    if (context) {
      paramsToSign.context = context;
    }
  
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret as string,
    );
  
    return { signature, timestamp, apiKey, cloudName };
  }

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
    body: any,
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

  async processUploadWebhook(payload: any) {
    const { public_id, secure_url, duration, context } = payload;

    if (!public_id) return;

    // ✅ NEW: get IDs from context instead of parsing
    const courseId = context?.courseId;
    const sectionId = context?.sectionId;
    const lessonId = context?.lessonId;

    if (!courseId || !sectionId || !lessonId) {
      this.logger.warn(`Missing context in Cloudinary webhook`);
      return;
    }

    if (
      !Types.ObjectId.isValid(courseId) ||
      !Types.ObjectId.isValid(sectionId) ||
      !Types.ObjectId.isValid(lessonId)
    ) {
      this.logger.warn(`Invalid ObjectIds in webhook context`);
      return;
    }

    try {
      const updated = await this.courseModel.updateOne(
        { _id: new Types.ObjectId(courseId) },
        {
          $set: {
            'sections.$[s].lessons.$[l].videoUrl': secure_url,
            'sections.$[s].lessons.$[l].videoPublicId': public_id,
            'sections.$[s].lessons.$[l].videoDuration': duration || 0,
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
        this.logger.log(`Updated lesson ${lessonId}`);
        await this.coursesService.syncMetadata(courseId);
      } else {
        this.logger.warn(`No lesson found for ${lessonId}`);
      }
    } catch (error) {
      this.logger.error(`Webhook update failed`, error);
    }
  }
}
