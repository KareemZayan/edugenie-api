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
      // raw_convert removed — transcription is now triggered explicitly,
      // after the lesson exists, via triggerTranscription()
    };

    if (context) {
      paramsToSign.context = context;
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret as string,
    );
    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      raw_convert: '', // no longer sent for signing; kept in shape only if frontend still reads it
    };
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

  /**
   * Process the Cloudinary webhook when a video upload completes.
   * Updates the lesson with video data and triggers transcription.
   */
  async processUploadWebhook(payload: Record<string, unknown>) {
    const public_id = payload.public_id as string | undefined;
    const secure_url = payload.secure_url as string | undefined;
    const duration = payload.duration as number | undefined;
    const context = payload.context as Record<string, string> | undefined;
    if (!public_id) return;

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
        this.logger.log(`Updated lesson ${lessonId} with video data`);
        await this.coursesService.syncMetadata(courseId);

        // Trigger transcription for the newly uploaded video
        // This handles the case where transcription wasn't set up at upload time
        // (e.g., when draft IDs were used)
        try {
          await this.triggerTranscription(public_id, courseId, sectionId, lessonId);
        } catch (transcribeError) {
          // Non-blocking - transcription is a best-effort feature
          this.logger.warn(`Failed to trigger transcription for lesson ${lessonId}:`, transcribeError);
        }
      } else {
        this.logger.warn(`No lesson found for ${lessonId}`);
      }
    } catch (error) {
      this.logger.error(`Webhook update failed`, error);
    }
  }

  /**
   * Retroactively schedule google_speech transcription on an already-uploaded
   * Cloudinary video. Called after addLesson/updateLesson when we finally have
   * a real lessonId that was not available at upload time (draft system).
   */
  async triggerTranscription(
    publicId: string,
    courseId: string,
    sectionId: string,
    lessonId: string,
  ): Promise<{ queued: boolean }> {
    try {
      const notificationUrl = this.configService.get<string>('CLOUDINARY_WEBHOOK_URL');
      const existing = await cloudinary.api.resource(publicId, { resource_type: 'video' });

      const result = await cloudinary.uploader.upload(existing.secure_url, {
        resource_type: 'video',
        type: 'upload',
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        raw_convert: 'google_speech',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      } as any);

      this.logger.log(`Triggered transcription for ${publicId}: ${JSON.stringify(result?.info)}`);
      return { queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to trigger transcription for ${publicId}:`, error?.message || error);
      return { queued: false };
    }
  }

  async testTranscription(publicId: string) {
    try {
      const notificationUrl = this.configService.get<string>('CLOUDINARY_WEBHOOK_URL');
      const existing = await cloudinary.api.resource(publicId, { resource_type: 'video' });

      const result = await cloudinary.uploader.upload(existing.secure_url, {
        resource_type: 'video',
        type: 'upload',
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        raw_convert: 'google_speech',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      } as any);

      return { success: true, result };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message,
        http_code: error?.http_code,
        error: JSON.stringify(error),
      };
    }
  }

  async getTranscriptionStatus(publicId: string): Promise<{
    videoReady: boolean;
    transcriptReady: boolean;
    transcriptText: string | null;
  }> {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const transcriptUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}.transcript`;

    try {
      const response = await fetch(transcriptUrl);

      if (response.status === 404) {
        return { videoReady: true, transcriptReady: false, transcriptText: null };
      }

      if (response.ok) {
        const json = await response.json() as any;
        let transcriptText: string | null = null;

        if (Array.isArray(json)) {
          transcriptText = json
            .map((r: any) => r.transcript || r.alternatives?.[0]?.transcript || '')
            .filter(Boolean)
            .join(' ')
            .trim() || null;
        } else if (json?.results && Array.isArray(json.results)) {
          transcriptText = json.results
            .map((r: any) => r.alternatives?.[0]?.transcript || '')
            .filter(Boolean)
            .join(' ')
            .trim() || null;
        }

        if (transcriptText) {
          return { videoReady: true, transcriptReady: true, transcriptText };
        }
      }
    } catch (err) {
      this.logger.warn(`Transcript fetch failed for ${publicId}:`, err);
    }

    return { videoReady: true, transcriptReady: false, transcriptText: null };
  }

}