import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Earning } from './schema/earning.schema';
import { PayoutRequest } from './schema/payout-request.schema';
import { Course } from '../courses/schema/course.schema';
import { PlatformConfig } from '../superadmin/schema/platform-config.schema';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';
import { PaymentsService } from '../payments/payments.service';
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
    private readonly payments: PaymentsService,
  ) {}

  /** Start / resume Stripe Connect onboarding — returns a hosted link URL. */
  async onboard(instructorId: string): Promise<{ url: string }> {
    return this.payments.onboard(instructorId);
  }

  /** Onboarding + capability + balance snapshot for the instructor. */
  async connectStatus(instructorId: string) {
    return this.payments.connectStatus(instructorId);
  }

  /** One-time link to the instructor's Stripe Express dashboard (payout history). */
  async expressDashboard(instructorId: string): Promise<{ url: string }> {
    return this.payments.expressDashboardLink(instructorId);
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

    const [config, earnings, requests, stripe] = await Promise.all([
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
      this.payments.connectStatus(instructorId),
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
      // Payouts are AUTOMATIC now — Stripe pays the instructor's balance out to
      // their bank on a schedule. No manual request/approval step.
      payoutsAutomatic: true,
      canRequest: false,
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
      stripe,
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
   * DEPRECATED — payouts are automatic. Stripe pays the instructor's connected-
   * account balance out to their bank on the account's payout schedule, so there
   * is no manual request/approval step. Kept as a guarded endpoint so any stale
   * client gets a clear message instead of a 404.
   */
  requestPayout(_instructorId: string): never {
    throw new BadRequestException(
      'Payouts are automatic. Your Stripe balance is paid out to your bank on a schedule — no request needed. Open your Stripe dashboard to see payout status.',
    );
  }
}
