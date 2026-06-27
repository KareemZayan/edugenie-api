import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller'; 
import { Attachment, AttachmentSchema } from './schema/attachment.schema'; 
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Attachment.name, schema: AttachmentSchema },
            { name: Course.name, schema: CourseSchema },
            { name: Enrollment.name, schema: EnrollmentSchema },
        ]),
        CloudinaryModule,
        EnrollmentsModule,
    ],
    controllers: [AttachmentsController],
    providers: [AttachmentsService],
    exports: [AttachmentsService],
})
export class AttachmentsModule { }