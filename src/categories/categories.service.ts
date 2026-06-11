import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Category } from './schema/category.schema';
import { createCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) { }

  async createCategory(createCategoryDto: createCategoryDto): Promise<Category> {

    const existingCategory = await this.categoryModel.findOne({ name: createCategoryDto.name }).exec();

    if (existingCategory) {
      throw new ConflictException('Category already exists');
    }

    const newCategory = new this.categoryModel(createCategoryDto);
    return newCategory.save();
  }

  async findAll(): Promise<Category[]> {
    return this.categoryModel.find().exec();
  }
}
