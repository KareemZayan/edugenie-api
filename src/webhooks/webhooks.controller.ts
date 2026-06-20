import { Controller, Post, Req, Res, Headers, BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../orders/schema/earning.schema';
import { Lesson } from '../lessons/schema/lesson.schema';
import { Course } from '../courses/schema/course.schema';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymobService: PaymobService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel('Earning') private earningModel: Model<any>,
    @InjectModel(Lesson.name) private lessonModel: Model<Lesson>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
  ) { }

  @Post('paymob')
  async handlePaymobWebhook(@Req() req: Request, @Res() res: Response) {
    const body = req.body;
    const obj = body?.obj;

    // In production, always enforce HMAC. In dev, allow bypass for testing.
    const isProd = process.env.NODE_ENV === 'production';
    const hmacHeader = req.headers['hmac'] as string;

    if (isProd) {
      if (!hmacHeader) {
        res.status(400).send('Missing HMAC header');
        return;
      }
      if (!obj) {
        res.status(400).send('Invalid payload: missing obj');
        return;
      }

      // Paymob HMAC verification logic
      const concatenatedString = [
        obj.amount_cents,
        obj.created_at,
        obj.currency,
        obj.error_occured,
        obj.has_parent_transaction,
        obj.id,
        obj.integration_id,
        obj.is_3d_secure,
        obj.is_auth,
        obj.is_capture,
        obj.is_refunded,
        obj.is_standalone_payment,
        obj.is_voided,
        obj.order?.id,
        obj.owner,
        obj.pending,
        obj.source_data?.pan,
        obj.source_data?.sub_type,
        obj.source_data?.type,
        obj.success,
      ].join('');

      const hmac = crypto
        .createHmac('sha512', this.paymobService.hmacSecret)
        .update(concatenatedString)
        .digest('hex');

      if (hmac !== hmacHeader) {
        res.status(400).send('Invalid HMAC signature');
        return;
      }
    }

    // Guard: if obj is missing (malformed body), just return OK
    if (!obj) {
      res.status(200).send('No obj in payload');
      return;
    }

    // Process only successful transactions
    if (obj.success === true) {
      const merchantOrderId = obj.order?.merchant_order_id || obj.special_reference;

      if (!merchantOrderId) {
        res.status(200).send('No order reference found');
        return;
      }

      const session = await this.orderModel.db.startSession();
      session.startTransaction();

      try {
        const order = await this.orderModel.findById(merchantOrderId).session(session);
        if (!order || order.status === 'COMPLETED') {
          await session.abortTransaction();
          session.endSession();
          res.status(200).send('Order already processed or not found');
          return;
        }

        order.status = 'COMPLETED';
        await order.save({ session });

        for (const item of order.items) {
          if (item.itemType === 'course') {
            const enrollment = await this.enrollmentModel.findOne({ studentId: order.studentId, courseId: item.courseId }).session(session);
            if (enrollment) {
              enrollment.type = 'full_course';
              enrollment.sectionIds = [];
              await enrollment.save({ session });
            } else {
              await this.enrollmentModel.create([{
                studentId: order.studentId,
                courseId: item.courseId,
                type: 'full_course',
                sectionIds: [],
              }], { session });
            }

            await this.earningModel.create([{
              instructorId: item.instructorId,
              orderId: order._id,
              courseId: item.courseId,
              sectionId: null,
              amount: item.price * 0.80,
              status: 'PENDING',
            }], { session });

          } else if (item.itemType === 'section') {
            let enrollment = await this.enrollmentModel.findOne({ studentId: order.studentId, courseId: item.courseId }).session(session);

            if (enrollment) {
              if (enrollment.type === 'sections') {
                if (!enrollment.sectionIds.some(id => id.toString() === item.sectionId?.toString())) {
                  enrollment.sectionIds.push(item.sectionId as Types.ObjectId);
                  await enrollment.save({ session });
                }
              }
            } else {
              const newEnrolls = await this.enrollmentModel.create([{
                studentId: order.studentId,
                courseId: item.courseId,
                type: 'sections',
                sectionIds: item.sectionId ? [item.sectionId] : [],
              }], { session });
              enrollment = newEnrolls[0];
            }

            // Auto-upgrade check
            if (enrollment && enrollment.type === 'sections') {
              const course = await this.courseModel.findById(item.courseId).session(session);
              if (course && enrollment.sectionIds.length >= course.sections.length) {
                enrollment.type = 'full_course';
                enrollment.sectionIds = [];
                await enrollment.save({ session });
              }
            }

            await this.earningModel.create([{
              instructorId: item.instructorId,
              orderId: order._id,
              courseId: item.courseId,
              sectionId: item.sectionId,
              amount: item.price * 0.80,
              status: 'PENDING',
            }], { session });
          }
        }

        await session.commitTransaction();
        session.endSession();
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Webhook processing failed:', err);
        res.status(500).send('Webhook processing failed');
        return;
      }
    }

    res.status(200).send();
  }

  @Post('cloudinary')
  async handleCloudinaryWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    // Basic Cloudinary verification (often via X-Cld-Signature header or basic auth)
    // For simplicity, assuming payload structure is parsed and valid
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
  }
}
