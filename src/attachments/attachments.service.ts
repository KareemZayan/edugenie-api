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
import { EnrollmentsService } from '../enrollments/enrollments.service';

const MAX_ATTACHMENTS_PER_SECTION = 5;

@Injectable()
export class AttachmentsService {
    constructor(
        @InjectModel(Attachment.name)
        private readonly attachmentModel: Model<Attachment>,
        @InjectModel(Course.name) private readonly courseModel: Model<Course>,
        @InjectModel(Enrollment.name)
        private readonly enrollmentModel: Model<Enrollment>,
        private readonly cloudinaryService: CloudinaryService,
        private readonly enrollmentsService: EnrollmentsService,
    ) { }

    /**
     * Verifies that the given course/section combination actually exists and
     * is owned by instructorId. Attachment is a separate collection with no
     * FK guarantee, so we verify this explicitly before writing.
     */
    private async verifyOwnershipAndExistence(
        courseId: string,
        sectionId: string,
        instructorId: string,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(courseId)) {
            throw new BadRequestException('Invalid course ID');
        }
        if (!Types.ObjectId.isValid(sectionId)) {
            throw new BadRequestException('Invalid section ID');
        }

        const exists = await this.courseModel.exists({
            _id: new Types.ObjectId(courseId),
            instructorId: new Types.ObjectId(instructorId),
            'sections._id': new Types.ObjectId(sectionId),
        });

        if (!exists) {
            throw new NotFoundException(
                'Section not found, or course not owned by you',
            );
        }
    }

    private buildParentFilter(
        courseId: string,
        sectionId: string,
    ): Record<string, unknown> {
        return {
            courseId: new Types.ObjectId(courseId),
            sectionId: new Types.ObjectId(sectionId),
        };
    }

    async create(
        courseId: string,
        sectionId: string,
        instructorId: string,
        dto: CreateAttachmentDto,
    ): Promise<AttachmentSerializer> {
        await this.verifyOwnershipAndExistence(courseId, sectionId, instructorId);

        const parentFilter = this.buildParentFilter(courseId, sectionId);

        const currentCount = await this.attachmentModel.countDocuments(
            parentFilter,
        );
        if (currentCount >= MAX_ATTACHMENTS_PER_SECTION) {
            throw new BadRequestException(
                `Maximum of ${MAX_ATTACHMENTS_PER_SECTION} attachments reached for this section`,
            );
        }

        const created = await this.attachmentModel.create({
            ...dto,
            isPublic: dto.isPublic ?? false,
            courseId: new Types.ObjectId(courseId),
            sectionId: new Types.ObjectId(sectionId),
            instructorId: new Types.ObjectId(instructorId),
        });

        return new AttachmentSerializer(created.toObject());
    }

    /**
     * Student/public read, enrollment-gated.
     */
    async findByParent(
        courseId: string,
        sectionId: string,
        requestingUser?: { userId: string; role: UserRole },
    ): Promise<AttachmentSerializer[]> {
        const parentFilter = this.buildParentFilter(courseId, sectionId);

        const attachments = await this.attachmentModel
            .find(parentFilter)
            .sort({ createdAt: 1 })
            .exec();

        if (attachments.length === 0) {
            return [];
        }

        const requestingUserId = requestingUser?.userId;
        const requestingUserRole = requestingUser?.role;

        const isAdminOrSuperAdmin =
            requestingUserRole === UserRole.ADMIN ||
            requestingUserRole === UserRole.SUPERADMIN;

        const course = await this.courseModel
            .findById(courseId)
            .select('instructorId')
            .exec();
        if (!course) {
            throw new NotFoundException('Course not found');
        }

        const isInstructor =
            requestingUserId &&
            course.instructorId.toString() === requestingUserId;

        let enrollment = null;
        if (requestingUserId && !isAdminOrSuperAdmin && !isInstructor) {
            enrollment = await this.enrollmentModel.findOne({
                studentId: new Types.ObjectId(requestingUserId),
                courseId: new Types.ObjectId(courseId),
            });
        }

        const filtered = attachments.filter((attachment) => {
            // Public attachments are visible to anyone
            if (attachment.isPublic) {
                return true;
            }

            // Restricted attachments require authentication
            if (!requestingUserId) {
                return false;
            }

            // Admins, Super Admins, and course Instructor can access any attachment
            if (isAdminOrSuperAdmin || isInstructor) {
                return true;
            }

            // Other users require a valid enrollment covering this section
            if (!enrollment) {
                return false;
            }

            if (enrollment.type === PurchaseType.FULL_COURSE) {
                return true;
            }
            if (enrollment.sectionIds) {
                return enrollment.sectionIds
                    .map((id: any) => id.toString())
                    .includes(sectionId);
            }

            return false;
        });

        return filtered.map((a) => new AttachmentSerializer(a.toObject()));
    }

    /**
     * Instructor-facing read for the course builder — same data, no enrollment
     * gating, but ownership-checked instead.
     */
    async findByParentForInstructor(
        courseId: string,
        instructorId: string,
        sectionId: string,
    ): Promise<AttachmentSerializer[]> {
        await this.verifyOwnershipAndExistence(courseId, sectionId, instructorId);

        const parentFilter = this.buildParentFilter(courseId, sectionId);

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
     * Cascading delete, called from CoursesService.remove and
     * SectionsService.removeSection. Destroys the Cloudinary asset for every
     * matching attachment, then removes the DB records in bulk.
     *
     * Pass only courseId to wipe everything under a course.
     * Pass courseId + sectionId to wipe one section's attachments.
     */
    async removeAllFor(
        courseId: string,
        sectionId?: string,
    ): Promise<void> {
        const filter: Record<string, unknown> = {
            courseId: new Types.ObjectId(courseId),
        };
        if (sectionId) {
            filter.sectionId = new Types.ObjectId(sectionId);
        }

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