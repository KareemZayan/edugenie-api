import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
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
export class CartController {
  constructor(private readonly cartService: CartService) { }

  @Get()
  async getCart(@CurrentUser() user: { userId: string }) {
    const response = await this.cartService.getCart(user.userId);
    return { success: true, message: 'Cart retrieved successfully', data: response };
  }

  @Post()
  async addToCart(
    @Body() addToCartDto: AddToCartDto,
    @CurrentUser() user: { userId: string }
  ) {
    const response = await this.cartService.addToCart(user.userId, addToCartDto.type, addToCartDto.courseId, addToCartDto.sectionId);
    return { success: true, message: 'Added to cart', data: response };
  }

  @Delete(':itemId')
  async removeFromCart(
    @Param('itemId') itemId: string,
    @CurrentUser() user: { userId: string }
  ) {
    const response = await this.cartService.removeFromCart(user.userId, itemId);
    return { success: true, message: 'Removed from cart', data: response };
  }
}