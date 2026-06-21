import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AdminCategoriesService } from '../services/admin-categories.service';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../../categories/dto/update-category.dto';
import { CategoryResponse } from '../../common/interfaces/frontend-contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly adminCategoriesService: AdminCategoriesService) {}

  @Get()
  async getCategories(): Promise<CategoryResponse[]> {
    return this.adminCategoriesService.getCategories();
  }

  @Post()
  async createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.adminCategoriesService.createCategory(dto);
  }

  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ): Promise<CategoryResponse> {
    return this.adminCategoriesService.updateCategory(id, dto);
  }

  @Delete(':id')
  async deleteCategory(@Param('id') id: string): Promise<void> {
    return this.adminCategoriesService.deleteCategory(id);
  }
}
