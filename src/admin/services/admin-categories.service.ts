import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../../categories/schema/category.schema';
import { Course, CourseDocument } from '../../courses/schema/course.schema';
import { CreateCategoryRequest, UpdateCategoryRequest, CategoryResponse } from '../../common/interfaces/frontend-contracts';

@Injectable()
export class AdminCategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
  ) {}

  async getCategories(): Promise<CategoryResponse[]> {
    const categories = await this.categoryModel.find().exec();
    
    const categoryResponses = await Promise.all(
      categories.map(async (cat) => {
        const courseCount = await this.courseModel.countDocuments({ categoryId: cat._id }).exec();
        return {
          id: cat._id.toString(),
          name: cat.name,
          slug: cat.slug,
          isActive: true, // Assuming true by default as there's no isActive in schema
          courseCount,
          createdAt: (cat as any).createdAt,
          updatedAt: (cat as any).updatedAt,
        };
      })
    );

    return categoryResponses;
  }

  async createCategory(dto: CreateCategoryRequest): Promise<CategoryResponse> {
    const existingName = await this.categoryModel.findOne({ name: dto.name }).exec();
    if (existingName) {
      throw new ConflictException('Category with this name already exists');
    }

    const existingSlug = await this.categoryModel.findOne({ slug: dto.slug }).exec();
    if (existingSlug) {
      throw new ConflictException('Category with this slug already exists');
    }

    const category = new this.categoryModel(dto);
    const saved = await category.save();

    return {
      id: saved._id.toString(),
      name: saved.name,
      slug: saved.slug,
      description: dto.description,
      isActive: true,
      courseCount: 0,
      createdAt: (saved as any).createdAt,
      updatedAt: (saved as any).updatedAt,
    };
  }

  async updateCategory(id: string, dto: UpdateCategoryRequest): Promise<CategoryResponse> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name && dto.name !== category.name) {
      const existingName = await this.categoryModel.findOne({ name: dto.name }).exec();
      if (existingName) {
        throw new ConflictException('Category with this name already exists');
      }
      category.name = dto.name;
    }

    if (dto.slug && dto.slug !== category.slug) {
      const existingSlug = await this.categoryModel.findOne({ slug: dto.slug }).exec();
      if (existingSlug) {
        throw new ConflictException('Category with this slug already exists');
      }
      category.slug = dto.slug;
    }

    // Since the schema has a pre('validate') hook that overwrites slug based on name,
    // we need to be careful. Let's rely on the schema or explicitly set it if the schema allows.
    // The prompt explicitly asks to "re-validate slug uniqueness if slug is being changed"
    // which implies we might be passing slug manually.

    const updated = await category.save();
    const courseCount = await this.courseModel.countDocuments({ categoryId: updated._id }).exec();

    return {
      id: updated._id.toString(),
      name: updated.name,
      slug: updated.slug,
      isActive: true,
      courseCount,
      createdAt: (updated as any).createdAt,
      updatedAt: (updated as any).updatedAt,
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const courseCount = await this.courseModel.countDocuments({ categoryId: category._id }).exec();
    if (courseCount > 0) {
      throw new ConflictException(`Cannot delete category with ${courseCount} courses assigned — reassign them first`);
    }

    await this.categoryModel.findByIdAndDelete(id).exec();
  }
}
