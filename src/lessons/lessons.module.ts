import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { Course, CourseSchema } from '../courses/schemas/course.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Course.name, schema: CourseSchema },
        ]),
    ],
    controllers: [LessonsController],
    providers: [LessonsService],
})
export class LessonsModule { }