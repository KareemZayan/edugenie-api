import { IsEnum, IsOptional } from 'class-validator';
import { PaginateQueryDto } from '../../common/dto/paginate-query.dto';
import { ReportStatus } from '../../common/enums/report-status.enum';
import { ReportType } from '../../common/enums/report-type.enum';

export class AdminReportsFilterDto extends PaginateQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
}
