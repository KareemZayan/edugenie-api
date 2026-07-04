import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Course } from '../courses/schema/course.schema';
import { CoursesService } from '../courses/courses.service';
import { IndexingService } from '../rag/indexing.service';
import { PendingTranscript } from './schema/pending-transcript.schema';
import * as crypto from 'crypto';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(PendingTranscript.name)
    private pendingTranscriptModel: Model<PendingTranscript>,
    private coursesService: CoursesService,
    private readonly indexing: IndexingService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Sign a direct Cloudinary upload. When `transcribe` is set (lesson videos
   * only), the google_speech add-on is requested ON THE ORIGINAL UPLOAD via
   * `raw_convert` — so transcription runs in the same pass, with no second
   * full-video round-trip, no duplicate `_transcribed_` asset, and no delete.
   * Completion is delivered to `CLOUDINARY_WEBHOOK_URL` (per-upload, so avatar/
   * thumbnail/attachment uploads never hit the transcript webhook).
   *
   * Cloudinary signs every param except file/api_key/resource_type/cloud_name/
   * signature, so the frontend MUST append the returned `raw_convert` /
   * `notification_url` strings verbatim or the signature won't match.
   */
  generateSignature(folderPath: string, context?: string, transcribe?: boolean) {
    const timestamp = Math.round(Date.now() / 1000);

    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const notificationUrl = this.configService.get<string>(
      'CLOUDINARY_WEBHOOK_URL',
    );

    const paramsToSign: Record<string, any> = {
      timestamp,
      folder: folderPath,
    };

    if (context) {
      paramsToSign.context = context;
    }

    let rawConvert = '';
    if (transcribe) {
      rawConvert = 'google_speech';
      paramsToSign.raw_convert = rawConvert;
      if (notificationUrl) {
        paramsToSign.notification_url = notificationUrl;
      }
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
      // Echo back the EXACT signed strings so the frontend appends them
      // byte-for-byte to the upload FormData.
      raw_convert: rawConvert,
      notification_url: transcribe && notificationUrl ? notificationUrl : '',
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
        // Transcription is now requested on the ORIGINAL signed upload
        // (raw_convert=google_speech), so there is nothing to trigger here —
        // its completion arrives separately via processTranscriptionWebhook.
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
    // lesson ids through the webhook — the signed upload stored this asset id on
    // the lesson, so it is a unique handle back to the right lesson.
    const result = await this.courseModel.updateOne(
      { 'sections.lessons.videoPublicId': publicId },
      {
        $set: {
          'sections.$[].lessons.$[l].transcript': status.transcriptText,
          'sections.$[].lessons.$[l].transcriptStatus': 'ready',
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

    // No lesson references this asset yet — the completion webhook beat the
    // course-builder's lesson-create. Hold the transcript keyed by publicId so
    // addLesson/updateLesson can adopt it once the lesson exists. TTL cleans up
    // holds whose lesson is never created.
    await this.pendingTranscriptModel.updateOne(
      { videoPublicId: publicId },
      { $set: { transcript: status.transcriptText, createdAt: new Date() } },
      { upsert: true },
    );
    this.logger.log(
      `No lesson yet for ${publicId}; held transcript in PendingTranscript`,
    );
    return false;
  }

  /**
   * Adopt a transcript for a lesson that was just created/updated to reference
   * `publicId`. Fast path: if the completion webhook already landed and parked
   * the transcript in PendingTranscript, write it straight onto the lesson (no
   * Cloudinary call). Otherwise fall back to fetching from Cloudinary. Either
   * way the lesson is updated + re-indexed if the transcript is ready. Called
   * (fire-and-forget) from addLesson/updateLesson.
   */
  async adoptTranscriptForPublicId(publicId: string): Promise<boolean> {
    const held = await this.pendingTranscriptModel
      .findOneAndDelete({ videoPublicId: publicId })
      .lean<{ transcript?: string } | null>()
      .exec();

    if (held?.transcript) {
      const result = await this.courseModel.updateOne(
        { 'sections.lessons.videoPublicId': publicId },
        {
          $set: {
            'sections.$[].lessons.$[l].transcript': held.transcript,
            'sections.$[].lessons.$[l].transcriptStatus': 'ready',
          },
        },
        { arrayFilters: [{ 'l.videoPublicId': publicId }] },
      );

      if (result.modifiedCount > 0) {
        const course = await this.courseModel
          .findOne({ 'sections.lessons.videoPublicId': publicId })
          .select('_id')
          .lean<{ _id: Types.ObjectId } | null>()
          .exec();
        if (course) await this.indexing.onTranscriptSaved(course._id.toString());
        this.logger.log(`Adopted held transcript for ${publicId}`);
        return true;
      }

      // Lesson vanished/changed between hold and adoption — re-park the hold so
      // a late-arriving lesson can still pick it up.
      await this.pendingTranscriptModel.updateOne(
        { videoPublicId: publicId },
        { $set: { transcript: held.transcript, createdAt: new Date() } },
        { upsert: true },
      );
      return false;
    }

    // Nothing held yet — the webhook may not have arrived. Try Cloudinary
    // directly; persistTranscriptForPublicId saves it if ready (and re-holds if
    // the lesson isn't matchable, which shouldn't happen here).
    return this.persistTranscriptForPublicId(publicId);
  }

  /**
   * Re-run google_speech transcription IN PLACE on an already-uploaded video,
   * without re-uploading or creating a duplicate asset — used only by the
   * manual "retry transcription" endpoint. `explicit()` applies the add-on to
   * the existing asset; completion arrives via processTranscriptionWebhook.
   */
  async retryTranscription(
    publicId: string,
    courseId: string,
    sectionId: string,
    lessonId: string,
  ): Promise<{ queued: boolean }> {
    try {
      const notificationUrl =
        this.configService.get<string>('CLOUDINARY_WEBHOOK_URL');

      await cloudinary.uploader.explicit(publicId, {
        type: 'upload',
        resource_type: 'video',
        raw_convert: 'google_speech',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      } as any);

      // Reflect that a transcript is (re)generating for this lesson.
      await this.courseModel.updateOne(
        { _id: new Types.ObjectId(courseId) },
        {
          $set: {
            'sections.$[s].lessons.$[l].transcriptStatus': 'pending',
          },
        },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
        },
      );

      this.logger.log(`Re-queued transcription in place for ${publicId}`);
      return { queued: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to retry transcription for ${publicId}:`,
        error?.message || error,
      );
      return { queued: false };
    }
  }

  async testTranscription(publicId: string) {
    try {
      const notificationUrl = this.configService.get<string>('CLOUDINARY_WEBHOOK_URL');

      const result = await cloudinary.uploader.explicit(publicId, {
        type: 'upload',
        resource_type: 'video',
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