import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart } from './schema/cart.schema';
import { CoursesService } from '../courses/courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CartResponse, CartItemResponse } from '../frontend-contracts';
import { PurchaseType } from '../common/enums/purchase-type.enum';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    private coursesService: CoursesService,
    private enrollmentsService: EnrollmentsService
  ) { }

  async getCart(studentId: string): Promise<CartResponse> {
    let cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) }).exec();
    if (!cart) {
      cart = await this.cartModel.create({ studentId: new Types.ObjectId(studentId), items: [] });
    }

    let subtotal = 0;
    const itemsResponse: CartItemResponse[] = [];

    for (const item of cart.items) {
      try {
        const course = await this.coursesService.findOne(item.courseId.toString());

        let sectionTitle;
        if (item.itemType === 'section' && item.sectionId) {
          const section = course.sections.id(item.sectionId);
          if (section) {
            sectionTitle = section.title;
          }
        }

        const price = item.price;
        subtotal += price;

          const instructor = course.instructorId as any;
          const instructorName = instructor?.firstName && instructor?.lastName
            ? `${instructor.firstName} ${instructor.lastName}`
            : 'Instructor';

          itemsResponse.push({
            type: item.itemType as any,
            courseId: course._id.toString(),
            courseTitle: course.title,
            thumbnail: course.thumbnail,
            instructorName,
          sectionId: item.sectionId?.toString(),
          sectionTitle,
          price
        });
      } catch (e) {
        // Ignore deleted courses or sections in cart view
      }
    }

    return {
      items: itemsResponse,
      subtotal,
      total: subtotal
    };
  }

  async addToCart(studentId: string, itemType: PurchaseType, courseId: string, sectionId?: string): Promise<CartResponse> {
    if (!Types.ObjectId.isValid(courseId)) throw new BadRequestException('Invalid Course ID');
    if (itemType === PurchaseType.SECTION && (!sectionId || !Types.ObjectId.isValid(sectionId))) {
      throw new BadRequestException('Invalid Section ID');
    }

    const isOwned = await this.enrollmentsService.hasDuplicate(studentId, itemType, courseId, sectionId);
    if (isOwned) {
      throw new ConflictException('You already have access to this content');
    }

    let cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });
    if (!cart) {
      cart = new this.cartModel({ studentId: new Types.ObjectId(studentId), items: [] });
    }

    const exists = cart.items.some(item =>
      item.courseId.toString() === courseId &&
      (item.itemType === PurchaseType.FULL_COURSE || item.sectionId?.toString() === sectionId)
    );
    if (exists) {
      throw new ConflictException('This item is already in your cart');
    }

    const course = await this.coursesService.findOne(courseId);
    let priceToSnapshot = course.price;

    if (itemType === PurchaseType.SECTION) {
      const section = course.sections.id(sectionId!);
      if (!section) throw new NotFoundException('Section not found');
      if (section.price === null || section.price === undefined) {
        throw new BadRequestException('This section is not purchasable individually');
      }
      priceToSnapshot = section.price;
    }

    cart.items.push({
      itemType,
      courseId: new Types.ObjectId(courseId),
      sectionId: sectionId ? new Types.ObjectId(sectionId) : undefined,
      price: priceToSnapshot
    });

    await cart.save();
    return this.getCart(studentId);
  }

  async removeFromCart(studentId: string, itemId: string): Promise<CartResponse> {
    const cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });
    if (!cart) throw new NotFoundException('Cart not found');

    const initialLength = cart.items.length;
    // Assume frontend sends the cart item's _id or courseId/sectionId. Let's try _id first.
    cart.items = cart.items.filter(item => {
      return item._id?.toString() !== itemId && item.courseId.toString() !== itemId && item.sectionId?.toString() !== itemId;
    });

    if (cart.items.length === initialLength) {
      throw new NotFoundException('Item not found in cart');
    }

    await cart.save();
    return this.getCart(studentId);
  }

  async validateCart(studentId: string) {
    const cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });
    if (!cart || cart.items.length === 0) return true;

    let changed = false;

    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      const isOwned = await this.enrollmentsService.hasDuplicate(studentId, item.itemType, item.courseId.toString(), item.sectionId?.toString());
      if (isOwned) {
        cart.items.splice(i, 1);
        changed = true;
        continue;
      }

      try {
        const course = await this.coursesService.findOne(item.courseId.toString());
        let currentPrice = course.price;
        if (item.itemType === PurchaseType.SECTION) {
          const section = course.sections.id(item.sectionId!);
          if (!section || section.price === null || section.price === undefined) {
            cart.items.splice(i, 1);
            changed = true;
            continue;
          }
          currentPrice = section.price;
        }

        if (item.price !== currentPrice) {
          item.price = currentPrice;
          changed = true;
        }
      } catch (e) {
        cart.items.splice(i, 1);
        changed = true;
      }
    }

    if (changed) {
      await cart.save();
      throw new ConflictException('Prices have changed or items are already owned, please review your cart');
    }

    return cart;
  }
}