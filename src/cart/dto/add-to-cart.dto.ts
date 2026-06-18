import { IsNotEmpty, IsMongoId, IsEnum, ValidateIf, IsOptional } from 'class-validator';

export enum CartItemType {
  COURSE = 'course',
  SECTION = 'section',
}

export class AddToCartDto {
  @IsEnum(CartItemType)
  @IsNotEmpty()
  itemType: CartItemType;

  @IsMongoId()
  @IsNotEmpty()
  courseId: string;

  @ValidateIf(o => o.itemType === CartItemType.SECTION)
  @IsMongoId()
  @IsNotEmpty()
  sectionId?: string;
}