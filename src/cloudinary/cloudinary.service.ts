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

    const folder = `courses/${folderPath}`;

    const paramsToSign = {
      timestamp,
      folder,
      resource_type: 'video',
      raw_convert: 'google_speech',
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret as string,
    );

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      raw_convert: 'google_speech',
    };
  }

  verifyWebhookSignature(body: any, signature: string, timestamp: string): boolean {
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    if (!apiSecret) return false;

    // Use JSON stringified payload as fallback since NestJS parses raw body
    const payload = JSON.stringify(body);
    const expectedSignature = crypto
      .createHash('sha1')
      .update(payload + timestamp + apiSecret)
      .digest('hex');

    try {
      if (cloudinary.utils.verifyNotificationSignature(payload, Number(timestamp), signature)) {
        return true;
      }
    } catch (error) {
      // Fallback to manual verification
    }

    return expectedSignature === signature;
  }

  async processUploadWebhook(payload: any) {
    const { public_id, secure_url, duration } = payload;

    if (!public_id) return;

    // Expected folder structure in public_id: courses/courseId/sections/sectionId/lessons/lessonId/filename
    const pathParts = public_id.split('/');
    
    const courseIndex = pathParts.indexOf('courses');
    const sectionsIndex = pathParts.indexOf('sections');
    const lessonsIndex = pathParts.indexOf('lessons');

    if (
      courseIndex === -1 ||
      sectionsIndex === -1 ||
      lessonsIndex === -1 ||
      lessonsIndex + 1 >= pathParts.length
    ) {
      this.logger.warn(`Could not extract IDs from public_id: ${public_id}`);
      return;
    }

    const courseId = pathParts[courseIndex + 1];
    const sectionId = pathParts[sectionsIndex + 1];
    const lessonId = pathParts[lessonsIndex + 1];

    if (
      !Types.ObjectId.isValid(courseId) ||
      !Types.ObjectId.isValid(sectionId) ||
      !Types.ObjectId.isValid(lessonId)
    ) {
      this.logger.warn(`Invalid ObjectIds extracted from public_id: ${public_id}`);
      return;
    }

    try {
      // Update the specific lesson's media fields using array filters
      const updateFields: Record<string, any> = {
        'sections.$[s].lessons.$[l].videoUrl': secure_url,
        'sections.$[s].lessons.$[l].videoPublicId': public_id,
        'sections.$[s].lessons.$[l].videoDuration': duration || 0,
      };

      const updated = await this.courseModel.updateOne(
        { _id: new Types.ObjectId(courseId) },
        { $set: updateFields },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
        },
      );

      if (updated.modifiedCount > 0) {
        this.logger.log(`Successfully updated lesson ${lessonId} with video ${public_id}`);
        // Re-calculate the total videos and course duration hours
        await this.coursesService.syncMetadata(courseId);
      } else {
        this.logger.warn(`No lesson found to update for ${lessonId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update lesson media for ${lessonId}`, error);
    }
  }

  async getTranscriptionStatus(publicId: string): Promise<{
    videoReady: boolean;
    transcriptReady: boolean;
    transcriptText: string | null;
  }> {
    let videoReady = false;
    let transcriptReady = false;
    let transcriptText: string | null = null;

    try {
      const videoResource = await cloudinary.api.resource(publicId, { resource_type: 'video' });
      if (videoResource) {
        videoReady = true;
      }
    } catch (error: any) {
      this.logger.error(`Failed to check video resource ${publicId}:`, error?.message || error);
    }

    try {
      const rawResource = await cloudinary.api.resource(`${publicId}.transcript`, { resource_type: 'raw' });
      if (rawResource && rawResource.secure_url) {
        const response = await fetch(rawResource.secure_url);
        if (response.ok) {
          const text = await response.text();
          if (text && text.trim() !== '') {
            const json = JSON.parse(text);
            transcriptReady = true;
            // Extract transcript text
            if (Array.isArray(json)) {
              transcriptText = json.map((res: any) => res.transcript || '').join(' ').trim();
            } else if (json && json.results && Array.isArray(json.results)) {
              const parts = json.results.map((res: any) => {
                if (res.alternatives && res.alternatives.length > 0 && res.alternatives[0].transcript) {
                  return res.alternatives[0].transcript;
                }
                return '';
              });
              transcriptText = parts.join(' ').trim();
            } else {
              transcriptText = JSON.stringify(json);
            }
          }
        }
      }
    } catch (error: any) {
      // 404 means the transcript is not ready yet, this is normal behavior.
    }

    return { videoReady, transcriptReady, transcriptText };
  }
}
