import { Controller, Post, Req, Res, Headers, UnauthorizedException, InternalServerErrorException, UseInterceptors } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Course } from '../courses/schema/course.schema';
import { Lesson } from '../lessons/schema/lesson.schema';
import { WebhookFailureLog } from '../superadmin/schema/webhook-failure-log.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymobService: PaymobService,
    private readonly notificationsService: NotificationsService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Earning.name) private readonly earningModel: Model<Earning>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    @InjectModel(WebhookFailureLog.name) private readonly webhookFailureLogModel: Model<WebhookFailureLog>
  ) {}

  @Post('paymob')
  @UseInterceptors()
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

    const orderIdStr = payload.order_id || payload.clientSecret?.replace('paymob_', '') || payload.obj?.order?.merchant_order_id || payload.obj?.special_reference;

    if (!orderIdStr || !Types.ObjectId.isValid(orderIdStr)) {
      return res.status(200).send('Invalid or missing order reference in webhook');
    }

    const session = await this.orderModel.db.startSession();
    session.startTransaction();

    try {
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

      // Check if it's a failed transaction from paymob
      if (payload.success === false || payload.success === 'false' || payload.obj?.success === false) {
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

        return res.status(200).send('Recorded failure');
      }

      // 1. Mark Order as COMPLETED
      order.status = OrderStatus.COMPLETED;
      order.paidAt = new Date();
      await order.save({ session });

      // 2. Create Enrollments and Earnings
      for (const item of order.items) {
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
          if (item.itemType === PurchaseType.FULL_COURSE) {
            enrollment.type = PurchaseType.FULL_COURSE;
          } else if (item.itemType === PurchaseType.SECTION && item.sectionId) {
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

        // Earnings (80% split to instructor)
        const course = await this.courseModel.findById(item.courseId).session(session);
        if (course) {
          const earningAmount = item.price * 0.80;
          const earning = new this.earningModel({
            instructorId: course.instructorId,
            orderId: order._id,
            amount: earningAmount,
            status: EarningStatus.PENDING
          });
          await earning.save({ session });
        }
      }

      await session.commitTransaction();
      session.endSession();

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
          const earningAmount = item.price * 0.80;
          await this.notificationsService.create(
            course.instructorId,
            'Earning Recorded',
            `You earned ${earningAmount.toFixed(2)} EGP from a new purchase.`,
            NotificationType.EARNING_RECORDED,
            item.courseId.toString(),
          );
        }
      }

      return res.status(200).send('Webhook processed successfully');
      
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Webhook processing failed:', error);

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
  @UseInterceptors()
  async handleCloudinaryWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      const body = req.body;

      if (body.notification_type === 'upload' && body.duration) {
        const publicId = body.public_id;
        const durationSecs = Math.round(parseFloat(body.duration));

        const course = await this.courseModel.findOne({ 'sections.lessons.videoPublicId': publicId });

        if (course) {
          let durationDiff = 0;

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
            course.totalHours += (durationDiff / 3600);
            await course.save();
          }
        }
      }

      res.status(200).send();
    } catch (error) {
      console.error('Cloudinary webhook processing failed:', error);

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