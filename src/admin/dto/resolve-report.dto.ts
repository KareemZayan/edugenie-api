import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ReportResolvedAction } from '../../common/enums/report-action.enum';

export class ResolveReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolution!: string;

  @IsEnum(ReportResolvedAction)
  action!: ReportResolvedAction;
}
