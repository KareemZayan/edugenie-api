import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Category,
  CategoryDocument,
} from '../../categories/schema/category.schema';
import { Course, CourseDocument } from '../../courses/schema/course.schema';
import {
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryResponse,
} from '../../common/interfaces/frontend-contracts';

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
        const courseCount = await this.courseModel
          .countDocuments({
            $expr: { $eq: [{ $toString: '$categoryId' }, cat._id.toString()] },
          })
          .exec();
        return {
          id: cat._id.toString(),
          name: cat.name,
          courseCount,
        };
      }),
    );

    return categoryResponses;
  }

  async createCategory(dto: CreateCategoryRequest): Promise<CategoryResponse> {
    const existingName = await this.categoryModel
      .findOne({ name: dto.name })
      .exec();
    if (existingName) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = new this.categoryModel(dto);
    const saved = await category.save();

    return {
      id: saved._id.toString(),
      name: saved.name,
      courseCount: 0,
    };
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryRequest,
  ): Promise<CategoryResponse> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name && dto.name !== category.name) {
      const existingName = await this.categoryModel
        .findOne({ name: dto.name })
        .exec();
      if (existingName) {
        throw new ConflictException('Category with this name already exists');
      }
      category.name = dto.name;
    }

    const updated = await category.save();
    const courseCount = await this.courseModel
      .countDocuments({
        $expr: { $eq: [{ $toString: '$categoryId' }, updated._id.toString()] },
      })
      .exec();

    return {
      id: updated._id.toString(),
      name: updated.name,
      courseCount,
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const courseCount = await this.courseModel
      .countDocuments({
        $expr: { $eq: [{ $toString: '$categoryId' }, category._id.toString()] },
      })
      .exec();
    if (courseCount > 0) {
      throw new ConflictException(
        `Cannot delete category with ${courseCount} courses assigned — reassign them first`,
      );
    }

    await this.categoryModel.findByIdAndDelete(id).exec();
  }
}
