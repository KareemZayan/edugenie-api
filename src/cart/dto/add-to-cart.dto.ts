import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsMongoId, IsEnum, ValidateIf } from 'class-validator';
import { PurchaseType } from '../../common/enums/purchase-type.enum';

export class AddToCartDto {
  @IsEnum(PurchaseType)
  @ApiProperty()
  type: PurchaseType;

  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;

  @ValidateIf((o) => o.type === 'section')
  @IsMongoId()
  @IsNotEmpty({ message: 'sectionId is required when type is section' })
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  sectionId?: string;
}
