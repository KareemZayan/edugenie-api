import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Category } from './schema/category.schema';
import { createCategoryDto } from './dto/create-category.dto';
import { CategorySerializer } from './serializers/category.serializer';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) { }

  async createCategory(createCategoryDto: createCategoryDto): Promise<CategorySerializer> {

    const existingCategory = await this.categoryModel.findOne({ name: createCategoryDto.name }).exec();

    if (existingCategory) {
      throw new ConflictException('Category already exists');
    }

    const newCategory = new this.categoryModel(createCategoryDto);
    const saved = await newCategory.save();
    return new CategorySerializer(saved.toObject());
  }

  async findAll(): Promise<CategorySerializer[]> {
    const categories = await this.categoryModel.find().exec();
    return categories.map(c => new CategorySerializer(c.toObject()));
  }

  async updateCategory(id: string, updateCategoryDto: any): Promise<Category> {
    const updatedCategory = await this.categoryModel.findByIdAndUpdate(
      id,
      updateCategoryDto,
      { new: true, runValidators: true }
    ).exec();

    if (!updatedCategory) {
      throw new ConflictException('Category not found');
    }

    return updatedCategory;
  }

  async removeCategory(id: string): Promise<any> {
    const deletedCategory = await this.categoryModel.findByIdAndDelete(id).exec();

    if (!deletedCategory) {
      throw new ConflictException('Category not found');
    }

    return { success: true, message: 'Category deleted successfully' };
  }
}
