import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';

import { Order } from './schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { User } from '../users/schema/user.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { CartService } from '../cart/cart.service';
import { PaymobService, PaymobBillingData } from '../paymob/paymob.service';
import {
  CheckoutResponse,
  OrderDetailResponse,
  OrderHistoryResponse,
} from '../frontend-contracts';
import { OrderStatus } from '../common/enums/order-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { STUDENT_MILESTONES } from '../common/constants/milestones.constant';
import { Course } from '../courses/schema/course.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(User.name) private userModel: Model<User>,
    private cartService: CartService,
    private paymobService: PaymobService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Build Paymob billing data from the student's profile (best-effort). */
  private async buildBillingData(
    studentId: string,
  ): Promise<PaymobBillingData | undefined> {
    try {
      const user = await this.userModel
        .findById(studentId)
        .select('firstName lastName email')
        .lean<{ firstName?: string; lastName?: string; email?: string }>()
        .exec();
      if (!user?.email) return undefined;
      return {
        first_name: user.firstName || 'EduGenie',
        last_name: user.lastName || 'Student',
        email: user.email,
        phone_number: '+201000000000',
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        shipping_method: 'NA',
        postal_code: 'NA',
        city: 'NA',
        country: 'EG',
        state: 'NA',
      };
    } catch {
      return undefined;
    }
  }

  async processCheckout(studentId: string): Promise<CheckoutResponse> {
    // 1 & 3. RE-VALIDATE THE CART
    // validateCart throws if prices changed or items are already owned.
    const validatedCart: any = await this.cartService.validateCart(studentId);

    if (
      !validatedCart ||
      !validatedCart.items ||
      validatedCart.items.length === 0
    ) {
      throw new BadRequestException('Your cart is empty');
    }

    // Fetch the full populated cart to get titles
    const cartResponse = await this.cartService.getCart(studentId);
    if (cartResponse.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    // 2. IDEMPOTENCY CHECK
    const cartItemsData = validatedCart.items.map((i: any) => ({
      itemType: i.itemType,
      courseId: i.courseId.toString(),
      sectionId: i.sectionId ? i.sectionId.toString() : null,
      price: i.price,
    }));
    cartItemsData.sort((a: any, b: any) =>
      a.courseId.localeCompare(b.courseId),
    );
    const cartSnapshotString = JSON.stringify(cartItemsData);
    const cartSnapshotHash = crypto
      .createHash('sha256')
      .update(cartSnapshotString)
      .digest('hex');

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const existingOrder = await this.orderModel.findOne({
      studentId: new Types.ObjectId(studentId),
      status: OrderStatus.PENDING,
      cartSnapshotHash: cartSnapshotHash,
      createdAt: { $gte: thirtyMinutesAgo },
    });

    if (existingOrder) {
      if (existingOrder.totalAmount === 0) {
        return {
          clientSecret: '',
          orderId: existingOrder._id.toString(),
          amount: 0,
          currency: 'EGP',
        };
      }
      // Reuse the Paymob intention created on the first checkout. Re-registering
      // the same order id with Paymob is rejected ("An Order with ref: ... already
      // exists"), so on retry we return the stored client_secret instead.
      if (existingOrder.paymobClientSecret) {
        return {
          clientSecret: existingOrder.paymobClientSecret,
          orderId: existingOrder._id.toString(),
          amount: existingOrder.totalAmount,
          currency: 'EGP',
        };
      }

      // Legacy pending order created before client_secret was persisted: try once
      // more. The guard converts any Paymob rejection into the graceful 503 below
      // instead of leaking a raw 500.
      try {
        const paymentData = await this.paymobService.createPaymentUrl(
          Math.round(existingOrder.totalAmount * 100),
          existingOrder._id.toString(),
          await this.buildBillingData(studentId),
        );
        existingOrder.paymobClientSecret = paymentData.clientSecret;
        existingOrder.paymobOrderId =
          paymentData.paymobOrderId ?? existingOrder.paymobOrderId ?? null;
        await existingOrder.save();
        return {
          clientSecret: paymentData.clientSecret,
          orderId: existingOrder._id.toString(),
          amount: existingOrder.totalAmount,
          currency: 'EGP',
        };
      } catch {
        throw new ServiceUnavailableException(
          'Payment service is currently unavailable. Please try again later.',
        );
      }
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of cartResponse.items) {
      totalAmount += item.price;
      orderItems.push({
        itemType: item.type,
        courseId: new Types.ObjectId(item.courseId),
        sectionId: item.sectionId
          ? new Types.ObjectId(item.sectionId)
          : undefined,
        courseTitle:
          item.courseTitle +
          (item.sectionTitle ? ` - ${item.sectionTitle}` : ''),
        price: item.price,
      });
    }

    // 4. CREATE THE ORDER AS PENDING FIRST
    // REASONING: We do not use a MongoDB transaction here because if the Paymob call fails,
    // we WANT to keep the Order document in the database and mark it as FAILED for audit trailing.
    // If we wrapped this in a transaction and aborted it, the Order would be erased completely,
    // which violates the requirement to retain failed attempts.
    const order = new this.orderModel({
      studentId: new Types.ObjectId(studentId),
      items: orderItems,
      totalAmount,
      status: totalAmount === 0 ? OrderStatus.COMPLETED : OrderStatus.PENDING,
      cartSnapshotHash,
      paidAt: totalAmount === 0 ? new Date() : undefined,
    });
    await order.save();

    if (totalAmount === 0) {
      // Free order fulfillment
      for (const item of orderItems) {
        let enrollment = await this.enrollmentModel.findOne({
          studentId: order.studentId,
          courseId: item.courseId,
        });

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
        await enrollment.save();

        // NEW: New Enrollment notification (to course instructor)
        const course = await this.courseModel
          .findById(item.courseId)
          .select('instructorId');
        if (course?.instructorId) {
          await this.notificationsService.create(
            course.instructorId,
            'New Enrollment',
            'A new student has enrolled in your course.',
            NotificationType.NEW_ENROLLMENT,
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

      // NEW: Purchase Completed notification (to student)
      await this.notificationsService.create(
        order.studentId,
        'Purchase Successful',
        'Your purchase was completed successfully. Enjoy your course!',
        NotificationType.PURCHASE_COMPLETED,
      );

      // Automatically clean the cart since items are now owned
      await this.cartService.clearOwnedItems(studentId).catch(() => {});

      return {
        clientSecret: '',
        orderId: order._id.toString(),
        amount: 0,
        currency: 'EGP',
      };
    }

    // 5. CALL PAYMOB
    try {
      const paymentData = await this.paymobService.createPaymentUrl(
        Math.round(totalAmount * 100),
        order._id.toString(),
        await this.buildBillingData(studentId),
      );
      // Store the real Paymob intention id for reconciliation (null if absent),
      // and the client_secret so a retry on the same cart reuses this intention
      // instead of re-registering the order id (which Paymob rejects).
      order.paymobOrderId = paymentData.paymobOrderId ?? null;
      order.paymobClientSecret = paymentData.clientSecret ?? null;
      await order.save();

      return {
        clientSecret: paymentData.clientSecret,
        orderId: order._id.toString(),
        amount: totalAmount,
        currency: 'EGP',
      };
    } catch (e) {
      order.status = OrderStatus.FAILED;
      await order.save();
      throw new ServiceUnavailableException(
        'Payment service is currently unavailable. Please try again later.',
      );
    }
  }

  async getOrderById(
    studentId: string,
    orderId: string,
  ): Promise<OrderDetailResponse> {
    if (!Types.ObjectId.isValid(orderId))
      throw new NotFoundException('Order not found');
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    if (order.studentId.toString() !== studentId) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    return {
      orderId: order._id.toString(),
      status: order.status,
      items: order.items.map((i) => ({
        courseTitle: i.courseTitle,
        type: i.itemType,
        price: i.price,
      })),
      total: order.totalAmount,
      paidAt: order.paidAt,
    };
  }

  async getMyOrders(studentId: string): Promise<OrderHistoryResponse> {
    const orders = await this.orderModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ createdAt: -1 })
      .exec();

    return {
      orders: orders.map((order) => ({
        orderId: order._id.toString(),
        status: order.status,
        total: order.totalAmount,
        createdAt: (order as any).createdAt,
        items: order.items.map((i) => ({
          courseTitle: i.courseTitle,
          type: i.itemType,
          price: i.price,
        })),
      })),
    };
  }
}
