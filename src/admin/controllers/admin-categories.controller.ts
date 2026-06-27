import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
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
@ApiTags('Admin Categories')
export class AdminCategoriesController {
  constructor(
    private readonly adminCategoriesService: AdminCategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get categories' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getCategories(): Promise<CategoryResponse[]> {
    return this.adminCategoriesService.getCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: CreateCategoryDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async createCategory(
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.adminCategoriesService.createCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.adminCategoriesService.updateCategory(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete category' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async deleteCategory(@Param('id') id: string): Promise<void> {
    return this.adminCategoriesService.deleteCategory(id);
  }
}
