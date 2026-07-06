import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';

import { StripeService } from './stripe.service';
import { User } from '../users/schema/user.schema';
import { Course } from '../courses/schema/course.schema';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { PayoutRequest } from '../earnings/schema/payout-request.schema';
import { PlatformConfig } from '../superadmin/schema/platform-config.schema';
import { Notification } from '../notifications/schema/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { CourseStatus } from '../common/enums/course-status.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

const DEFAULT_INSTRUCTOR_SHARE = 80;
const DEFAULT_PLATFORM_FEE = 20;

export interface ConnectStatus {
  hasAccount: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  balanceAvailable: number;
  balancePending: number;
}

/**
 * Stripe Connect (Express, destination charges) marketplace flow — TEST MODE.
 * Owns onboarding, student checkout, checkout fulfillment (Order + Enrollment +
 * Earning ledger), and instructor payouts. Reused by EarningsService (onboard,
 * status, request) and SuperAdminService (approve/sync a payout).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(PayoutRequest.name)
    private payoutRequestModel: Model<PayoutRequest>,
    @InjectModel(PlatformConfig.name)
    private platformConfigModel: Model<PlatformConfig>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
  ) {}

  get isConfigured(): boolean {
    return this.stripe.isConfigured;
  }

  private get dashboardUrl(): string {
    return (
      this.config.get<string>('DASHBOARD_URL') || 'http://localhost:4200'
    ).replace(/\/$/, '');
  }

  private get studentUrl(): string {
    return (
      this.config.get<string>('STUDENT_APP_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /** Days funds sit in the instructor's Stripe balance before auto-paying out. */
  private get payoutDelayDays(): number {
    const raw = Number(this.config.get<string>('PAYOUT_DELAY_DAYS'));
    return Number.isFinite(raw) && raw >= 0 ? raw : 7;
  }

  /**
   * Instructor payout countries Stripe can reach from a US platform. Defaults to
   * Stripe's cross-border set; override with SUPPORTED_PAYOUT_COUNTRIES (CSV).
   */
  private get supportedPayoutCountries(): string[] {
    const raw = this.config.get<string>('SUPPORTED_PAYOUT_COUNTRIES');
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
    }
    return ['US', 'GB', 'CA', 'CH', 'DE', 'FR', 'IE', 'NL', 'ES', 'IT', 'AU'];
  }

  isCountrySupported(country: string): boolean {
    return this.supportedPayoutCountries.includes((country || '').toUpperCase());
  }

  private async getShare(): Promise<{ share: number; fee: number }> {
    const config = await this.platformConfigModel.findOne().lean().exec();
    return {
      share: config?.instructorSharePercent ?? DEFAULT_INSTRUCTOR_SHARE,
      fee: config?.platformFeePercent ?? DEFAULT_PLATFORM_FEE,
    };
  }

  // ---- Connect onboarding ---------------------------------------------------

  /** Create the Express account if needed and return an onboarding link. */
  async onboard(
    instructorId: string,
    country = 'US',
  ): Promise<{ url: string }> {
    if (!this.stripe.isConfigured) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    const user = await this.userModel
      .findById(instructorId)
      .select('stripeAccountId email')
      .exec();
    if (!user) throw new NotFoundException('User not found');

    let accountId = user.get('stripeAccountId') as string | null;

    // A stored account can go stale — a Stripe test-data wipe or revoked access
    // leaves a dangling id. Verify it still exists; if not, forget it so we
    // create a fresh one below instead of erroring on a deleted account.
    if (accountId) {
      try {
        await this.stripe.retrieveAccount(accountId);
      } catch {
        this.logger.warn(
          `Stored Stripe account ${accountId} is gone/revoked — recreating.`,
        );
        accountId = null;
        await this.userModel
          .updateOne({ _id: user._id }, { $unset: { stripeAccountId: '' } })
          .exec();
      }
    }

    if (!accountId) {
      // Country gate — Stripe can't pay out everywhere (Rule 4). Only checked
      // when creating a NEW account (the country is fixed once set on Stripe).
      if (!this.isCountrySupported(country)) {
        throw new BadRequestException(
          `Payouts to "${country}" aren't supported yet. Supported: ${this.supportedPayoutCountries.join(', ')}.`,
        );
      }
      accountId = await this.stripe.createExpressAccount(user.email, country);
      await this.userModel
        .updateOne({ _id: user._id }, { $set: { stripeAccountId: accountId } })
        .exec();
    }

    // Put the account on an AUTOMATIC daily payout schedule (idempotent). Stripe
    // then pays the instructor's balance to their bank on its own — no manual
    // payout, no admin approval. Best-effort: don't block onboarding if it fails.
    try {
      await this.stripe.setAutomaticPayoutSchedule(
        accountId,
        this.payoutDelayDays,
      );
    } catch (err) {
      this.logger.warn(
        `setAutomaticPayoutSchedule failed for ${accountId}: ${(err as Error).message}`,
      );
    }

    const url = await this.stripe.createAccountLink(
      accountId,
      `${this.dashboardUrl}/stripe-callback?refresh=1`,
      `${this.dashboardUrl}/stripe-callback`,
    );
    return { url };
  }

  /** One-time login link to the instructor's Stripe Express dashboard. */
  async expressDashboardLink(instructorId: string): Promise<{ url: string }> {
    if (!this.stripe.isConfigured) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    const user = await this.userModel
      .findById(instructorId)
      .select('stripeAccountId')
      .lean<{ stripeAccountId?: string | null }>()
      .exec();
    if (!user?.stripeAccountId) {
      throw new BadRequestException('Finish Stripe onboarding first.');
    }
    const url = await this.stripe.createLoginLink(user.stripeAccountId);
    return { url };
  }

  /** Onboarding + capability + balance snapshot for the instructor. */
  async connectStatus(instructorId: string): Promise<ConnectStatus> {
    const empty: ConnectStatus = {
      hasAccount: false,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      balanceAvailable: 0,
      balancePending: 0,
    };
    if (!this.stripe.isConfigured) return empty;

    const user = await this.userModel
      .findById(instructorId)
      .select('stripeAccountId')
      .lean<{ stripeAccountId?: string | null }>()
      .exec();
    const accountId = user?.stripeAccountId;
    if (!accountId) return empty;

    try {
      const account = await this.stripe.retrieveAccount(accountId);
      const status: ConnectStatus = {
        hasAccount: true,
        detailsSubmitted: !!account.details_submitted,
        chargesEnabled: !!account.charges_enabled,
        payoutsEnabled: !!account.payouts_enabled,
        balanceAvailable: 0,
        balancePending: 0,
      };
      if (account.payouts_enabled) {
        const balance = await this.stripe.getConnectedBalance(accountId);
        status.balanceAvailable = balance.available;
        status.balancePending = balance.pending;
      }
      return status;
    } catch (err) {
      // A wiped/revoked account throws here — report "no account" so the UI
      // shows "Set up payouts" and onboarding recreates it (rather than getting
      // stuck showing a half-connected state for an account that's gone).
      this.logger.warn(
        `connectStatus failed for ${instructorId} (${accountId}): ${(err as Error).message}`,
      );
      return empty;
    }
  }

  // ---- Student checkout -----------------------------------------------------

  /** Create a destination-charge Checkout Session for a single full course. */
  async checkout(
    buyerId: string,
    courseId: string,
    origin: 'dashboard' | 'student' = 'dashboard',
  ): Promise<{ url: string }> {
    if (!this.stripe.isConfigured) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    if (!Types.ObjectId.isValid(courseId)) {
      throw new NotFoundException('Course not found');
    }
    const course = await this.courseModel
      .findById(courseId)
      .select('title price instructorId courseStatus')
      .lean<{
        _id: Types.ObjectId;
        title: string;
        price: number;
        instructorId: Types.ObjectId;
        courseStatus: CourseStatus;
      }>()
      .exec();
    if (!course) throw new NotFoundException('Course not found');

    if (course.instructorId.toString() === buyerId) {
      throw new ForbiddenException('You cannot buy your own course.');
    }
    if (course.courseStatus !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('This course is not available for purchase.');
    }
    if (!course.price || course.price <= 0) {
      throw new BadRequestException('This course is free — nothing to charge.');
    }

    // Already enrolled?
    const owned = await this.enrollmentModel
      .findOne({
        studentId: new Types.ObjectId(buyerId),
        courseId: course._id,
      })
      .lean()
      .exec();
    if (owned) throw new BadRequestException('You already own this course.');

    // Instructor must have finished Stripe onboarding to receive the transfer.
    const instructor = await this.userModel
      .findById(course.instructorId)
      .select('stripeAccountId')
      .lean<{ stripeAccountId?: string | null }>()
      .exec();
    const destination = instructor?.stripeAccountId;
    if (!destination) {
      throw new BadRequestException(
        'The instructor has not set up Stripe payouts yet.',
      );
    }
    let account: Stripe.Account;
    try {
      account = await this.stripe.retrieveAccount(destination);
    } catch {
      // Stored connected account is gone/revoked (e.g. test-data wipe) — the
      // instructor must re-onboard. Clean 400 instead of a raw Stripe 500.
      throw new BadRequestException(
        'The instructor has not set up Stripe payouts yet.',
      );
    }
    if (!account.charges_enabled) {
      throw new BadRequestException(
        'The instructor has not finished Stripe onboarding yet.',
      );
    }

    const priceCents = Math.round(course.price * 100);
    const { fee } = await this.getShare();
    const feeCents = Math.round((priceCents * fee) / 100);

    const returnBase =
      origin === 'student' ? this.studentUrl : this.dashboardUrl;
    const returnPath =
      origin === 'student' ? '/checkout/stripe-success' : '/buy-test';

    const session = await this.stripe.createCheckoutSession({
      courseTitle: course.title,
      priceCents,
      feeCents,
      destinationAccountId: destination,
      successUrl: `${returnBase}${returnPath}?purchase=success`,
      cancelUrl: `${returnBase}${returnPath}?purchase=cancel`,
      metadata: {
        courseId: course._id.toString(),
        buyerId,
        instructorId: course.instructorId.toString(),
      },
      // Include everything that shapes the session so an identical retry is
      // idempotent, but a changed destination/price/fee/origin (e.g. after the
      // instructor re-onboards to a new connected account) gets a fresh key
      // instead of colliding with the old request's parameters.
      idempotencyKey: `checkout_${buyerId}_${course._id.toString()}_${destination}_${priceCents}_${feeCents}_${origin}`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL.');
    }
    return { url: session.url };
  }

  /** Fulfill a paid Checkout Session: Order + Enrollment + Earning. Idempotent. */
  async fulfillCheckout(session: Stripe.Checkout.Session): Promise<void> {
    const courseId = session.metadata?.courseId;
    const buyerId = session.metadata?.buyerId;
    if (!courseId || !buyerId) {
      this.logger.warn(`checkout.session.completed missing metadata: ${session.id}`);
      return;
    }

    // Idempotency: skip if this session was already fulfilled.
    const existing = await this.orderModel
      .findOne({ stripeSessionId: session.id })
      .lean()
      .exec();
    if (existing) return;

    const course = await this.courseModel
      .findById(courseId)
      .select('title price instructorId')
      .lean<{
        _id: Types.ObjectId;
        title: string;
        price: number;
        instructorId: Types.ObjectId;
      }>()
      .exec();
    if (!course) {
      this.logger.warn(`Fulfillment: course ${courseId} not found`);
      return;
    }

    const studentObjId = new Types.ObjectId(buyerId);
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    // Stripe's processing fee on this charge — the platform absorbs it.
    const stripeFee = paymentIntentId
      ? await this.stripe.getPaymentFee(paymentIntentId)
      : 0;

    // 1) Order (COMPLETED).
    const [order] = await this.orderModel.create([
      {
        studentId: studentObjId,
        items: [
          {
            courseId: course._id,
            itemType: PurchaseType.FULL_COURSE,
            courseTitle: course.title,
            price: course.price,
          },
        ],
        totalAmount: course.price,
        status: OrderStatus.COMPLETED,
        paidAt: new Date(),
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeFee,
      },
    ]);

    // 2) Enrollment (full course). Upsert-safe against the unique index.
    try {
      await this.enrollmentModel.create({
        studentId: studentObjId,
        courseId: course._id,
        type: PurchaseType.FULL_COURSE,
        sectionIds: [],
      });
    } catch (err) {
      // Duplicate enrollment (already owned) — ignore.
      this.logger.warn(`Enrollment upsert: ${(err as Error).message}`);
    }

    // 3) Earning ledger entry (instructor share).
    const { share } = await this.getShare();
    const earningAmount = Math.round(course.price * (share / 100) * 100) / 100;
    await this.earningModel.create({
      instructorId: course.instructorId,
      orderId: order._id,
      courseId: course._id,
      sectionId: null,
      amount: earningAmount,
      status: EarningStatus.PENDING,
    });

    // 4) Notifications (best-effort).
    this.notifications
      .create(
        studentObjId,
        'Purchase Successful',
        `You now own "${course.title}". Enjoy!`,
        NotificationType.PURCHASE_COMPLETED,
        course._id.toString(),
      )
      .catch(() => {});
    this.notifications
      .create(
        course.instructorId,
        'New Enrollment',
        `A student just bought "${course.title}".`,
        NotificationType.NEW_ENROLLMENT,
        course._id.toString(),
      )
      .catch(() => {});
    this.notifications
      .create(
        course.instructorId,
        'Earning Recorded',
        `You earned ${earningAmount} from "${course.title}".`,
        NotificationType.EARNING_RECORDED,
        course._id.toString(),
      )
      .catch(() => {});
  }

  // ---- Disputes (chargebacks) ----------------------------------------------

  private async findOrderForDispute(
    dispute: Stripe.Dispute,
  ): Promise<Awaited<ReturnType<Model<Order>['findOne']>> | null> {
    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : (dispute.payment_intent?.id ?? null);
    if (!paymentIntentId) return null;
    return this.orderModel
      .findOne({ stripePaymentIntentId: paymentIntentId })
      .exec();
  }

  private async notify(
    userId: Types.ObjectId,
    title: string,
    message: string,
    type: string,
  ): Promise<void> {
    try {
      await this.notificationModel.create({
        userId,
        title,
        message,
        type,
        isRead: false,
      });
    } catch {
      /* best-effort */
    }
  }

  private async notifySuperadmins(
    title: string,
    message: string,
  ): Promise<void> {
    const admins = await this.userModel
      .find({ role: UserRole.SUPERADMIN })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    await Promise.all(
      admins.map((a) => this.notify(a._id, title, message, 'DISPUTE_OPENED')),
    );
  }

  /**
   * A chargeback was opened. With platform-as-merchant-of-record Stripe already
   * debits the disputed amount + fee from the PLATFORM balance; we just flag the
   * order and alert. No transfer reversal yet — that waits for a LOST outcome.
   */
  async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const order = await this.findOrderForDispute(dispute);
    if (!order) {
      this.logger.warn(`dispute.created: no order for PI ${String(dispute.payment_intent)}`);
      return;
    }
    if (order.disputeStatus === 'disputed') return; // idempotent
    order.disputeStatus = 'disputed';
    order.stripeChargeId =
      typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge?.id ?? null);
    await order.save();

    const courseTitle = order.items?.[0]?.courseTitle ?? 'a course';
    const instructorId = await this.orderInstructorId(order);
    if (instructorId) {
      await this.notify(
        instructorId,
        'Payment disputed',
        `A student opened a chargeback on "${courseTitle}". The platform is handling it.`,
        'DISPUTE_OPENED',
      );
    }
    await this.notifySuperadmins(
      'New payment dispute',
      `Chargeback opened on "${courseTitle}" (order ${order._id.toString()}). Amount ${order.totalAmount}.`,
    );
  }

  /**
   * A dispute closed. On LOST: claw the instructor's share back (reverse the
   * destination transfer) and revoke the student's access. On WON: just clear
   * the flag.
   */
  async handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    const order = await this.findOrderForDispute(dispute);
    if (!order) return;
    const courseTitle = order.items?.[0]?.courseTitle ?? 'a course';
    const instructorId = await this.orderInstructorId(order);

    if (dispute.status === 'won') {
      order.disputeStatus = 'won';
      await order.save();
      if (instructorId) {
        await this.notify(
          instructorId,
          'Dispute won',
          `The chargeback on "${courseTitle}" was resolved in our favour.`,
          'DISPUTE_RESOLVED',
        );
      }
      return;
    }
    if (dispute.status !== 'lost') return; // still open / other status

    // LOST — reverse the instructor's transfer to recover their share.
    if (order.disputeStatus !== 'lost') {
      try {
        const chargeId =
          order.stripeChargeId ||
          (typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id);
        if (chargeId) {
          const charge = await this.stripe.retrieveCharge(chargeId);
          const transferId =
            typeof charge.transfer === 'string'
              ? charge.transfer
              : (charge.transfer?.id ?? null);
          if (transferId) {
            order.stripeTransferId = transferId;
            await this.stripe.reverseTransfer(transferId);
          }
        }
      } catch (err) {
        this.logger.error(
          `Transfer reversal failed for order ${order._id.toString()}: ${(err as Error).message}`,
        );
      }
    }

    order.disputeStatus = 'lost';
    await order.save();

    // Claw back the earning + revoke access.
    await this.earningModel
      .updateMany(
        { orderId: order._id, status: { $ne: EarningStatus.REVERSED } },
        { $set: { status: EarningStatus.REVERSED } },
      )
      .exec();
    const courseId = order.items?.[0]?.courseId;
    if (courseId) {
      await this.enrollmentModel
        .deleteOne({ studentId: order.studentId, courseId })
        .exec();
    }

    if (instructorId) {
      await this.notify(
        instructorId,
        'Dispute lost',
        `The chargeback on "${courseTitle}" was lost. Your share was reversed and the student's access removed.`,
        'DISPUTE_RESOLVED',
      );
    }
    await this.notifySuperadmins(
      'Dispute lost',
      `Chargeback lost on "${courseTitle}" (order ${order._id.toString()}). Transfer reversed, access revoked.`,
    );
  }

  private async orderInstructorId(
    order: { items?: { courseId?: Types.ObjectId }[] },
  ): Promise<Types.ObjectId | null> {
    const courseId = order.items?.[0]?.courseId;
    if (!courseId) return null;
    const course = await this.courseModel
      .findById(courseId)
      .select('instructorId')
      .lean<{ instructorId?: Types.ObjectId }>()
      .exec();
    return course?.instructorId ?? null;
  }

  // ---- Payouts (superadmin-approved) ---------------------------------------

  private async notifyPayout(
    instructorId: Types.ObjectId,
    type: 'PAYOUT_PROCESSED' | 'PAYOUT_FAILED',
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.notificationModel.create({
        userId: instructorId,
        title,
        message,
        type,
        isRead: false,
      });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Fire the Stripe payout for an approved request. Called by SuperAdminService
   * on approve. Sets PROCESSING + gatewayReference, or FAILED on error (rethrows).
   */
  async createInstructorPayout(request: PayoutRequest): Promise<void> {
    const doc = request as PayoutRequest & {
      _id: Types.ObjectId;
      instructorId: Types.ObjectId;
      amount: number;
      status: PayoutRequestStatus;
      save: () => Promise<unknown>;
    };
    const instructor = await this.userModel
      .findById(doc.instructorId)
      .select('stripeAccountId')
      .lean<{ stripeAccountId?: string | null }>()
      .exec();
    const accountId = instructor?.stripeAccountId;

    if (!this.stripe.isConfigured || !accountId) {
      doc.status = PayoutRequestStatus.FAILED;
      doc.failureReason = accountId
        ? 'Stripe is not configured.'
        : 'Instructor has no Stripe account.';
      await doc.save();
      throw new ServiceUnavailableException(doc.failureReason);
    }

    try {
      const amountCents = Math.round(doc.amount * 100);
      const payout = await this.stripe.createPayout(
        accountId,
        amountCents,
        doc._id.toString(),
      );
      doc.status = PayoutRequestStatus.PROCESSING;
      doc.method = 'stripe';
      doc.gatewayProvider = 'stripe';
      doc.gatewayReference = payout.id;
      doc.reference = payout.id;
      doc.failureReason = null;
      await doc.save();
      await this.notifyPayout(
        doc.instructorId,
        'PAYOUT_PROCESSED',
        'Payout on its way',
        `Your payout of ${doc.amount} is being sent to your bank via Stripe.`,
      );
    } catch (err) {
      const reason = (err as Error).message || 'Stripe payout failed';
      doc.status = PayoutRequestStatus.FAILED;
      doc.failureReason = reason;
      await doc.save();
      await this.notifyPayout(
        doc.instructorId,
        'PAYOUT_FAILED',
        'Payout failed',
        reason,
      );
      throw new ServiceUnavailableException(`Stripe payout failed: ${reason}`);
    }
  }

  private async markSucceeded(
    doc: PayoutRequest & {
      _id: Types.ObjectId;
      instructorId: Types.ObjectId;
      amount: number;
      save: (opts?: unknown) => Promise<unknown>;
    },
  ): Promise<void> {
    const session = await this.earningModel.db.startSession();
    session.startTransaction();
    try {
      await this.earningModel.updateMany(
        { instructorId: doc.instructorId, status: EarningStatus.REQUESTED },
        { $set: { status: EarningStatus.PAID_OUT } },
        { session },
      );
      doc.status = PayoutRequestStatus.APPROVED;
      doc.failureReason = null;
      doc.processedAt = new Date();
      await doc.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
    await this.notifyPayout(
      doc.instructorId,
      'PAYOUT_PROCESSED',
      'Payout completed',
      `Your payout of ${doc.amount} has been paid to your bank.`,
    );
  }

  private async markFailed(
    doc: PayoutRequest & {
      instructorId: Types.ObjectId;
      save: () => Promise<unknown>;
    },
    reason: string,
  ): Promise<void> {
    doc.status = PayoutRequestStatus.FAILED;
    doc.failureReason = reason;
    await doc.save();
    await this.notifyPayout(
      doc.instructorId,
      'PAYOUT_FAILED',
      'Payout failed',
      reason,
    );
  }

  /**
   * Poll Stripe for the payout status of a PROCESSING request and finalize it.
   * Used by the superadmin "sync" button (no webhook needed).
   */
  async finalizePayoutStatus(
    requestId: string,
  ): Promise<{ status: PayoutRequestStatus; detail?: string }> {
    const doc = await this.payoutRequestModel.findById(requestId).exec();
    if (!doc) return { status: PayoutRequestStatus.FAILED, detail: 'Not found' };
    if (doc.status !== PayoutRequestStatus.PROCESSING) {
      return { status: doc.status, detail: 'Not in progress' };
    }
    if (!doc.gatewayReference) {
      return { status: doc.status, detail: 'No gateway reference' };
    }
    const instructor = await this.userModel
      .findById(doc.instructorId)
      .select('stripeAccountId')
      .lean<{ stripeAccountId?: string | null }>()
      .exec();
    if (!instructor?.stripeAccountId) {
      return { status: doc.status, detail: 'Instructor has no Stripe account' };
    }

    const payout = await this.stripe.retrievePayout(
      instructor.stripeAccountId,
      doc.gatewayReference,
    );
    return this.applyPayoutStatus(doc as never, payout.status);
  }

  /** Finalize from a webhook payout.paid / payout.failed event. */
  async applyPayoutWebhook(payout: Stripe.Payout): Promise<void> {
    const doc = await this.payoutRequestModel
      .findOne({ gatewayReference: payout.id })
      .exec();
    if (!doc || doc.status !== PayoutRequestStatus.PROCESSING) return;
    await this.applyPayoutStatus(doc as never, payout.status);
  }

  private async applyPayoutStatus(
    doc: PayoutRequest & {
      _id: Types.ObjectId;
      instructorId: Types.ObjectId;
      amount: number;
      status: PayoutRequestStatus;
      save: (opts?: unknown) => Promise<unknown>;
    },
    stripeStatus: string,
  ): Promise<{ status: PayoutRequestStatus; detail?: string }> {
    if (stripeStatus === 'paid') {
      await this.markSucceeded(doc);
      return { status: PayoutRequestStatus.APPROVED, detail: 'Paid' };
    }
    if (stripeStatus === 'failed' || stripeStatus === 'canceled') {
      await this.markFailed(doc, `Stripe payout ${stripeStatus}`);
      return { status: PayoutRequestStatus.FAILED, detail: stripeStatus };
    }
    return { status: PayoutRequestStatus.PROCESSING, detail: stripeStatus };
  }
}
