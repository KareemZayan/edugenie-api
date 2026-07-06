import {
  Injectable,
  BadRequestException,
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
import { QuizzesService } from '../quizzes/quizzes.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(User.name) private userModel: Model<User>,
    private cartService: CartService,
    private readonly notificationsService: NotificationsService,
    private readonly quizzesService: QuizzesService,
  ) {}

  /**
   * Cart checkout now handles FREE orders only. Paid purchases go through Stripe
   * Checkout (`POST /payments/checkout`, one course at a time) — Paymob was
   * removed when the platform moved to Stripe Connect.
   */
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
      throw new BadRequestException(
        'Paid checkout is handled by Stripe. Buy each course via /payments/checkout.',
      );
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

            // Check if any sections can now generate quizzes
            // For full course purchase, check all sections
            if (item.itemType === PurchaseType.FULL_COURSE) {
              const fullCourse = await this.courseModel.findById(item.courseId).select('sections._id').lean().exec();
              if (fullCourse?.sections) {
                for (const section of fullCourse.sections) {
                  await this.quizzesService.checkAndNotifyQuizGenerationAvailable(
                    item.courseId.toString(),
                    section._id.toString(),
                    course.instructorId.toString(),
                  );
                }
              }
            } else if (item.itemType === PurchaseType.SECTION && item.sectionId) {
              // For section purchase, check only that section
              await this.quizzesService.checkAndNotifyQuizGenerationAvailable(
                item.courseId.toString(),
                item.sectionId.toString(),
                course.instructorId.toString(),
              );
            }
          } catch (milestoneError) {
            console.error('Milestone/Quiz check failed:', milestoneError);
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

    // Paid carts are no longer fulfilled here — Stripe handles paid purchases
    // one course at a time. Drop the just-created PENDING order and redirect.
    order.status = OrderStatus.FAILED;
    await order.save();
    throw new BadRequestException(
      'Paid checkout is handled by Stripe. Buy each course via /payments/checkout.',
    );
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
