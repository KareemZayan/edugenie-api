import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ReportResolvedAction } from '../../common/enums/report-action.enum';

export class ResolveReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @ApiProperty({ example: 'string_example' })
  resolution!: string;

  @IsEnum(ReportResolvedAction)
  @ApiProperty()
  action!: ReportResolvedAction;
}
