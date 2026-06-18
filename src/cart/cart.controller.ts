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
  getCart(@CurrentUser() user: { userId: string }) {
    return this.cartService.getCart(user.userId);
  }

  @Post()
  addToCart(
    @Body() addToCartDto: AddToCartDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.cartService.addToCart(user.userId, addToCartDto);
  }

  @Delete(':itemId')
  removeFromCart(
    @Param('itemId') itemId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.cartService.removeFromCart(user.userId, itemId);
  }
}