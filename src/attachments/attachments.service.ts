import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Attachment,
    AttachmentParentType,
} from './schema/attachment.schema';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { AttachmentSerializer } from './serializers/attachments.serializer'; 
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';

const MAX_ATTACHMENTS_PER_PARENT = 5;

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
     * Verifies that the given course/section/lesson combination actually
     * exists and is owned by instructorId. Attachment is a separate
     * collection with no FK guarantee, so unlike embedded lessons (where the
     * findOneAndUpdate filter does double duty as existence+ownership check),
     * we have to verify this explicitly before writing.
     */
    private async verifyOwnershipAndExistence(
        parentType: AttachmentParentType,
        courseId: string,
        instructorId: string,
        sectionId?: string,
        lessonId?: string,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(courseId)) {
            throw new BadRequestException('Invalid course ID');
        }

        const baseFilter: Record<string, unknown> = {
            _id: new Types.ObjectId(courseId),
            instructorId: new Types.ObjectId(instructorId),
        };

        if (parentType === AttachmentParentType.COURSE) {
            const exists = await this.courseModel.exists(baseFilter);
            if (!exists) {
                throw new NotFoundException('Course not found or unauthorized');
            }
            return;
        }

        if (!sectionId || !Types.ObjectId.isValid(sectionId)) {
            throw new BadRequestException('Invalid section ID');
        }
        baseFilter['sections._id'] = new Types.ObjectId(sectionId);

        if (parentType === AttachmentParentType.SECTION) {
            const exists = await this.courseModel.exists(baseFilter);
            if (!exists) {
                throw new NotFoundException(
                    'Section not found, or course not owned by you',
                );
            }
            return;
        }

        // parentType === LESSON
        if (!lessonId || !Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException('Invalid lesson ID');
        }
        baseFilter['sections.lessons._id'] = new Types.ObjectId(lessonId);

        const exists = await this.courseModel.exists(baseFilter);
        if (!exists) {
            throw new NotFoundException(
                'Lesson not found under that course/section, or not owned by you',
            );
        }
    }

    private buildParentFilter(
        parentType: AttachmentParentType,
        courseId: string,
        sectionId?: string,
        lessonId?: string,
    ): Record<string, unknown> {
        const filter: Record<string, unknown> = {
            parentType,
            courseId: new Types.ObjectId(courseId),
        };
        if (parentType === AttachmentParentType.SECTION) {
            filter.sectionId = new Types.ObjectId(sectionId);
            filter.lessonId = null;
        } else if (parentType === AttachmentParentType.LESSON) {
            filter.sectionId = new Types.ObjectId(sectionId);
            filter.lessonId = new Types.ObjectId(lessonId);
        } else {
            filter.sectionId = null;
            filter.lessonId = null;
        }
        return filter;
    }

    async create(
        parentType: AttachmentParentType,
        courseId: string,
        instructorId: string,
        dto: CreateAttachmentDto,
        sectionId?: string,
        lessonId?: string,
    ): Promise<AttachmentSerializer> {
        await this.verifyOwnershipAndExistence(
            parentType,
            courseId,
            instructorId,
            sectionId,
            lessonId,
        );

        const parentFilter = this.buildParentFilter(
            parentType,
            courseId,
            sectionId,
            lessonId,
        );

        const currentCount = await this.attachmentModel.countDocuments(
            parentFilter,
        );
        if (currentCount >= MAX_ATTACHMENTS_PER_PARENT) {
            throw new BadRequestException(
                `Maximum of ${MAX_ATTACHMENTS_PER_PARENT} attachments reached for this ${parentType}`,
            );
        }

        const isPublic = parentType === AttachmentParentType.LESSON ? false : (dto.isPublic ?? false);

        const created = await this.attachmentModel.create({
            ...dto,
            isPublic,
            parentType,
            courseId: new Types.ObjectId(courseId),
            sectionId:
                parentType === AttachmentParentType.COURSE
                    ? null
                    : new Types.ObjectId(sectionId),
            lessonId:
                parentType === AttachmentParentType.LESSON
                    ? new Types.ObjectId(lessonId)
                    : null,
            instructorId: new Types.ObjectId(instructorId),
        });

        return new AttachmentSerializer(created.toObject());
    }

    /**
     * Reads, branching on access rule:
     * - course-level: public, no check
     * - section/lesson-level: enrollment-gated via canAccessSection, the same
     *   rule EnrollmentsService.canAccessLesson itself delegates to.
     */
    async findByParent(
        parentType: AttachmentParentType,
        courseId: string,
        sectionId?: string,
        lessonId?: string,
        requestingUser?: { userId: string; role: UserRole },
    ): Promise<AttachmentSerializer[]> {
        if (parentType !== AttachmentParentType.COURSE && !sectionId) {
            throw new BadRequestException('sectionId is required for this scope');
        }

        const parentFilter = this.buildParentFilter(
            parentType,
            courseId,
            sectionId,
            lessonId,
        );

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

        // Fetch course to find the instructor
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

        // Fetch enrollment context if we have an authenticated student
        let enrollment = null;
        if (requestingUserId && !isAdminOrSuperAdmin && !isInstructor) {
            enrollment = await this.enrollmentModel.findOne({
                studentId: new Types.ObjectId(requestingUserId),
                courseId: new Types.ObjectId(courseId),
            });
        }

        // Lesson attachments are strictly enrollment-only
        if (parentType === AttachmentParentType.LESSON) {
            const hasAccessToLesson =
                isAdminOrSuperAdmin ||
                isInstructor ||
                !!(
                    enrollment &&
                    (enrollment.type === PurchaseType.FULL_COURSE ||
                        (sectionId &&
                            enrollment.sectionIds
                                ?.map((id: any) => id.toString())
                                .includes(sectionId)))
                );
            if (!hasAccessToLesson) {
                throw new ForbiddenException(
                    'You must be enrolled to view these attachments',
                );
            }
        }

        const filtered = attachments.filter((attachment) => {
            // Public course/section attachments are visible to anyone
            if (attachment.isPublic && parentType !== AttachmentParentType.LESSON) {
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

            // Other users require a valid enrollment
            if (!enrollment) {
                return false;
            }

            // Course-level: restricted files require full course enrollment
            if (parentType === AttachmentParentType.COURSE) {
                return enrollment.type === PurchaseType.FULL_COURSE;
            }

            // Section/Lesson-level: restricted files require full course or section access
            if (
                parentType === AttachmentParentType.SECTION ||
                parentType === AttachmentParentType.LESSON
            ) {
                if (enrollment.type === PurchaseType.FULL_COURSE) {
                    return true;
                }
                if (sectionId && enrollment.sectionIds) {
                    return enrollment.sectionIds
                        .map((id: any) => id.toString())
                        .includes(sectionId);
                }
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
        parentType: AttachmentParentType,
        courseId: string,
        instructorId: string,
        sectionId?: string,
        lessonId?: string,
    ): Promise<AttachmentSerializer[]> {
        await this.verifyOwnershipAndExistence(
            parentType,
            courseId,
            instructorId,
            sectionId,
            lessonId,
        );

        const parentFilter = this.buildParentFilter(
            parentType,
            courseId,
            sectionId,
            lessonId,
        );

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

    /**
     * Cascading delete, called from CoursesService.remove,
     * SectionsService.removeSection, and LessonsService.removeLesson.
     * Destroys the Cloudinary asset for every matching attachment, then
     * removes the DB records in bulk.
     *
     * Pass only courseId to wipe everything under a course.
     * Pass courseId + sectionId to wipe everything under a section (including
     * that section's lesson attachments).
     * Pass courseId + sectionId + lessonId to wipe one lesson's attachments.
     */
    async removeAllFor(
        courseId: string,
        sectionId?: string,
        lessonId?: string,
    ): Promise<void> {
        const filter: Record<string, unknown> = {
            courseId: new Types.ObjectId(courseId),
        };
        if (lessonId) {
            filter.lessonId = new Types.ObjectId(lessonId);
        } else if (sectionId) {
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