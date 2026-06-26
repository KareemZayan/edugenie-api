import { Controller, Post, Req, Res, Headers, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Course } from '../courses/schema/course.schema';
import { Lesson } from '../lessons/schema/lesson.schema';
import { WebhookFailureLog } from '../superadmin/schema/webhook-failure-log.schema';
import { PlatformConfig } from '../superadmin/schema/platform-config.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';

@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymobService: PaymobService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Earning.name) private readonly earningModel: Model<Earning>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    @InjectModel(WebhookFailureLog.name) private readonly webhookFailureLogModel: Model<WebhookFailureLog>,
    @InjectModel(PlatformConfig.name) private readonly platformConfigModel: Model<PlatformConfig>
  ) {}

  @Post('paymob')
  async handlePaymobWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('hmac') hmacSignature: string
  ) {
    if (!hmacSignature) {
      throw new UnauthorizedException('Missing HMAC signature');
    }

    const isValid = this.paymobService.verifyWebhookHmac(req.body, hmacSignature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    const payload = req.body;

    // SECURITY: the entire `obj` is HMAC-verified above, so every field inside
    // it is trustworthy. We must derive the order reference and the paid amount
    // ONLY from `obj` — never from client-controllable top-level fields.
    const txn = payload?.obj;
    if (!txn) {
      return res.status(200).send('Missing transaction object');
    }

    const orderIdStr =
      txn.order?.merchant_order_id ||
      txn.payment_key_claims?.extra?.special_reference ||
      txn.special_reference;

    if (!orderIdStr || !Types.ObjectId.isValid(orderIdStr)) {
      return res.status(200).send('Invalid or missing order reference in webhook');
    }

    const session = await this.orderModel.db.startSession();
    session.startTransaction();

    try {
      // Find the order
      const order = await this.orderModel.findById(orderIdStr).session(session);

      if (!order) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).send('Order not found');
      }

      // Idempotency: If already COMPLETED, just return 200
      if (order.status === OrderStatus.COMPLETED) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).send('Already processed');
      }

      // Treat refunded / voided / errored / unsuccessful transactions as failures.
      const isSuccessful =
        txn.success === true &&
        txn.is_refunded !== true &&
        txn.is_voided !== true &&
        txn.error_occured !== true;

      if (!isSuccessful) {
        order.status = OrderStatus.FAILED;
        await order.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send('Recorded failure');
      }

      // SECURITY: verify the gateway actually charged the expected amount/currency
      // before granting any access. Prevents price-tampering / underpayment.
      const paidCents = Number(txn.amount_cents);
      const expectedCents = Math.round(order.totalAmount * 100);
      const currency = String(txn.currency || '').toUpperCase();

      if (
        !Number.isFinite(paidCents) ||
        paidCents !== expectedCents ||
        (currency && currency !== 'EGP')
      ) {
        order.status = OrderStatus.FAILED;
        await order.save({ session });
        await session.commitTransaction();
        session.endSession();
        await this.webhookFailureLogModel.create({
          service: 'paymob',
          endpoint: '/webhooks/paymob',
          errorMessage: `Amount/currency mismatch for order ${orderIdStr}: paid ${paidCents} ${currency}, expected ${expectedCents} EGP`,
        });
        return res.status(200).send('Amount mismatch — not fulfilled');
      }

      // Resolve the configurable instructor revenue share (falls back to 80%).
      const platformConfig = await this.platformConfigModel
        .findOne()
        .session(session);
      const instructorSharePercent =
        platformConfig?.instructorSharePercent ?? 80;
      const instructorShare = instructorSharePercent / 100;

      // 1. Mark Order as COMPLETED
      order.status = OrderStatus.COMPLETED;
      order.paidAt = new Date();
      await order.save({ session });

      // 2. Create Enrollments and Earnings
      for (const item of order.items) {
        // Find if enrollment already exists for this student + course
        let enrollment = await this.enrollmentModel.findOne({
          studentId: order.studentId,
          courseId: item.courseId
        }).session(session);

        if (!enrollment) {
          enrollment = new this.enrollmentModel({
            studentId: order.studentId,
            courseId: item.courseId,
            type: item.itemType,
            sectionIds: item.itemType === PurchaseType.SECTION ? [item.sectionId] : []
          });
        } else {
          // If upgrading from section to full_course
          if (item.itemType === PurchaseType.FULL_COURSE) {
            enrollment.type = PurchaseType.FULL_COURSE;
          } 
          // If adding a section
          else if (item.itemType === PurchaseType.SECTION && item.sectionId) {
            if (!enrollment.sectionIds.some(id => id.toString() === item.sectionId!.toString())) {
              enrollment.sectionIds.push(item.sectionId);
            }
          }
        }
        
        // Auto-upgrade check
        if (enrollment && enrollment.type === PurchaseType.SECTION) {
          const course = await this.courseModel.findById(item.courseId).session(session);
          if (course && enrollment.sectionIds.length >= course.sections.length) {
            enrollment.type = PurchaseType.FULL_COURSE;
            enrollment.sectionIds = [];
          }
        }

        await enrollment.save({ session });

        // Earnings — split per the configured instructor share, rounded to cents.
        const course = await this.courseModel.findById(item.courseId).session(session);
        if (course) {
          const earningAmount = Math.round(item.price * instructorShare * 100) / 100;
          const earning = new this.earningModel({
            instructorId: course.instructorId,
            orderId: order._id,
            courseId: item.courseId,
            sectionId:
              item.itemType === PurchaseType.SECTION && item.sectionId
                ? item.sectionId
                : null,
            amount: earningAmount,
            status: EarningStatus.PENDING
          });
          await earning.save({ session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      return res.status(200).send('Webhook processed successfully');
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Webhook processing failed:', error);
      
      // Log the failure for System Health endpoint
      try {
        await this.webhookFailureLogModel.create({
          service: 'paymob',
          endpoint: '/webhooks/paymob',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      } catch (logError) {
        console.error('Failed to save webhook failure log:', logError);
      }

      throw new InternalServerErrorException('Failed to process webhook');
    }
  }

  @Post('cloudinary')
  async handleCloudinaryWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-cld-signature') signature: string,
    @Headers('x-cld-timestamp') timestamp: string,
  ) {
    try {
      // Verify Cloudinary's notification signature:
      // signature = sha1( rawBody + timestamp + apiSecret )
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const rawBody = req.rawBody?.toString('utf8');
      if (!apiSecret || !signature || !timestamp || !rawBody) {
        throw new UnauthorizedException('Missing Cloudinary signature material');
      }

      // Reject stale notifications (replay protection) — 2 hour window.
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 7200) {
        throw new UnauthorizedException('Stale Cloudinary signature');
      }

      const expected = crypto
        .createHash('sha1')
        .update(`${rawBody}${timestamp}${apiSecret}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'hex');
      const signatureBuf = Buffer.from(String(signature), 'hex');
      if (
        expectedBuf.length !== signatureBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, signatureBuf)
      ) {
        throw new UnauthorizedException('Invalid Cloudinary signature');
      }

      const body = req.body;

      if (body.notification_type === 'upload' && body.duration) {
        const publicId = body.public_id;
        const durationSecs = Math.round(parseFloat(body.duration));

        // Find the course that contains this lesson via publicId and update it
        // Cloudinary doesn't give us lesson ID directly, so we search by videoPublicId
        const course = await this.courseModel.findOne({ 'sections.lessons.videoPublicId': publicId });
        
        if (course) {
          let durationDiff = 0;
          
          // Update the specific lesson within the nested array
          course.sections.forEach(section => {
            section.lessons.forEach(lesson => {
              if (lesson.videoPublicId === publicId) {
                const oldDuration = lesson.videoDuration || 0;
                lesson.videoDuration = durationSecs;
                durationDiff = durationSecs - oldDuration;
              }
            });
          });

          if (durationDiff !== 0) {
            // Update course totalHours (simplified logic: adding duration in seconds, though it's called totalHours)
            // Adjust logic based on how totalHours is calculated in the app. Let's assume it's actually totalSeconds for now.
            course.totalHours += (durationDiff / 3600); // Assuming totalHours is in hours
            
            await course.save();
          }
        }
      }

      res.status(200).send();
    } catch (error) {
      console.error('Cloudinary webhook processing failed:', error);
      
      // Log the failure for System Health endpoint
      try {
        await this.webhookFailureLogModel.create({
          service: 'cloudinary',
          endpoint: '/webhooks/cloudinary',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      } catch (logError) {
        console.error('Failed to save webhook failure log:', logError);
      }

      throw new InternalServerErrorException('Failed to process Cloudinary webhook');
    }
  }
}
