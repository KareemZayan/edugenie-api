import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttachmentDocument = HydratedDocument<Attachment>;

export enum AttachmentParentType {
    COURSE = 'course',
    SECTION = 'section',
    LESSON = 'lesson',
}

@Schema({ timestamps: true })
export class Attachment {
    @Prop({
        type: String,
        enum: AttachmentParentType,
        required: true,
        index: true,
    })
    parentType!: AttachmentParentType;

    // Always set — used for ownership checks and cascading delete on course removal.
    @Prop({
        type: Types.ObjectId,
        ref: 'Course',
        required: true,
        index: true,
    })
    courseId!: Types.ObjectId;

    // Set when parentType is 'section' or 'lesson'.
    @Prop({
        type: Types.ObjectId,
        default: null,
        index: true,
    })
    sectionId?: Types.ObjectId | null;

    // Set only when parentType is 'lesson'.
    @Prop({
        type: Types.ObjectId,
        default: null,
        index: true,
    })
    lessonId?: Types.ObjectId | null;

    // Denormalized so attachment ownership can be checked without a join,
    // mirroring the instructorId-in-filter pattern used everywhere else.
    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    })
    instructorId!: Types.ObjectId;

    @Prop({ required: true, trim: true })
    title!: string;

    // Cloudinary public_id is often a hash — this preserves what the
    // instructor actually uploaded so the frontend can render a real name.
    @Prop({ required: true, trim: true })
    originalFilename!: string;

    @Prop({ required: true })
    fileUrl!: string;

    @Prop({ required: true })
    filePublicId!: string;

    // Extension or mime type, used by the frontend to pick a file-type icon.
    @Prop({ required: true, trim: true })
    fileType!: string;

    // Bytes. Enforced at 25MB client-side; stored for display and as a
    // server-side sanity check on create.
    @Prop({ required: true, min: 0 })
    fileSize!: number;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

// Used by AttachmentsService to enforce the 5-per-parent cap quickly.
AttachmentSchema.index({ parentType: 1, courseId: 1, sectionId: 1, lessonId: 1 });