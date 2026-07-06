import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@Controller('certificates')
@ApiTags('Certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  // Public: verify a certificate by its code (QR target). No auth.
  @Get('verify/:code')
  @SkipThrottle()
  @ApiOperation({ summary: 'Publicly verify a certificate by code' })
  @ApiParam({ name: 'code', type: String })
  @SwaggerApiResponse({ status: 200, description: 'Verification result.' })
  async verify(@Param('code') code: string) {
    return this.certificates.getByCode(code);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'List my certificates' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async listMine(@CurrentUser() user: { userId: string }) {
    return this.certificates.listMine(user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Get one of my certificates' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 403, description: 'Not your certificate.' })
  @SwaggerApiResponse({ status: 404, description: 'Not found.' })
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.certificates.getForStudent(id, user.userId);
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Download my certificate as PDF (regenerated)' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 200, description: 'PDF stream.' })
  @SwaggerApiResponse({ status: 403, description: 'Not your certificate.' })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.certificates.renderPdf(id, user.userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="edugenie-certificate-${id}.pdf"`,
    );
    res.send(pdf);
  }
}
