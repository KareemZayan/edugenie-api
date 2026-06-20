import { Exclude, Expose, Type } from 'class-transformer';

export class OrderItemSerializer {
  @Expose() id: string;
  @Expose() itemType: string;
  @Expose() courseId: any;
  @Expose() sectionId?: string;
  @Expose() instructorId: string;
  @Expose() price: number;

  @Exclude() _id?: any;

  constructor(partial: Partial<OrderItemSerializer>) {
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

    if ((partial as any).instructorId) {
      this.instructorId = (partial as any).instructorId.toString();
    }
  }
}

export class OrderSerializer {
  @Expose() id: string;
  @Expose() studentId: string;
  @Expose() totalAmount: number;
  @Expose() status: string;
  
  @Expose()
  @Type(() => OrderItemSerializer)
  items: OrderItemSerializer[];

  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() _id?: any;
  @Exclude() __v?: number;

  constructor(partial: Partial<OrderSerializer>) {
    Object.assign(this, partial);
    
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if ((partial as any).studentId) {
      this.studentId = (partial as any).studentId.toString();
    }

    if (this.items && Array.isArray(this.items)) {
      this.items = this.items.map((item: any) => new OrderItemSerializer(
        typeof item.toObject === 'function' ? item.toObject() : item
      ));
    }
  }
}
