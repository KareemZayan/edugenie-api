import { Body, Controller, Get, Post } from '@nestjs/common';

import { CategoriesService } from './categories.service';
import { createCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) { }


  @Post()
  createCategory(@Body() createCategoryDto: createCategoryDto) {
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
