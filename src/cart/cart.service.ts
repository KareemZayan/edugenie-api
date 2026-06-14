import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart } from './schema/cart.schema';

@Injectable()
export class CartService {
  constructor(@InjectModel(Cart.name) private cartModel: Model<Cart>) { }

  // 1. Get the user's cart and populate the course details (price, title, thumbnail)
  async getCart(studentId: string) {
    let cart = await this.cartModel
      .findOne({ studentId: new Types.ObjectId(studentId) })
      .populate('items', 'title price thumbnail')
      .exec();

    // If they don't have a cart yet, create an empty one!
    if (!cart) {
      cart = await this.cartModel.create({ studentId: new Types.ObjectId(studentId), items: [] });
    }
    return cart;
  }

  // 2. Add a course to the cart
  async addToCart(studentId: string, courseId: string) {
    if (!Types.ObjectId.isValid(courseId)) throw new BadRequestException('Invalid Course ID');

    let cart = await this.cartModel.findOne({ studentId: new Types.ObjectId(studentId) });

    if (!cart) {
      // Create new cart with the first item
      cart = await this.cartModel.create({
        studentId: new Types.ObjectId(studentId),
        items: [new Types.ObjectId(courseId)],
      });
    } else {
      // Check if course is already in the cart to prevent duplicates
      const exists = cart.items.some(item => item.toString() === courseId);
      if (exists) throw new BadRequestException('Course is already in your cart');

      cart.items.push(new Types.ObjectId(courseId));
      await cart.save();
    }

    return this.getCart(studentId); // Return the updated, populated cart
  }

  // 3. Remove a course from the cart
  async removeFromCart(studentId: string, courseId: string) {
    const cart = await this.cartModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(studentId) },
      { $pull: { items: new Types.ObjectId(courseId) } }, // $pull removes the item from the array
      { returnDocument: 'after' }
    ).populate('items', 'title price thumbnail');

    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }
}