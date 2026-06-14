import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Cart } from '../cart/schema/cart.schema';
import { Order } from './schema/order.schema';
import { Enrollment } from 'src/enrollments/schema/enrollment.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
  ) { }

  // Triggered when a student clicks "Checkout" in their cart
  async processCheckout(studentId: string) {
    const session = await this.orderModel.db.startSession();
    session.startTransaction();

    try {
      // 1. Get the cart and calculate the total amount
      const cart = await this.cartModel
        .findOne({ studentId: new Types.ObjectId(studentId) })
        .populate('items')
        .session(session);

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty.');
      }

      let totalAmount = 0;
      const orderItems = cart.items.map((course: any) => {
        totalAmount += course.price;
        return { courseId: course._id, price: course.price };
      });

      // 2. Create the Order
      const newOrder = await this.orderModel.create([{
        studentId: new Types.ObjectId(studentId),
        items: orderItems,
        totalAmount,
        status: 'COMPLETED', // We will set this to PENDING when we add Stripe later
      }], { session });

      // 3. Create Enrollments so the student gets instant access to the videos
      const enrollments = orderItems.map(item => ({
        studentId: new Types.ObjectId(studentId),
        courseId: item.courseId,
        progressPercentage: 0,
      }));
      await this.enrollmentModel.insertMany(enrollments, { session });

      // 4. Empty the Cart now that the purchase is successful
      await this.cartModel.updateOne(
        { studentId: new Types.ObjectId(studentId) },
        { $set: { items: [] } },
        { session }
      );

      // 5. Commit the transaction safely
      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: 'Checkout complete! You are now enrolled in your courses.',
        orderId: newOrder[0]._id
      };

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      if (error.code === 11000) {
        throw new BadRequestException('You are already enrolled in one of these courses!');
      }
      throw error;
    }
  }

  // Allow a student to view their past orders
  async getMyOrders(studentId: string) {
    return this.orderModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .populate('items.courseId', 'title thumbnail')
      .sort({ createdAt: -1 })
      .exec();
  }
}