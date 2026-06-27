import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAttachmentDto {
  @ApiPropertyOptional({
    description: 'Whether the attachment is visible to anyone (public) or restricted to enrolled students',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  filePublicId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fileType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  originalFilename?: string;
}
