import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiExcludeController,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('App')
@ApiExcludeController()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get hello' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
