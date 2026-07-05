import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
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
    private enrollmentsService: EnrollmentsService,
  ) {}

  async getCart(studentId: string): Promise<CartResponse> {
    let cart = await this.cartModel
      .findOne({ studentId: new Types.ObjectId(studentId) })
      .exec();
    if (!cart) {
      return {
        items: [],
        subtotal: 0,
        total: 0,
      };
    }

    let subtotal = 0;
    const itemsResponse: CartItemResponse[] = [];

    for (const item of cart.items) {
      try {
        const course = await this.coursesService.findCourseDocument(
          item.courseId.toString(),
        );

        let sectionTitle;
        if (item.itemType === 'section' && item.sectionId) {
          const section = course.sections.find(
            (s: any) => s._id.toString() === item.sectionId?.toString(),
          );
          if (section) {
            sectionTitle = section.title;
          }
        }

        const price = item.price;
        subtotal += price;

        const instructor = course.instructorId as any;
        const instructorName =
          instructor?.firstName && instructor?.lastName
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
          price,
        });
      } catch (e) {
        // Ignore deleted courses or sections in cart view
      }
    }

    return {
      items: itemsResponse,
      subtotal,
      total: subtotal,
    };
  }

  async addToCart(
    studentId: string,
    itemType: PurchaseType,
    courseId: string,
    sectionId?: string,
  ): Promise<CartResponse> {
    if (!Types.ObjectId.isValid(courseId))
      throw new BadRequestException('Invalid Course ID');
    if (
      itemType === PurchaseType.SECTION &&
      (!sectionId || !Types.ObjectId.isValid(sectionId))
    ) {
      throw new BadRequestException('Invalid Section ID');
    }

    const isOwned = await this.enrollmentsService.hasDuplicate(
      studentId,
      itemType,
      courseId,
      sectionId,
    );
    if (isOwned) {
      throw new ConflictException('You already have access to this content');
    }

    const sid = new Types.ObjectId(studentId);
    const cid = new Types.ObjectId(courseId);
    const secObjId = sectionId ? new Types.ObjectId(sectionId) : undefined;

    // Snapshot the price (and validate the section is individually sellable).
    const course = await this.coursesService.findCourseDocument(courseId);
    let priceToSnapshot = course.price;
    if (itemType === PurchaseType.SECTION) {
      const section = course.sections.find(
        (s: any) => s._id.toString() === sectionId?.toString(),
      );
      if (!section) throw new NotFoundException('Section not found');
      if (section.price === null || section.price === undefined) {
        throw new BadRequestException(
          'This section is not purchasable individually',
        );
      }
      priceToSnapshot = section.price;
    } else {
      // FULL_COURSE: if the student already bought some sections, only charge
      // the remaining balance so they never pay more than the full price total.
      // (Fulfillment already upgrades their enrollment to full access on pay.)
      const pricing = await this.enrollmentsService.getCoursePricingForStudent(
        studentId,
        courseId,
      );
      if (pricing.remainingPrice <= 0) {
        throw new ConflictException('You already have access to this content');
      }
      priceToSnapshot = pricing.remainingPrice;
    }

    // Recognise an equivalent item already in the cart: a full-course purchase
    // conflicts with anything for that course; a section conflicts with the same
    // section (or an existing full-course purchase of the same course).
    const conflictGuard =
      itemType === PurchaseType.FULL_COURSE
        ? { courseId: cid }
        : {
            courseId: cid,
            $or: [{ itemType: PurchaseType.FULL_COURSE }, { sectionId: secObjId }],
          };

    // 1) Ensure the cart row exists. Upsert is atomic, so two concurrent
    //    "first add" requests can't both insert and trip the unique studentId
    //    index (the E11000 duplicate-key error).
    await this.cartModel
      .updateOne(
        { studentId: sid },
        { $setOnInsert: { items: [] } },
        { upsert: true },
      )
      .catch((e) => {
        // A concurrent request created the cart first — harmless.
        if ((e as { code?: number }).code !== 11000) throw e;
      });

    // 2) Push the item only if an equivalent one isn't already present. The
    //    $elemMatch guard makes re-adding the same item an idempotent no-op
    //    instead of a duplicate-key crash, and $push is atomic so parallel
    //    adds of different items don't clobber each other.
    await this.cartModel.updateOne(
      { studentId: sid, items: { $not: { $elemMatch: conflictGuard } } },
      {
        $push: {
          items: {
            itemType,
            courseId: cid,
            sectionId: secObjId,
            price: priceToSnapshot,
          },
        },
      },
    );

    return this.getCart(studentId);
  }

  /**
   * One-click "add this course, pay only what I don't own":
   *  - owns nothing            → add the FULL course (full price).
   *  - owns some sections      → add each unowned, individually-priced SECTION,
   *                              so the cart shows the real remaining sum.
   *  - a remaining section has  → fall back to a FULL_COURSE item (priced at the
   *    no individual price        remaining balance by addToCart) so all
   *                              remaining content is still purchasable.
   *  - already fully owns       → Conflict.
   * Per-item conflicts (already owned / already in cart) are swallowed, matching
   * PlacementService.addRecommendedToCart.
   */
  async addCourseSmart(
    studentId: string,
    courseId: string,
  ): Promise<CartResponse> {
    if (!Types.ObjectId.isValid(courseId))
      throw new BadRequestException('Invalid Course ID');

    const access = await this.enrollmentsService.getCourseAccess(
      studentId,
      courseId,
    );
    const owned = new Set(access.accessibleSections);
    if (
      access.accessType === PurchaseType.FULL_COURSE ||
      (access.totalSections > 0 && owned.size >= access.totalSections)
    ) {
      throw new ConflictException('You already have access to this content');
    }

    // Owns nothing → buy the whole course.
    if (access.accessType === 'none' || owned.size === 0) {
      await this.tryAdd(() =>
        this.addToCart(studentId, PurchaseType.FULL_COURSE, courseId),
      );
      return this.getCart(studentId);
    }

    // Owns some sections → add the ones they don't have yet.
    const course = await this.coursesService.findCourseDocument(courseId);
    const unowned = course.sections.filter(
      (s: any) => !owned.has(s._id.toString()),
    );
    const anyUnpriced = unowned.some(
      (s: any) => s.price === null || s.price === undefined,
    );

    if (anyUnpriced) {
      await this.tryAdd(() =>
        this.addToCart(studentId, PurchaseType.FULL_COURSE, courseId),
      );
    } else {
      for (const s of unowned) {
        await this.tryAdd(() =>
          this.addToCart(
            studentId,
            PurchaseType.SECTION,
            courseId,
            (s as any)._id.toString(),
          ),
        );
      }
    }

    return this.getCart(studentId);
  }

  /** Run an add, swallowing "already owned / already in cart" conflicts. */
  private async tryAdd(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof ConflictException)) throw e;
    }
  }

  async removeFromCart(
    studentId: string,
    itemId: string,
  ): Promise<CartResponse> {
    const cart = await this.cartModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });
    if (!cart) throw new NotFoundException('Cart not found');

    const initialLength = cart.items.length;
    // Assume frontend sends the cart item's _id or courseId/sectionId. Let's try _id first.
    cart.items = cart.items.filter((item) => {
      return (
        item._id?.toString() !== itemId &&
        item.courseId.toString() !== itemId &&
        item.sectionId?.toString() !== itemId
      );
    });

    if (cart.items.length === initialLength) {
      throw new NotFoundException('Item not found in cart');
    }

    if (cart.items.length === 0) {
      await this.cartModel.deleteOne({ _id: cart._id }).exec();
    } else {
      await cart.save();
    }
    return this.getCart(studentId);
  }

  async validateCart(studentId: string) {
    const cart = await this.cartModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });
    if (!cart || cart.items.length === 0) return true;

    let changed = false;

    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      const isOwned = await this.enrollmentsService.hasDuplicate(
        studentId,
        item.itemType,
        item.courseId.toString(),
        item.sectionId?.toString(),
      );
      if (isOwned) {
        cart.items.splice(i, 1);
        changed = true;
        continue;
      }

      try {
        const course = await this.coursesService.findCourseDocument(
          item.courseId.toString(),
        );
        let currentPrice = course.price;
        if (item.itemType === PurchaseType.SECTION) {
          const section = course.sections.find(
            (s: any) => s._id.toString() === item.sectionId?.toString(),
          );
          if (
            !section ||
            section.price === null ||
            section.price === undefined
          ) {
            cart.items.splice(i, 1);
            changed = true;
            continue;
          }
          currentPrice = section.price;
        } else {
          // FULL_COURSE is charged at the remaining balance (full price minus the
          // value of any sections the student already owns) — mirror addToCart so
          // a partial owner isn't re-priced up to the full course price here.
          const pricing =
            await this.enrollmentsService.getCoursePricingForStudent(
              studentId,
              item.courseId.toString(),
            );
          currentPrice = pricing.remainingPrice;
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
      if (cart.items.length === 0) {
        await this.cartModel.deleteOne({ _id: cart._id }).exec();
      } else {
        await cart.save();
      }
      throw new ConflictException(
        'Prices have changed or items are already owned, please review your cart',
      );
    }

    return cart;
  }

  /**
   * Silently drop any cart items the student now owns — used after a successful
   * purchase to empty the cart. Unlike validateCart, this NEVER throws; it's a
   * best-effort cleanup. Items not yet owned (e.g. added after checkout) stay.
   */
  async clearOwnedItems(studentId: string): Promise<void> {
    const cart = await this.cartModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });
    if (!cart || cart.items.length === 0) return;

    let changed = false;
    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      const isOwned = await this.enrollmentsService.hasDuplicate(
        studentId,
        item.itemType,
        item.courseId.toString(),
        item.sectionId?.toString(),
      );
      if (isOwned) {
        cart.items.splice(i, 1);
        changed = true;
      }
    }

    if (!changed) return;

    if (cart.items.length === 0) {
      await this.cartModel.deleteOne({ _id: cart._id }).exec();
    } else {
      await cart.save();
    }
  }
}
