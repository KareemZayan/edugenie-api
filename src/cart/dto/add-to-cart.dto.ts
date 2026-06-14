import { IsNotEmpty, IsMongoId } from 'class-validator';

export class AddToCartDto {
  @IsMongoId()
  @IsNotEmpty()
  courseId: string;
}