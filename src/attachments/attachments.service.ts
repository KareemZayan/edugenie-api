import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attachment } from './schema/attachment.schema';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AttachmentSerializer } from './serializers/attachments.serializer';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

const MAX_ATTACHMENTS_PER_LESSON = 5;

@Injectable()
export class AttachmentsService {
    constructor(
        @InjectModel(Attachment.name)
        private readonly attachmentModel: Model<Attachment>,
        @InjectModel(Course.name) private readonly courseModel: Model<Course>,
        @InjectModel(Enrollment.name)
        private readonly enrollmentModel: Model<Enrollment>,
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    /**
     * Verifies that the lesson (and therefore its parent section and course)
     * exists and is owned by instructorId. Throws otherwise.
     */
    private async verifyLessonOwnership(
        courseId: string,
        sectionId: string,
        lessonId: string,
        instructorId: string,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(courseId)) throw new BadRequestException('Invalid course ID');
        if (!Types.ObjectId.isValid(sectionId)) throw new BadRequestException('Invalid section ID');
        if (!Types.ObjectId.isValid(lessonId)) throw new BadRequestException('Invalid lesson ID');

        const exists = await this.courseModel.exists({
            _id: new Types.ObjectId(courseId),
            instructorId: new Types.ObjectId(instructorId),
            'sections._id': new Types.ObjectId(sectionId),
            'sections.lessons._id': new Types.ObjectId(lessonId),
        });

        if (!exists) {
            throw new NotFoundException('Lesson not found, or course not owned by you');
        }
    }

    private buildParentFilter(
        courseId: string,
        sectionId: string,
        lessonId: string,
    ): Record<string, unknown> {
        return {
            courseId: new Types.ObjectId(courseId),
            sectionId: new Types.ObjectId(sectionId),
            lessonId: new Types.ObjectId(lessonId),
        };
    }

    async create(
        courseId: string,
        sectionId: string,
        lessonId: string,
        instructorId: string,
        dto: CreateAttachmentDto,
    ): Promise<AttachmentSerializer> {
        await this.verifyLessonOwnership(courseId, sectionId, lessonId, instructorId);

        const parentFilter = this.buildParentFilter(courseId, sectionId, lessonId);

        const currentCount = await this.attachmentModel.countDocuments(parentFilter);
        if (currentCount >= MAX_ATTACHMENTS_PER_LESSON) {
            throw new BadRequestException(
                `Maximum of ${MAX_ATTACHMENTS_PER_LESSON} attachments reached for this lesson`,
            );
        }

        const created = await this.attachmentModel.create({
            ...dto,
            courseId: new Types.ObjectId(courseId),
            sectionId: new Types.ObjectId(sectionId),
            lessonId: new Types.ObjectId(lessonId),
            instructorId: new Types.ObjectId(instructorId),
        });

        return new AttachmentSerializer(created.toObject());
    }

    /**
     * Student read — enrollment-gated. All lesson attachments are private;
     * the student must be enrolled in the course (full or via the parent section).
     */
    async findByLesson(
        courseId: string,
        sectionId: string,
        lessonId: string,
        requestingUser?: { userId: string; role: UserRole },
    ): Promise<AttachmentSerializer[]> {
        const parentFilter = this.buildParentFilter(courseId, sectionId, lessonId);

        const attachments = await this.attachmentModel
            .find(parentFilter)
            .sort({ createdAt: 1 })
            .exec();

        if (attachments.length === 0) return [];

        const requestingUserId = requestingUser?.userId;
        const requestingUserRole = requestingUser?.role;

        const isAdminOrSuperAdmin =
            requestingUserRole === UserRole.ADMIN ||
            requestingUserRole === UserRole.SUPERADMIN;

        if (!requestingUserId && !isAdminOrSuperAdmin) return [];

        const course = await this.courseModel
            .findById(courseId)
            .select('instructorId')
            .exec();
        if (!course) throw new NotFoundException('Course not found');

        const isInstructor =
            requestingUserId &&
            course.instructorId.toString() === requestingUserId;

        if (isAdminOrSuperAdmin || isInstructor) {
            return attachments.map((a) => new AttachmentSerializer(a.toObject()));
        }

        // Regular student: must be enrolled
        const enrollment = await this.enrollmentModel.findOne({
            studentId: new Types.ObjectId(requestingUserId!),
            courseId: new Types.ObjectId(courseId),
        });

        if (!enrollment) return [];

        if (enrollment.type === PurchaseType.FULL_COURSE) {
            return attachments.map((a) => new AttachmentSerializer(a.toObject()));
        }

        // Section-level purchase: must cover the lesson's parent section
        const hasSection = enrollment.sectionIds
            ?.map((id: any) => id.toString())
            .includes(sectionId);

        if (!hasSection) return [];

        return attachments.map((a) => new AttachmentSerializer(a.toObject()));
    }

    /**
     * Instructor-facing read for the course builder — ownership-checked, no
     * enrollment gating.
     */
    async findByLessonForInstructor(
        courseId: string,
        sectionId: string,
        lessonId: string,
        instructorId: string,
    ): Promise<AttachmentSerializer[]> {
        await this.verifyLessonOwnership(courseId, sectionId, lessonId, instructorId);

        const parentFilter = this.buildParentFilter(courseId, sectionId, lessonId);

        const attachments = await this.attachmentModel
            .find(parentFilter)
            .sort({ createdAt: 1 })
            .exec();

        return attachments.map((a) => new AttachmentSerializer(a.toObject()));
    }

    async remove(
        attachmentId: string,
        instructorId: string,
    ): Promise<{ message: string }> {
        if (!Types.ObjectId.isValid(attachmentId)) {
            throw new BadRequestException('Invalid attachment ID');
        }

        const attachment = await this.attachmentModel.findOneAndDelete({
            _id: new Types.ObjectId(attachmentId),
            instructorId: new Types.ObjectId(instructorId),
        });

        if (!attachment) {
            throw new NotFoundException('Attachment not found or unauthorized');
        }

        await this.cloudinaryService.deleteAsset(
            attachment.filePublicId,
            'raw' as any,
        );

        return { message: 'Attachment successfully deleted' };
    }

    async update(
        attachmentId: string,
        instructorId: string,
        updates: UpdateAttachmentDto,
    ): Promise<AttachmentSerializer> {
        if (!Types.ObjectId.isValid(attachmentId)) {
            throw new BadRequestException('Invalid attachment ID');
        }

        const existing = await this.attachmentModel.findOne({
            _id: new Types.ObjectId(attachmentId),
            instructorId: new Types.ObjectId(instructorId),
        });

        if (!existing) {
            throw new NotFoundException('Attachment not found or unauthorized');
        }

        const oldPublicId = existing.filePublicId;
        const isReplacingFile = updates.filePublicId && updates.filePublicId !== oldPublicId;

        const attachment = await this.attachmentModel.findByIdAndUpdate(
            attachmentId,
            { $set: updates },
            { new: true },
        );

        if (isReplacingFile && oldPublicId) {
            this.cloudinaryService.deleteAsset(oldPublicId, 'raw' as any).catch((err) => {
                console.error(`Failed to delete old attachment asset: ${oldPublicId}`, err);
            });
        }

        return new AttachmentSerializer(attachment!.toObject());
    }

    /**
     * Cascading delete — called from CoursesService.remove and
     * SectionsService / LessonsService delete hooks.
     *
     * Pass only courseId to wipe everything under a course.
     * Pass courseId + sectionId to wipe one section's lessons' attachments.
     * Pass all three to wipe one lesson's attachments.
     */
    async removeAllFor(
        courseId: string,
        sectionId?: string,
        lessonId?: string,
    ): Promise<void> {
        const filter: Record<string, unknown> = {
            courseId: new Types.ObjectId(courseId),
        };
        if (sectionId) filter.sectionId = new Types.ObjectId(sectionId);
        if (lessonId) filter.lessonId = new Types.ObjectId(lessonId);

        const attachments = await this.attachmentModel.find(filter).exec();
        if (attachments.length === 0) return;

        await Promise.all(
            attachments.map((a) =>
                this.cloudinaryService.deleteAsset(a.filePublicId, 'raw' as any),
            ),
        );

        await this.attachmentModel.deleteMany(filter);
    }
}