import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SectionsService } from '../sections/sections.service';
import { SectionsController } from './sections.controller';
import { Course, CourseSchema } from '../courses/schemas/course.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Course.name, schema: CourseSchema },
        ]),
    ],
    controllers: [SectionsController],
    providers: [SectionsService],
})
export class SectionsModule { }