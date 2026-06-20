import { IsNotEmpty, IsMongoId, IsEnum, ValidateIf } from 'class-validator';
import { PurchaseType } from '../../common/enums/purchase-type.enum';

export class AddToCartDto {
  @IsEnum(PurchaseType)
  type: PurchaseType;

  @IsMongoId()
  @IsNotEmpty()
  courseId: string;

  @ValidateIf(o => o.type === 'section')
  @IsMongoId()
  @IsNotEmpty({ message: 'sectionId is required when type is section' })
  sectionId?: string;
}