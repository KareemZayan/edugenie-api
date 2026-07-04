import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  UnauthorizedException,
  InternalServerErrorException,
  UseInterceptors,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';

import { PaymobService } from '../paymob/paymob.service';
import { CartService } from '../cart/cart.service';
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
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { STUDENT_MILESTONES } from '../common/constants/milestones.constant';
import { QuizzesService } from '../quizzes/quizzes.service';

@SkipThrottle()
@Controller('webhooks')
@ApiTags('Webhooks')
export class WebhooksController {
  constructor(
    private readonly paymobService: PaymobService,
    private readonly notificationsService: NotificationsService,
    private readonly cartService: CartService,
    private readonly quizzesService: QuizzesService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Earning.name) private readonly earningModel: Model<Earning>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    @InjectModel(WebhookFailureLog.name)
    private readonly webhookFailureLogModel: Model<WebhookFailureLog>,
    @InjectModel(PlatformConfig.name)
    private readonly platformConfigModel: Model<PlatformConfig>,
  ) { }

  @Post('paymob')
  @UseInterceptors()
  @ApiExcludeEndpoint()
  async handlePaymobWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('hmac') hmacHeader: string,
  ) {
    // Paymob appends the HMAC as a query parameter (`?hmac=...`) on the
    // processed callback; fall back to the header for other configs / tests.
    const hmacSignature =
      (req.query?.hmac as string | undefined) || hmacHeader;
    if (!hmacSignature) {
      throw new UnauthorizedException('Missing HMAC signature');
    }

    const isValid = this.paymobService.verifyWebhookHmac(
      req.body,
      hmacSignature,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    const payload = req.body;

    // SECURITY: the entire `obj` is HMAC-verified above, so every field inside
    // it is trustworthy. Derive the order reference and the paid amount ONLY
    // from `obj` — never from client-controllable top-level fields.
    const txn = payload?.obj;
    if (!txn) {
      res.status(200).send('Missing transaction object');
      return;
    }

    const orderIdStr =
      txn.order?.merchant_order_id ||
      txn.payment_key_claims?.extra?.special_reference ||
      txn.special_reference;

    if (!orderIdStr || !Types.ObjectId.isValid(orderIdStr)) {
      res.status(200).send('Invalid or missing order reference in webhook');
      return;
    }

    const session = await this.orderModel.db.startSession();
    session.startTransaction();

    try {
      const order = await this.orderModel.findById(orderIdStr).session(session);

      if (!order) {
        await session.abortTransaction();
        session.endSession();
        res.status(200).send('Order not found');
        return;
      }

      // Idempotency: If already COMPLETED, just return 200
      if (order.status === OrderStatus.COMPLETED) {
        await session.abortTransaction();
        session.endSession();
        res.status(200).send('Already processed');
        return;
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

        //  Payment Failed notification
        await this.notificationsService.create(
          order.studentId,
          'Payment Failed',
          'Your payment could not be processed. Please try again.',
          NotificationType.PAYMENT_FAILED,
        );

        res.status(200).send('Recorded failure');
        return;
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
        res.status(200).send('Amount mismatch — not fulfilled');
        return;
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
        let enrollment = await this.enrollmentModel
          .findOne({
            studentId: order.studentId,
            courseId: item.courseId,
          })
          .session(session);

        if (!enrollment) {
          enrollment = new this.enrollmentModel({
            studentId: order.studentId,
            courseId: item.courseId,
            type: item.itemType,
            sectionIds:
              item.itemType === PurchaseType.SECTION ? [item.sectionId] : [],
          });
        } else {
          if (item.itemType === PurchaseType.FULL_COURSE) {
            enrollment.type = PurchaseType.FULL_COURSE;
          } else if (item.itemType === PurchaseType.SECTION && item.sectionId) {
            if (
              !enrollment.sectionIds.some(
                (id) => id.toString() === item.sectionId!.toString(),
              )
            ) {
              enrollment.sectionIds.push(item.sectionId);
            }
          }
        }

        // Auto-upgrade check
        if (enrollment && enrollment.type === PurchaseType.SECTION) {
          const course = await this.courseModel
            .findById(item.courseId)
            .session(session);
          if (
            course &&
            enrollment.sectionIds.length >= course.sections.length
          ) {
            enrollment.type = PurchaseType.FULL_COURSE;
            enrollment.sectionIds = [];
          }
        }

        await enrollment.save({ session });

        // Fire-and-forget: Check if quiz generation is now available for this section(s)
        // This must NOT block or roll back the enrollment
        try {
          const courseForQuiz = await this.courseModel
            .findById(item.courseId)
            .select('instructorId sections')
            .lean()
            .exec();
          
          if (courseForQuiz?.instructorId) {
            if (item.itemType === PurchaseType.FULL_COURSE) {
              // Full course: check all sections
              for (const section of courseForQuiz.sections) {
                await this.quizzesService.checkAndNotifyQuizGenerationAvailable(
                  item.courseId.toString(),
                  section._id.toString(),
                  courseForQuiz.instructorId.toString(),
                );
              }
            } else if (item.itemType === PurchaseType.SECTION && item.sectionId) {
              // Section purchase: check only that section
              await this.quizzesService.checkAndNotifyQuizGenerationAvailable(
                item.courseId.toString(),
                item.sectionId.toString(),
                courseForQuiz.instructorId.toString(),
              );
            }
          }
        } catch (quizCheckError) {
          console.error('[WEBHOOK] Quiz generation check failed:', quizCheckError);
          // Do not throw - enrollment is already saved
        }

        // Earnings (80% split to instructor)
        const course = await this.courseModel
          .findById(item.courseId)
          .session(session);
        if (course) {
          const earningAmount =
            Math.round(item.price * instructorShare * 100) / 100;
          const earning = new this.earningModel({
            instructorId: course.instructorId,
            orderId: order._id,
            courseId: item.courseId,
            sectionId: item.sectionId ?? null,
            amount: earningAmount,
            status: EarningStatus.PENDING,
          });
          await earning.save({ session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      // Empty the purchased items from the student's cart now that they own
      // them. Best-effort — never let cart cleanup fail the webhook.
      await this.cartService
        .clearOwnedItems(order.studentId.toString())
        .catch((err) => console.error('Cart cleanup failed:', err));

      //  Purchase Completed notification (to student)
      await this.notificationsService.create(
        order.studentId,
        'Purchase Successful',
        'Your purchase was completed successfully. Enjoy your course!',
        NotificationType.PURCHASE_COMPLETED,
      );

      // New Enrollment notifications (to each course instructor)
      // New Enrollment notifications (to each course instructor)
      for (const item of order.items) {
        const course = await this.courseModel.findById(item.courseId);
        if (course?.instructorId) {
          await this.notificationsService.create(
            course.instructorId,
            'New Enrollment',
            'A new student has enrolled in your course.',
            NotificationType.NEW_ENROLLMENT,
            item.courseId.toString(),
          );

          // Earning Recorded notification
          const earningAmount =
            Math.round(item.price * instructorShare * 100) / 100;
          await this.notificationsService.create(
            course.instructorId,
            'Earning Recorded',
            `You earned ${earningAmount.toFixed(2)} EGP from a new purchase.`,
            NotificationType.EARNING_RECORDED,
            item.courseId.toString(),
          );

          // Milestone Reached check
          try {
            const instructorCourseIds = await this.courseModel.find({ instructorId: course.instructorId }).select('_id').exec();
            const totalStudents = await this.enrollmentModel.countDocuments({
              courseId: { $in: instructorCourseIds.map((c) => c._id) },
            });
            if (STUDENT_MILESTONES.includes(totalStudents)) {
              await this.notificationsService.create(
                course.instructorId,
                'Milestone Reached!',
                `Congratulations! You just reached ${totalStudents} total students!`,
                NotificationType.MILESTONE_REACHED,
              );
            }
          } catch (milestoneError) {
            console.error('Milestone check failed:', milestoneError);
          }
        }
      }

      res.status(200).send('Webhook processed successfully');
      return;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Webhook processing failed:', error);

      try {
        await this.webhookFailureLogModel.create({
          service: 'paymob',
          endpoint: '/webhooks/paymob',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (logError) {
        console.error('Failed to save webhook failure log:', logError);
      }

      throw new InternalServerErrorException('Failed to process webhook');
    }
  }
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
      throw new InternalServerErrorException('Failed to process Cloudinary webhook');
    }
  }
}
