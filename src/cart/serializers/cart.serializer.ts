import { Exclude, Expose, Type } from 'class-transformer';

export class CartItemSerializer {
  @Expose() id: string;
  @Expose() itemType: string;
  @Expose() courseId: any;
  @Expose() sectionId?: string;
  @Expose() price: number;

  @Exclude() _id?: any;

  constructor(partial: Partial<CartItemSerializer>) {
    Object.assign(this, partial);
    
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if ((partial as any).courseId) {
      const cId = (partial as any).courseId;
      if (cId && typeof cId === 'object' && cId._id) {
        this.courseId = Object.assign({}, cId);
        this.courseId.id = cId._id.toString();
        delete this.courseId._id;
      } else {
        this.courseId = cId?.toString() || cId;
      }
    }

    if ((partial as any).sectionId) {
      this.sectionId = (partial as any).sectionId.toString();
    }
  }
}

export class CartSerializer {
  @Expose() id: string;
  @Expose() studentId: string;
  
  @Expose()
  @Type(() => CartItemSerializer)
  items: CartItemSerializer[];

  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() _id?: any;
  @Exclude() __v?: number;

  constructor(partial: Partial<CartSerializer>) {
    Object.assign(this, partial);
    
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if ((partial as any).studentId) {
      this.studentId = (partial as any).studentId.toString();
    }

    if (this.items && Array.isArray(this.items)) {
      this.items = this.items.map((item: any) => new CartItemSerializer(
        typeof item.toObject === 'function' ? item.toObject() : item
      ));
    }
  }
}
