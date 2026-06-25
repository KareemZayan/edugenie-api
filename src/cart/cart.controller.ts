import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT) // Only students can have carts!
@Controller('cart')
@ApiTags('Cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get cart' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getCart(@CurrentUser() user: { userId: string }) {
    const response = await this.cartService.getCart(user.userId);
    return {
      success: true,
      message: 'Cart retrieved successfully',
      data: response,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Add to cart' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: AddToCartDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async addToCart(
    @Body() addToCartDto: AddToCartDto,
    @CurrentUser() user: { userId: string },
  ) {
    const response = await this.cartService.addToCart(
      user.userId,
      addToCartDto.type,
      addToCartDto.courseId,
      addToCartDto.sectionId,
    );
    return { success: true, message: 'Added to cart', data: response };
  }

  @Delete(':itemId')
  @ApiOperation({ summary: 'Remove from cart' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'itemId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async removeFromCart(
    @Param('itemId') itemId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const response = await this.cartService.removeFromCart(user.userId, itemId);
    return { success: true, message: 'Removed from cart', data: response };
  }
}
