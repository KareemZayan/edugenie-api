import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RedeemHandoffCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(32, 32)
  code: string;
}
