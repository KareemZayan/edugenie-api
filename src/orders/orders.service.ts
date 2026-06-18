import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Cart } from '../cart/schema/cart.schema';
import { Order } from './schema/order.schema';
import { Enrollment } from 'src/enrollments/schema/enrollment.schema';
import { CourseDocument } from '../courses/schema/course.schema';
import { PaymobService } from '../paymob/paymob.service';
import { UsersService } from '../users/users.service';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import { OrderSerializer } from './serializers/order.serializer';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel('Earning') private earningModel: Model<any>,
    private readonly paymobService: PaymobService,
    private readonly usersService: UsersService,
  ) { }

  // Triggered when a student clicks "Checkout" in their cart
  async processCheckout(studentId: string) {
    const session = await this.orderModel.db.startSession();
    session.startTransaction();

    try {
      // 1. Get the cart and calculate the total amount
      const cart = await this.cartModel
        .findOne({ studentId: new Types.ObjectId(studentId) })
        .populate('items.courseId')
        .session(session);

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty.');
      }

      let totalAmount = 0;
      const orderItems = cart.items.map((item: any) => {
        const c = item.courseId;
        totalAmount += item.price;
        return { 
          itemType: item.itemType,
          courseId: c._id, 
          sectionId: item.sectionId,
          instructorId: c.instructorId,
          price: item.price
        };
      });

      // 2. Create the Order
      const newOrder = await this.orderModel.create([{
        studentId: new Types.ObjectId(studentId),
        items: orderItems,
        totalAmount,
        status: 'PENDING',
      }], { session });

      // 3. Get user details for Paymob billing
      const user = await this.usersService.getProfile(studentId);
      const billingData = {
        apartment: "NA",
        email: user.email,
        floor: "NA",
        first_name: user.firstName,
        street: "NA",
        building: "NA",
        phone_number: "+201000000000",
        shipping_method: "NA",
        postal_code: "NA",
        city: "NA",
        country: "NA",
        last_name: user.lastName,
        state: "NA"
      };

      // 4. Generate Paymob Intention client_secret
      const clientSecret = await this.paymobService.createPaymentUrl(
        totalAmount * 100,
        newOrder[0]._id.toString(),
        billingData
      );

      // 5. Empty the Cart now that the purchase intent is created
      await this.cartModel.updateOne(
        { studentId: new Types.ObjectId(studentId) },
        { $set: { items: [] } },
        { session }
      );

      // 6. Commit the transaction safely
      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: 'Checkout initiated. Please complete the payment using the provided client_secret.',
        clientSecret: clientSecret
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
  async getMyOrders(studentId: string, query: PaginateQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const data = await this.orderModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .populate('items.courseId', 'title thumbnail')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await this.orderModel.countDocuments({ studentId: new Types.ObjectId(studentId) });

    return {
      data: data.map(d => new OrderSerializer(d.toObject() as any)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      }
    };
  }
}