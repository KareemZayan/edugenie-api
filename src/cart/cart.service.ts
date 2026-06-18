import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart } from './schema/cart.schema';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { AddToCartDto, CartItemType } from './dto/add-to-cart.dto';
import { CourseStatus } from '../common/enums/course-status.enum';
import { CartSerializer } from './serializers/cart.serializer';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
  ) { }

  // 1. Get the user's cart and populate the course details (price, title, thumbnail)
  async getCart(studentId: string) {
    let cart = await this.cartModel
      .findOne({ studentId: new Types.ObjectId(studentId) })
      .populate('items.courseId', 'title price thumbnail')
      .exec();

    // If they don't have a cart yet, create an empty one!
    if (!cart) {
      cart = await this.cartModel.create({ studentId: new Types.ObjectId(studentId), items: [] });
    }
    return new CartSerializer(cart.toObject() as any);
  }

  // 2. Add a course or section to the cart
  async addToCart(studentId: string, dto: AddToCartDto) {
    if (!Types.ObjectId.isValid(dto.courseId)) throw new BadRequestException('Invalid Course ID');

    // Find the course first to get price and validate
    const course = await this.courseModel.findById(dto.courseId);
    if (!course) throw new NotFoundException('Course not found');
    if (course.courseStatus !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Course is not available for purchase');
    }

    let price = 0;

    if (dto.itemType === CartItemType.COURSE) {
      // Check if student already enrolled in full course
      const enrollment = await this.enrollmentModel.findOne({
        studentId: new Types.ObjectId(studentId),
        courseId: new Types.ObjectId(dto.courseId),
        type: 'full_course'
      });
      if (enrollment) throw new ConflictException('You already have full access to this course');
      price = course.price;
    } else if (dto.itemType === CartItemType.SECTION) {
      if (!dto.sectionId || !Types.ObjectId.isValid(dto.sectionId)) {
        throw new BadRequestException('Invalid Section ID');
      }
      
      const section = course.sections.find(s => s._id.toString() === dto.sectionId);
      if (!section) throw new NotFoundException('Section not found in this course');
      
      if (section.price === null || section.price === undefined) {
        throw new BadRequestException('This section is not available for individual purchase');
      }

      // Check if student already owns this section or the full course
      const enrollment = await this.enrollmentModel.findOne({
        studentId: new Types.ObjectId(studentId),
        courseId: new Types.ObjectId(dto.courseId)
      });

      if (enrollment) {
        if (enrollment.type === 'full_course') {
          throw new ConflictException('You already have full access to this course');
        }
        const hasSection = enrollment.sectionIds.some(id => id.toString() === dto.sectionId);
        if (hasSection) {
          throw new ConflictException('You already have access to this section');
        }
      }
      
      price = section.price;
    }

    let cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });

    if (!cart) {
      cart = new this.cartModel({
        studentId: new Types.ObjectId(studentId),
        items: [],
      });
    }

    // Check if item is already in the cart to prevent duplicates
    const exists = cart.items.some(item => {
      if (dto.itemType === CartItemType.COURSE) {
        return item.itemType === CartItemType.COURSE && item.courseId.toString() === dto.courseId;
      } else {
        return item.itemType === CartItemType.SECTION && item.sectionId?.toString() === dto.sectionId;
      }
    });

    if (exists) throw new BadRequestException('Item is already in your cart');

    cart.items.push({
      itemType: dto.itemType,
      courseId: new Types.ObjectId(dto.courseId),
      sectionId: dto.sectionId ? new Types.ObjectId(dto.sectionId) : null,
      price: price
    });

    await cart.save();

    return this.getCart(studentId);
  }

  // 3. Remove an item from the cart
  async removeFromCart(studentId: string, itemId: string) {
    if (!Types.ObjectId.isValid(itemId)) throw new BadRequestException('Invalid Item ID');

    const cart = await this.cartModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(studentId) },
      { $pull: { items: { _id: new Types.ObjectId(itemId) } } },
      { returnDocument: 'after' }
    ).populate('items.courseId', 'title price thumbnail');

    if (!cart) throw new NotFoundException('Cart not found');
    return new CartSerializer(cart.toObject() as any);
  }

  // 4. Validate cart before checkout
  async validateCart(studentId: string) {
    const cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    let pricesChanged = false;
    let invalidItemsCount = 0;

    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      const course = await this.courseModel.findById(item.courseId);

      // If course deleted or unpublished, remove item
      if (!course || course.courseStatus !== CourseStatus.PUBLISHED) {
        cart.items.splice(i, 1);
        invalidItemsCount++;
        continue;
      }

      if (item.itemType === CartItemType.COURSE) {
        if (item.price !== course.price) {
          item.price = course.price; // Update snapshot
          pricesChanged = true;
        }
      } else if (item.itemType === CartItemType.SECTION) {
        const section = course.sections.find(s => s._id.toString() === item.sectionId?.toString());
        // If section deleted or not purchasable individually, remove item
        if (!section || section.price === null || section.price === undefined) {
          cart.items.splice(i, 1);
          invalidItemsCount++;
          continue;
        }
        if (item.price !== section.price) {
          item.price = section.price; // Update snapshot
          pricesChanged = true;
        }
      }
    }

    if (pricesChanged || invalidItemsCount > 0) {
      await cart.save();
      throw new ConflictException('Prices changed or items became unavailable. Please review your cart.');
    }

    return cart;
  }
}