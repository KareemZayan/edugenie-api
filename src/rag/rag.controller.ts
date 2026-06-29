import { Controller, Post, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { IndexingService } from './indexing.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rag')
@ApiTags('Rag')
@ApiBearerAuth()
@ApiCookieAuth('jwt')
export class RagController {
  constructor(private readonly indexing: IndexingService) {}

  @Post('reindex/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: "Index or refresh a course's lesson transcripts for RAG",
  })
  @ApiParam({ name: 'courseId', type: String })
  reindex(@Param('courseId') courseId: string) {
    return this.indexing.reindexCourse(courseId);
  }

  @Post('backfill')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Backfill the RAG index across courses (bounded)' })
  backfill(@Query('max') max?: string) {
    const n = Math.min(100, Math.max(1, Number(max) || 25));
    return this.indexing.backfill(n);
  }

  @Post('reindex-catalog')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Index published courses as catalog cards (roadmap recommendations)',
  })
  reindexCatalog() {
    return this.indexing.reindexCatalog();
  }

  @Get('status/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'How many RAG chunks a course has indexed' })
  @ApiParam({ name: 'courseId', type: String })
  status(@Param('courseId') courseId: string) {
    return this.indexing.courseStatus(courseId);
  }
}
