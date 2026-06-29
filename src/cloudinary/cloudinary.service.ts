import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Course } from '../courses/schema/course.schema';
import { CoursesService } from '../courses/courses.service';
import { IndexingService } from '../rag/indexing.service';
import * as crypto from 'crypto';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private coursesService: CoursesService,
    private readonly indexing: IndexingService,
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
   resourceType: 'image' | 'video' | 'raw' = 'image',
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
    body: string | Record<string, unknown>,
    signature: string,
    timestamp: string,
  ): boolean {
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    if (!apiSecret) return false;

    // Prefer the raw request body (exact bytes Cloudinary signed); only fall
    // back to re-serializing the parsed object when the raw body is absent.
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
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
   * Persist a transcript when Cloudinary notifies us that a raw_convert add-on
   * (google_speech) has finished. This is browser- and timer-independent, so it
   * works on serverless even after the instructor has left the course builder —
   * unlike the in-process poll (killed when the function suspends) and the
   * dashboard foreground poll (stops when the page unmounts).
   */
  async processTranscriptionWebhook(payload: Record<string, unknown>) {
    const publicId = payload.public_id as string | undefined;
    const info = payload.info as { kind?: string; status?: string } | undefined;
    const infoKind = (payload.info_kind ?? info?.kind) as string | undefined;
    const infoStatus = (payload.info_status ?? info?.status) as string | undefined;

    if (!publicId) {
      this.logger.warn('Transcription webhook missing public_id');
      return;
    }
    // Only act on speech-to-text completions; ignore other add-on kinds/states.
    if (infoKind && infoKind !== 'google_speech') return;
    if (
      infoStatus &&
      !['complete', 'completed', 'success'].includes(infoStatus.toLowerCase())
    ) {
      return;
    }

    await this.persistTranscriptForPublicId(publicId);
  }

  /**
   * Fetch the generated transcript for a video asset and write it onto whichever
   * lesson currently references that videoPublicId. Returns true if a lesson was
   * updated. Shared by the webhook handler and the in-process poll fallback.
   */
  private async persistTranscriptForPublicId(
    publicId: string,
  ): Promise<boolean> {
    const status = await this.getTranscriptionStatus(publicId);
    if (!status.transcriptReady || !status.transcriptText) {
      this.logger.warn(`Transcript not ready/parseable yet for ${publicId}`);
      return false;
    }

    // Match the lesson by videoPublicId rather than threading course/section/
    // lesson ids through the webhook — triggerTranscription already stored this
    // asset id on the lesson, so it is a unique handle back to the right lesson.
    const result = await this.courseModel.updateOne(
      { 'sections.lessons.videoPublicId': publicId },
      {
        $set: {
          'sections.$[].lessons.$[l].transcript': status.transcriptText,
        },
      },
      { arrayFilters: [{ 'l.videoPublicId': publicId }] },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Saved transcript for asset ${publicId} via webhook`);
      // A transcript landed → (re)index that course's content chunks for RAG.
      const course = await this.courseModel
        .findOne({ 'sections.lessons.videoPublicId': publicId })
        .select('_id')
        .lean<{ _id: Types.ObjectId } | null>()
        .exec();
      if (course) await this.indexing.onTranscriptSaved(course._id.toString());
      return true;
    }
    this.logger.warn(
      `No lesson found with videoPublicId ${publicId} to save transcript`,
    );
    return false;
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
      const folderPath = publicId.substring(0, publicId.lastIndexOf('/'));
      const newPublicId = `${publicId}_transcribed_${Date.now()}`;

      const result = await cloudinary.uploader.upload(existing.secure_url, {
        resource_type: 'video',
        type: 'upload',
        public_id: newPublicId,
        asset_folder: folderPath,
        raw_convert: 'google_speech',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      } as any);

      if (result?.secure_url && result?.public_id) {
        await this.courseModel.updateOne(
          { _id: new Types.ObjectId(courseId) },
          {
            $set: {
              'sections.$[s].lessons.$[l].videoUrl': result.secure_url,
              'sections.$[s].lessons.$[l].videoPublicId': result.public_id,
            },
          },
          {
            arrayFilters: [
              { 's._id': new Types.ObjectId(sectionId) },
              { 'l._id': new Types.ObjectId(lessonId) },
            ],
          },
        );

        cloudinary.uploader.destroy(publicId, { resource_type: 'video' }).catch(() => { });

        // NEW: poll internally until the transcript is ready, then save it ourselves
        this.pollAndSaveTranscript(result.public_id, courseId, sectionId, lessonId);
      }

      this.logger.log(`Triggered transcription via new asset ${newPublicId}: ${JSON.stringify(result?.info)}`);
      return { queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to trigger transcription for ${publicId}:`, error?.message || error);
      return { queued: false };
    }
  }

  private async pollAndSaveTranscript(
    publicId: string,
    courseId: string,
    sectionId: string,
    lessonId: string,
    attempt = 0,
  ): Promise<void> {
    const MAX_ATTEMPTS = 20;       // ~20 * 10s = ~3.3 minutes max
    const INTERVAL_MS = 10_000;

    if (attempt >= MAX_ATTEMPTS) {
      this.logger.warn(`Gave up polling transcript for ${publicId} after ${MAX_ATTEMPTS} attempts`);
      return;
    }

    const status = await this.getTranscriptionStatus(publicId);

    if (status.transcriptReady && status.transcriptText) {
      await this.courseModel.updateOne(
        { _id: new Types.ObjectId(courseId) },
        {
          $set: {
            'sections.$[s].lessons.$[l].transcript': status.transcriptText,
          },
        },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
        },
      );
      this.logger.log(`Saved transcript for lesson ${lessonId}`);
      // A transcript landed → (re)index that course's content chunks for RAG.
      await this.indexing.onTranscriptSaved(courseId);
      return;
    }

    setTimeout(
      () => this.pollAndSaveTranscript(publicId, courseId, sectionId, lessonId, attempt + 1),
      INTERVAL_MS,
    );
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
    const transcriptPublicId = `${publicId}.transcript`;

    try {
      const resource = await cloudinary.api.resource(transcriptPublicId, {
        resource_type: 'raw',
        type: 'upload',
      });

      const response = await fetch(resource.secure_url); // now has the version baked in

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
    } catch (err: any) {
      if (err?.http_code === 404 || err?.error?.http_code === 404) {
        // transcript not generated yet — normal "still processing" case
        return { videoReady: true, transcriptReady: false, transcriptText: null };
      }
      this.logger.warn(`Transcript fetch failed for ${publicId}:`, err?.message || err);
    }

    return { videoReady: true, transcriptReady: false, transcriptText: null };
  }

}