import { Controller, Post, Req, Res, Headers, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Course } from '../courses/schema/course.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymobService: PaymobService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Earning.name) private readonly earningModel: Model<Earning>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>
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
    
    // In our mock, the payload structure would have an orderId or clientSecret.
    // For this implementation, we will assume payload.order_id matches order._id
    const orderIdStr = payload.order_id || payload.clientSecret?.replace('paymob_', '');
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

      // Check if it's a failed transaction from paymob
      if (payload.success === false || payload.success === 'false') {
        order.status = OrderStatus.FAILED;
        await order.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send('Recorded failure');
      }

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
        await enrollment.save({ session });

        // Earnings (80% split to instructor)
        const course = await this.courseModel.findById(item.courseId).session(session);
        if (course) {
          const earningAmount = item.price * 0.80; // 80% split
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

      return res.status(200).send('Webhook processed successfully');
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw new InternalServerErrorException('Failed to process webhook');
    }
  }
}
