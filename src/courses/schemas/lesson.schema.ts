import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';


@Schema({ _id: true, timestamps: true })
export class Lesson {
    @Prop({ required: true, trim: true })
    title!: string;

    @Prop({ required: true })
    videoUrl!: string;

    @Prop({ required: true })
    videoPublicId!: string;

    @Prop({ required: true })
    videoDuration!: number;

    @Prop()
    transcript?: string;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);