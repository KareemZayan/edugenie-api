import {
  Controller,
  Post,
  Delete,
  Body,
  Headers,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiConsumes,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';
import { SignUploadDto } from './dto/sign-upload.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CloudinaryService } from './cloudinary.service';

import {  Get, Param } from '@nestjs/common';

class DeleteAssetDto {
  @IsNotEmpty()
  @IsString()
  publicId!: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  resourceType?: 'image' | 'video';
}

@Controller('cloudinary')
@ApiTags('Cloudinary')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post('sign')
  @ApiOperation({ summary: 'Sign upload request' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  signUploadRequest(@Body() body: SignUploadDto) {
    return this.cloudinaryService.generateSignature(body.folder, body.context);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Delete('delete')
  @ApiOperation({ summary: 'Delete asset' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  deleteAsset(@Body() body: DeleteAssetDto) {
    return this.cloudinaryService.deleteAsset(
      body.publicId,
      body.resourceType ?? 'image',
    );
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle webhook' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  async handleWebhook(
    @Headers('x-cld-signature') signature: string,
    @Headers('x-cld-timestamp') timestamp: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing Cloudinary signatures');
    }

    const isValid = this.cloudinaryService.verifyWebhookSignature(
      body,
      signature,
      timestamp,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid Cloudinary signature');
    }

    if (body.notification_type === 'upload') {
      await this.cloudinaryService.processUploadWebhook(body);
    }

    return { success: true };
  }


  

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post('trigger-transcription')
  @ApiOperation({ summary: 'Manually trigger transcription for a video' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async triggerTranscription(
    @Body() body: { publicId: string; courseId: string; sectionId: string; lessonId: string },
  ) {
    return this.cloudinaryService.triggerTranscription(
      body.publicId,
      body.courseId,
      body.sectionId,
      body.lessonId,
    );
  }

  @Get('test-transcript')
async testTranscript(@Query('publicId') publicId: string) {
  return this.cloudinaryService.testTranscription(publicId);
}
}
