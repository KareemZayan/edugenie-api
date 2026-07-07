import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Course } from '../courses/schema/course.schema';
import { CoursesService } from '../courses/courses.service';
import { IndexingService } from '../rag/indexing.service';
import { TRANSCRIPTION_PROVIDER } from '../ai/transcription.provider';
import type { TranscriptionProvider } from '../ai/transcription.provider';
import { PendingTranscript } from './schema/pending-transcript.schema';
import * as crypto from 'crypto';

type TranscriptStatus = 'pending' | 'ready' | 'failed';

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
    @Inject(TRANSCRIPTION_PROVIDER)
    private readonly transcription: TranscriptionProvider,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Sign a direct Cloudinary upload. When `transcribe` is set (lesson videos
   * only), the signed `notification_url` (CLOUDINARY_WEBHOOK_URL) is attached so
   * Cloudinary fires the upload webhook when the video finishes — that webhook
   * invocation runs Gemini transcription (see processUploadWebhook). Per-upload,
   * so avatar/thumbnail/attachment uploads never hit the transcript path.
   *
   * Cloudinary signs every param except file/api_key/resource_type/cloud_name/
   * signature, so the frontend MUST append the returned `notification_url`
   * string verbatim or the signature won't match.
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
    if (transcribe && notificationUrl) {
      paramsToSign.notification_url = notificationUrl;
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
      // raw_convert is no longer used (Gemini is the transcript source); kept in
      // the response shape only for frontend backward-compat.
      raw_convert: '',
      // Echo the EXACT signed string so the frontend appends it byte-for-byte.
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
   * Cloudinary upload-complete webhook. Saves the lesson's video metadata (when
   * a real lesson context is present) and then transcribes the audio via Gemini
   * — inside this webhook invocation, which is serverless-safe. Transcription is
   * keyed by videoPublicId, so it works even if the lesson row doesn't exist yet
   * (the transcript parks in PendingTranscript and is adopted on lesson create).
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

    // Update the lesson's video metadata when we have a valid lesson context.
    if (
      courseId &&
      sectionId &&
      lessonId &&
      Types.ObjectId.isValid(courseId) &&
      Types.ObjectId.isValid(sectionId) &&
      Types.ObjectId.isValid(lessonId)
    ) {
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
          await this.coursesService.syncMetadata(courseId);
        }
      } catch (error) {
        this.logger.error(`Webhook video-metadata update failed`, error);
      }
    }

    // Transcribe the uploaded video's audio via Gemini (best-effort).
    await this.transcribeAndSave(public_id);
  }

  /**
   * Build an audio-only Cloudinary delivery URL for a video public id: 64 kbps
   * MP3. Much smaller than the video (~1.4 MB vs many MB), so it fetches fast and
   * fits inline for Gemini. No stored version needed — Cloudinary serves the
   * latest asset. NOTE: `f_mp3,br_64k` only — `ac_1` (mono) is rejected by
   * Cloudinary here with HTTP 400, so it is intentionally omitted.
   */
  private audioUrlFor(publicId: string): string {
    const cloud = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const path = publicId
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `https://res.cloudinary.com/${cloud}/video/upload/f_mp3,br_64k/${path}.mp3`;
  }

  /**
   * Transcribe a lesson video's audio via Gemini and persist the result. Keyed
   * by videoPublicId. `force` bypasses the "already transcribed" short-circuit
   * (used by the manual Regenerate action; webhook retries keep force=false so a
   * re-delivered upload webhook doesn't re-spend quota).
   */
  async transcribeAndSave(publicId: string, force = false): Promise<void> {
    if (!this.transcription.isConfigured) {
      this.logger.warn('GEMINI_API_KEY not set — skipping transcription');
      return;
    }
    // Whether a good transcript already exists — so a FAILED force-regen doesn't
    // downgrade a healthy lesson to 'failed' (its segments/text stay intact).
    const hadReady = force && (await this.hasReadyTranscript(publicId));
    if (!force && (await this.hasReadyTranscript(publicId))) {
      return;
    }
    try {
      await this.markTranscriptStatus(publicId, 'pending');
      const audioUrl = this.audioUrlFor(publicId);
      const segments = await this.transcription.transcribeSegments(audioUrl);
      const text = segments
        .map((s) => s.text)
        .join(' ')
        .trim();
      await this.saveTranscriptText(publicId, text, segments);
    } catch (err: any) {
      this.logger.warn(
        `Gemini transcription failed for ${publicId}: ${err?.message || err}`,
      );
      // Restore the prior 'ready' state on a failed re-gen; only mark 'failed'
      // when there was no usable transcript to begin with.
      await this.markTranscriptStatus(publicId, hadReady ? 'ready' : 'failed');
    }
  }

  /**
   * Write a transcript string onto whichever lesson references `publicId`, set
   * `transcriptStatus:'ready'`, and re-index for RAG. Empty text → 'failed'.
   * If no lesson matches yet (webhook beat lesson-create), park in
   * PendingTranscript for adoption. This is the single save funnel — reused by
   * the Gemini path and by adoptTranscriptForPublicId.
   */
  async saveTranscriptText(
    publicId: string,
    text: string,
    segments?: { start: number; text: string }[],
  ): Promise<boolean> {
    const transcript = (text || '').trim();
    if (!transcript) {
      await this.markTranscriptStatus(publicId, 'failed');
      this.logger.warn(`Empty transcript for ${publicId} — marked failed`);
      return false;
    }

    // Only persist segments when they're time-coded and cover the transcript;
    // a lone fallback segment (start 0) adds no seek value, so store text only.
    const timed =
      segments && segments.length > 1 ? segments : undefined;

    const result = await this.courseModel.updateOne(
      { 'sections.lessons.videoPublicId': publicId },
      {
        $set: {
          'sections.$[].lessons.$[l].transcript': transcript,
          'sections.$[].lessons.$[l].transcriptSegments': timed,
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
      this.logger.log(`Saved transcript for ${publicId}`);
      return true;
    }

    // No lesson references this asset yet — park it; adopted on lesson create.
    await this.pendingTranscriptModel.updateOne(
      { videoPublicId: publicId },
      { $set: { transcript, transcriptSegments: timed, createdAt: new Date() } },
      { upsert: true },
    );
    this.logger.log(`No lesson yet for ${publicId} — parked transcript`);
    return false;
  }

  /**
   * Adopt a parked transcript for a lesson that now references `publicId`
   * (called from addLesson/updateLesson). Routes through the shared save funnel.
   */
  async adoptTranscriptForPublicId(publicId: string): Promise<boolean> {
    const held = await this.pendingTranscriptModel
      .findOneAndDelete({ videoPublicId: publicId })
      .lean<{
        transcript?: string;
        transcriptSegments?: { start: number; text: string }[];
      } | null>()
      .exec();
    if (!held?.transcript) return false;
    return this.saveTranscriptText(
      publicId,
      held.transcript,
      held.transcriptSegments,
    );
  }

  /**
   * Manual re-run of transcription for an already-uploaded lesson video.
   * Exposed at POST /cloudinary/trigger-transcription (dashboard "Regenerate").
   * `force` so it re-transcribes even if a transcript already exists.
   */
  async retryTranscription(
    publicId: string,
    _courseId?: string,
    _sectionId?: string,
    _lessonId?: string,
  ): Promise<{ queued: boolean }> {
    await this.transcribeAndSave(publicId, true);
    return { queued: true };
  }

  /** Set transcriptStatus on the lesson referencing this asset (best-effort). */
  private async markTranscriptStatus(
    publicId: string,
    status: TranscriptStatus,
  ): Promise<void> {
    await this.courseModel
      .updateOne(
        { 'sections.lessons.videoPublicId': publicId },
        { $set: { 'sections.$[].lessons.$[l].transcriptStatus': status } },
        { arrayFilters: [{ 'l.videoPublicId': publicId }] },
      )
      .catch(() => undefined);
  }

  /** True if a lesson referencing this asset already has a ready transcript. */
  private async hasReadyTranscript(publicId: string): Promise<boolean> {
    const doc = await this.courseModel
      .findOne({
        'sections.lessons': {
          $elemMatch: { videoPublicId: publicId, transcriptStatus: 'ready' },
        },
      })
      .select('_id')
      .lean()
      .exec();
    return !!doc;
  }
}
