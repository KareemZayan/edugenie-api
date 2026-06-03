import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Lesson, LessonSchema } from './lesson.schema';

@Schema({ _id: true, timestamps: true })
export class Section {
    @Prop({ required: true, trim: true })
    title!: string;

    @Prop({ required: true, minlength: 10 })
    description!: string;

    @Prop({ type: [String], default: [] })
    expectedOutcomes!: string[];

    @Prop({ default: false })
    isBasicSection!: boolean;

    @Prop({ type: [LessonSchema], default: [] })
    lessons!: Lesson[];
    id: any;
}

export const SectionSchema = SchemaFactory.createForClass(Section);