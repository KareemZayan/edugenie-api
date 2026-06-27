import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose, Type } from 'class-transformer';

export class OrderItemSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  itemType: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: any;
  @Expose()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  sectionId?: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  instructorId: string;
  @Expose()
  @ApiProperty({ example: 1 })
  price: number;

  @Exclude()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  _id?: any;

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
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  studentId: string;
  @Expose()
  @ApiProperty({ example: 1 })
  totalAmount: number;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  status: string;

  @Expose()
  @Type(() => OrderItemSerializer)
  @ApiProperty()
  items: OrderItemSerializer[];

  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  _id?: any;
  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

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
      this.items = this.items.map(
        (item: any) =>
          new OrderItemSerializer(
            typeof item.toObject === 'function' ? item.toObject() : item,
          ),
      );
    }
  }
}
