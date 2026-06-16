import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { SignUploadDto } from './dto/sign-upload.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CloudinaryService } from './cloudinary.service';

@Controller('cloudinary')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post('sign')
  signUploadRequest(@Body() signUploadDto: SignUploadDto) {
    return this.cloudinaryService.generateSignature(signUploadDto.folder);
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Headers('x-cld-signature') signature: string,
    @Headers('x-cld-timestamp') timestamp: string,
    @Body() body: any,
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

    // Process the webhook success notification
    if (body.notification_type === 'upload') {
      await this.cloudinaryService.processUploadWebhook(body);
    }

    return { success: true };
  }
}
