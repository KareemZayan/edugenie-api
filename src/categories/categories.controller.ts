import { Body, Controller, Get, Post } from '@nestjs/common';

import { CategoriesService } from './categories.service';
import { createCategoryDto } from './dto/create-category.dto';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { CategoryResponse } from './interfaces/category-response.interface';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) { }

  @Post()
  async createCategory(@Body() createCategoryDto: createCategoryDto): Promise<ApiResponse<CategoryResponse>> {
    const category = await this.categoriesService.createCategory(createCategoryDto);
    return { success: true, data: category };
  }

  @Get()
  async findAll(): Promise<ApiResponse<CategoryResponse[]>> {
    const categories = await this.categoriesService.findAll();
    return { success: true, data: categories };
  }
}
