import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsUrl,
    IsNumber,
    Min,
    Max,
    IsBoolean,
    IsOptional,
} from 'class-validator';

// One server-side ceiling matching the 25MB client-side check, so a request
// that bypasses the frontend (e.g. a raw API call) still gets rejected.
export const MAX_ATTACHMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export class CreateAttachmentDto {
    @IsString()
    @IsNotEmpty({ message: 'Attachment title is required' })
    @ApiProperty({ example: 'Course Syllabus' })
    title!: string;

    @IsString()
    @IsNotEmpty({ message: 'Original filename is required' })
    @ApiProperty({ example: 'syllabus-2026.pdf' })
    originalFilename!: string;

    @IsUrl({}, { message: 'Invalid file URL' })
    @IsNotEmpty()
    @ApiProperty({
        example:
            'https://res.cloudinary.com/demo/raw/upload/v1700000000/edugenie/courses/attachments/abc123/syllabus.pdf',
    })
    fileUrl!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'edugenie/courses/attachments/abc123/syllabus' })
    filePublicId!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'pdf' })
    fileType!: string;

    @IsNumber()
    @Min(1)
    @Max(MAX_ATTACHMENT_FILE_SIZE_BYTES, {
        message: 'Attachment must not exceed 25MB',
    })
    @ApiProperty({ example: 204800 })
    fileSize!: number;

    @IsBoolean()
    @IsOptional()
    @ApiProperty({ example: false, required: false })
    isPublic?: boolean;
}