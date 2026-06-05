import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Lesson, LessonSchema } from './lesson.schema';

export type SectionDocument = HydratedDocument<Section>;

@Schema({ timestamps: true })
export class Section {


    @Prop({ required: true, trim: true, index: true })
    title!: string;

    @Prop({
        required: true,
        trim: true,
        minlength: 10,
    })
    description!: string;

    @Prop({ type: [String], default: [] })
    expectedOutcomes!: string[];

    @Prop({ default: false })
    isBasicSection!: boolean;

    @Prop({ type: [LessonSchema], default: [] })
    lessons!: Types.DocumentArray<Lesson>;
}

export const SectionSchema = SchemaFactory.createForClass(Section);