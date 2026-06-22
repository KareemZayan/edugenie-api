import { Exclude, Expose } from 'class-transformer';
import { CategoryResponse } from '../interfaces/category-response.interface';

export class CategorySerializer implements CategoryResponse {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() courseCount?: number;
  @Exclude() __v?: number;

  constructor(partial: Partial<CategorySerializer>) {
    Object.assign(this, partial);
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
  }
}
