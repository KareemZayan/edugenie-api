import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto, UploadLessonVideoDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';

@UseGuards(JwtAuthGuard)
@Controller('courses/:courseId/sections/:sectionId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) { }

  @Post()
  addLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() createLessonDto: CreateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;

    return this.lessonsService.addLesson(
      courseId,
      sectionId,
      instructorId,
      createLessonDto,
    );
  }

  @Patch(':lessonId')
  updateLesson(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.updateLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
      updateLessonDto,
    );
  }

  @Delete(':lessonId')
  removeLesson(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.removeLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
    );
  }



  @Post('video')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: '/tmp', // Vercel ONLY allows writing to the /tmp folder!
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `lesson-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Log to terminal to help debug if it fails again
        console.log('Incoming file:', { mimetype: file.mimetype, originalname: file.originalname });

        // Make regex case-insensitive with 'i' flag
        const isValidExtension = file.originalname.match(/\.(mp4|mov|avi)$/i);
        const isValidMimeType = file.mimetype.includes('video') || file.mimetype === 'application/octet-stream';

        if (!isValidMimeType || !isValidExtension) {
          return cb(new BadRequestException('Only .mp4, .mov, or .avi video files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )

  async addLessonWithVideo(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: any,
    @Body() createLessonDto: UploadLessonVideoDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('A video file is required to create a lesson!');
    }
    return this.lessonsService.addLessonWithVideo(
      courseId,
      sectionId,
      req.user.userId,
      createLessonDto,
      file.path,
    );
  }
}
