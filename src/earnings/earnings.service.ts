import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Earning } from './schema/earning.schema';
import { PayoutRequest } from './schema/payout-request.schema';
import { Course } from '../courses/schema/course.schema';
import { PlatformConfig } from '../superadmin/schema/platform-config.schema';
import { User } from '../users/schema/user.schema';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';
import {
  EarningsPayoutResponse,
  EarningStatusValue,
  PayoutRequestStatusValue,
} from '../common/interfaces/frontend-contracts';

// Fallbacks if the superadmin has never saved a PlatformConfig yet.
const DEFAULT_INSTRUCTOR_SHARE = 80;
const DEFAULT_PLATFORM_FEE = 20;
const DEFAULT_MIN_PAYOUT = 50;

@Injectable()
export class EarningsService {
  constructor(
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(PayoutRequest.name)
    private payoutRequestModel: Model<PayoutRequest>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(PlatformConfig.name)
    private platformConfigModel: Model<PlatformConfig>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /** Partially hide an email for display: `jane@example.com` → `j***@example.com`. */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const head = local.slice(0, 1);
    return `${head}***@${domain}`;
  }

  /** Return the instructor's saved PayPal payout email (masked), or null. */
  async getPayoutMethod(
    instructorId: string,
  ): Promise<{ paypalEmail: string | null; updatedAt: Date | null }> {
    const user = await this.userModel
      .findById(instructorId)
      .select('payoutPaypal')
      .lean<{ payoutPaypal?: { email?: string; updatedAt?: Date } | null }>()
      .exec();
    const email = user?.payoutPaypal?.email ?? null;
    return {
      paypalEmail: email ? this.maskEmail(email) : null,
      updatedAt: user?.payoutPaypal?.updatedAt ?? null,
    };
  }

  /** Set/replace the instructor's PayPal payout email. */
  async setPayoutMethod(
    instructorId: string,
    paypalEmail: string,
  ): Promise<{ paypalEmail: string; updatedAt: Date }> {
    const email = paypalEmail.trim().toLowerCase();
    const updatedAt = new Date();
    await this.userModel
      .updateOne(
        { _id: new Types.ObjectId(instructorId) },
        { $set: { payoutPaypal: { email, verifiedAt: null, updatedAt } } },
      )
      .exec();
    return { paypalEmail: this.maskEmail(email), updatedAt };
  }

  /**
   * Clear the saved PayPal payout email. Blocked while a payout is open
   * (PENDING/PROCESSING) so we never lose the destination of an in-flight payout.
   */
  async clearPayoutMethod(instructorId: string): Promise<{ cleared: boolean }> {
    const instructorObjId = new Types.ObjectId(instructorId);
    const open = await this.payoutRequestModel
      .findOne({
        instructorId: instructorObjId,
        status: {
          $in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.PROCESSING],
        },
      })
      .lean()
      .exec();
    if (open) {
      throw new ConflictException(
        'You have a payout in progress. You can change your PayPal email after it is resolved.',
      );
    }
    await this.userModel
      .updateOne(
        { _id: instructorObjId },
        { $set: { payoutPaypal: null } },
      )
      .exec();
    return { cleared: true };
  }

  private async getConfig() {
    const config = await this.platformConfigModel.findOne().lean().exec();
    return {
      instructorSharePercent:
        config?.instructorSharePercent ?? DEFAULT_INSTRUCTOR_SHARE,
      platformFeePercent: config?.platformFeePercent ?? DEFAULT_PLATFORM_FEE,
      minimumPayoutThreshold:
        config?.minimumPayoutThreshold ?? DEFAULT_MIN_PAYOUT,
    };
  }

  async getMyPayouts(instructorId: string): Promise<EarningsPayoutResponse> {
    const instructorObjId = new Types.ObjectId(instructorId);

    const [config, earnings, requests] = await Promise.all([
      this.getConfig(),
      this.earningModel
        .find({ instructorId: instructorObjId })
        .lean()
        .exec() as unknown as Promise<
        Array<{
          amount: number;
          status: string;
          sectionId?: Types.ObjectId;
          courseId?: Types.ObjectId;
          createdAt: Date;
          orderId?: Types.ObjectId;
        }>
      >,
      this.payoutRequestModel
        .find({ instructorId: instructorObjId })
        .sort({ createdAt: -1 })
        .lean()
        .exec() as unknown as Promise<
        Array<{
          _id: Types.ObjectId;
          amount: number;
          earningsCount: number;
          status: string;
          method: string | null;
          reference: string | null;
          gatewayReference?: string | null;
          failureReason?: string | null;
          note: string | null;
          processedAt: Date | null;
          createdAt: Date;
        }>
      >,
    ]);

    let totalEarned = 0;
    let pending = 0;
    let inReview = 0;
    let paidOut = 0;
    let fromFullCourses = 0;
    let fromSections = 0;

    // Batch-load every referenced course once (avoid N+1).
    const courseIds = Array.from(
      new Set(
        earnings.filter((e) => e.courseId).map((e) => e.courseId!.toString()),
      ),
    ).map((id) => new Types.ObjectId(id));

    const courses = (await this.courseModel
      .find({ _id: { $in: courseIds } })
      .select('title sections')
      .lean()
      .exec()) as unknown as Array<{
      _id: Types.ObjectId;
      title: string;
      sections: Array<{ _id: Types.ObjectId; title: string }>;
    }>;

    const courseById = new Map(courses.map((c) => [c._id.toString(), c]));

    const history = earnings.map((e) => {
      totalEarned += e.amount;
      if (e.status === EarningStatus.PENDING) pending += e.amount;
      else if (e.status === EarningStatus.REQUESTED) inReview += e.amount;
      else if (e.status === EarningStatus.PAID_OUT) paidOut += e.amount;

      const type = e.sectionId ? 'section' : 'full_course';
      if (type === 'section') fromSections += e.amount;
      else fromFullCourses += e.amount;

      let courseTitle = 'Unknown Course';
      let sectionTitle: string | null = null;
      if (e.courseId) {
        const course = courseById.get(e.courseId.toString());
        if (course) {
          courseTitle = course.title;
          if (e.sectionId && course.sections) {
            const section = course.sections.find(
              (s) => s._id.toString() === e.sectionId?.toString(),
            );
            if (section) sectionTitle = section.title;
          }
        }
      }

      return {
        date: e.createdAt,
        amount: e.amount,
        status: e.status as EarningStatusValue,
        type: type as 'section' | 'full_course',
        courseTitle,
        sectionTitle,
        orderId: e.orderId ? e.orderId.toString() : 'Unknown',
      };
    });

    history.sort((a, b) => b.date.getTime() - a.date.getTime());

    const openRequestDoc = requests.find(
      (r) =>
        r.status === PayoutRequestStatus.PENDING ||
        r.status === PayoutRequestStatus.PROCESSING,
    );

    return {
      config: {
        instructorSharePercent: config.instructorSharePercent,
        platformFeePercent: config.platformFeePercent,
        minimumPayoutThreshold: config.minimumPayoutThreshold,
      },
      totals: { totalEarned, pending, inReview, paidOut },
      // Back-compat alias.
      totalEarned,
      pendingPayout: pending,
      canRequest: !openRequestDoc && pending >= config.minimumPayoutThreshold,
      openRequest: openRequestDoc
        ? {
            id: openRequestDoc._id.toString(),
            amount: openRequestDoc.amount,
            earningsCount: openRequestDoc.earningsCount,
            status: openRequestDoc.status as PayoutRequestStatusValue,
            requestedAt: openRequestDoc.createdAt,
          }
        : null,
      breakdown: { fromFullCourses, fromSections },
      requests: requests.map((r) => ({
        id: r._id.toString(),
        amount: r.amount,
        earningsCount: r.earningsCount,
        status: r.status as PayoutRequestStatusValue,
        method: r.method,
        reference: r.reference,
        gatewayReference: r.gatewayReference ?? null,
        failureReason: r.failureReason ?? null,
        note: r.note,
        requestedAt: r.createdAt,
        processedAt: r.processedAt,
      })),
      history,
    };
  }

  /**
   * Instructor asks to be paid. Locks their PENDING earnings into REQUESTED and
   * opens a single PayoutRequest for the superadmin to approve/reject.
   */
  async requestPayout(instructorId: string) {
    const instructorObjId = new Types.ObjectId(instructorId);
    const config = await this.getConfig();

    // A payout destination is required — this is where the money will be sent.
    const user = await this.userModel
      .findById(instructorId)
      .select('payoutPaypal')
      .lean<{ payoutPaypal?: { email?: string } | null }>()
      .exec();
    const paypalEmail = user?.payoutPaypal?.email;
    if (!paypalEmail) {
      throw new BadRequestException(
        'Add a PayPal payout email before requesting a payout.',
      );
    }

    // One open request at a time.
    const existing = await this.payoutRequestModel
      .findOne({
        instructorId: instructorObjId,
        status: {
          $in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.PROCESSING],
        },
      })
      .lean()
      .exec();
    if (existing) {
      throw new ConflictException(
        'You already have a payout request in progress.',
      );
    }

    const pendingEarnings = await this.earningModel
      .find({ instructorId: instructorObjId, status: EarningStatus.PENDING })
      .select('amount')
      .lean()
      .exec();

    const amount =
      Math.round(pendingEarnings.reduce((s, e) => s + e.amount, 0) * 100) / 100;

    if (pendingEarnings.length === 0) {
      throw new BadRequestException('You have no pending earnings to withdraw.');
    }
    if (amount < config.minimumPayoutThreshold) {
      throw new BadRequestException(
        `You need at least ${config.minimumPayoutThreshold} EGP in pending earnings to request a payout.`,
      );
    }

    const session = await this.earningModel.db.startSession();
    session.startTransaction();
    try {
      await this.earningModel.updateMany(
        { instructorId: instructorObjId, status: EarningStatus.PENDING },
        { $set: { status: EarningStatus.REQUESTED } },
        { session },
      );

      const [created] = await this.payoutRequestModel.create(
        [
          {
            instructorId: instructorObjId,
            amount,
            earningsCount: pendingEarnings.length,
            status: PayoutRequestStatus.PENDING,
            // Snapshot the destination so a later profile edit can't reroute
            // this in-flight payout.
            destination: { type: 'paypal', paypalEmail },
          },
        ],
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return {
        id: created._id.toString(),
        amount: created.amount,
        earningsCount: created.earningsCount,
        status: created.status as PayoutRequestStatus,
        requestedAt: (created as unknown as { createdAt: Date }).createdAt,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}
