import {
  Controller,
  Post,
  Req,
  Res,
  InternalServerErrorException,
  UseInterceptors,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Model } from 'mongoose';

import { Course } from '../courses/schema/course.schema';
import { WebhookFailureLog } from '../superadmin/schema/webhook-failure-log.schema';

/**
 * Payment fulfillment moved to the Stripe webhook (POST /api/payments/webhook,
 * PaymentsService.fulfillCheckout) when the platform switched to Stripe Connect.
 * This controller now only handles the unsigned Cloudinary duration sync.
 */
@SkipThrottle()
@Controller('webhooks')
@ApiTags('Webhooks')
export class WebhooksController {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(WebhookFailureLog.name)
    private readonly webhookFailureLogModel: Model<WebhookFailureLog>,
  ) {}

  @Post('cloudinary')
  @UseInterceptors()
  @ApiExcludeEndpoint()
  async handleCloudinaryWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    try {
      const body = req.body;

      // ── Handle video upload completion ──────────────────────────
      if (body.notification_type === 'upload' && body.duration) {
        const publicId = body.public_id;
        const durationSecs = Math.round(parseFloat(body.duration));

        const course = await this.courseModel.findOne({
          'sections.lessons.videoPublicId': publicId,
        });

        if (course) {
          let durationDiff = 0;
          course.sections.forEach((section) => {
            section.lessons.forEach((lesson) => {
              if (lesson.videoPublicId === publicId) {
                const oldDuration = lesson.videoDuration || 0;
                lesson.videoDuration = durationSecs;
                durationDiff = durationSecs - oldDuration;
              }
            });
          });
          if (durationDiff !== 0) {
            course.totalHours += durationDiff / 3600;
            await course.save();
          }
        }
      }

      // Transcription completion is handled solely by the SIGNED endpoint
      // POST /api/cloudinary/webhook (CloudinaryService.processTranscriptionWebhook),
      // which also re-indexes RAG and holds transcripts that arrive before their
      // lesson exists. This unsigned endpoint only syncs video duration.

      res.status(200).send();
    } catch (error) {
      console.error('Cloudinary webhook processing failed:', error);
      try {
        await this.webhookFailureLogModel.create({
          service: 'cloudinary',
          endpoint: '/webhooks/cloudinary',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (logError) {
        console.error('Failed to save webhook failure log:', logError);
      }
      throw new InternalServerErrorException(
        'Failed to process Cloudinary webhook',
      );
    }
  }
}
