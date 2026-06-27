import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';
import { CategoryResponse } from '../interfaces/category-response.interface';

export class CategorySerializer implements CategoryResponse {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: 'string_example' })
  name: string;
  @Expose()
  @ApiProperty({ required: false, example: 1 })
  courseCount?: number;
  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

  constructor(partial: Partial<CategorySerializer>) {
    Object.assign(this, partial);
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
  }
}
