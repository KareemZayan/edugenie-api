import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttachmentDocument = HydratedDocument<Attachment>;

@Schema({ timestamps: true })
export class Attachment {
    // Kept for ownership checks and cascading delete when a course is removed.
    @Prop({
        type: Types.ObjectId,
        ref: 'Course',
        required: true,
        index: true,
    })
    courseId!: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        required: true,
        index: true,
    })
    sectionId!: Types.ObjectId;

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

    @Prop({ type: Boolean, default: false })
    isPublic!: boolean;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

// Used by AttachmentsService to enforce the 5-per-section cap quickly.
AttachmentSchema.index({ courseId: 1, sectionId: 1 });