import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User } from '../users/schema/user.schema';
import { Earning, EarningDocument } from '../earnings/schema/earning.schema';
import {
  PayoutRequest,
  PayoutRequestDocument,
} from '../earnings/schema/payout-request.schema';
import {
  AuditLog,
  AuditLogDocument,
} from '../audit-logs/schemas/audit-log.schema';
import {
  PlatformConfig,
  PlatformConfigDocument,
} from './schema/platform-config.schema';
import {
  WebhookFailureLog,
  WebhookFailureLogDocument,
} from './schema/webhook-failure-log.schema';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schema/notification.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { PayoutRequestStatus } from '../common/enums/payout-request-status.enum';
import { ProcessPayoutDto } from './dto/process-payout.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { AuditLogsFilterDto } from './dto/audit-logs-filter.dto';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';
import {
  AdminInvite,
  AdminInviteDocument,
} from './schema/admin-invite.schema';
import { MailService } from '../mail/mail.service';
import { CreateAdminInviteDto } from './dto/create-admin-invite.dto';
import {
  SuperAdminDashboardOverviewResponse,
  AdminListItem,
  AdminActivityPaginatedResponse,
  PendingPayoutPaginatedResponse,
  PayoutProcessResponse,
  PlatformConfigResponse,
  AuditLogPaginatedResponse,
  SystemHealthResponse,
} from '../common/interfaces/frontend-contracts';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Earning.name) private earningModel: Model<EarningDocument>,
    @InjectModel(PayoutRequest.name)
    private payoutRequestModel: Model<PayoutRequestDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(PlatformConfig.name)
    private platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(WebhookFailureLog.name)
    private webhookFailureLogModel: Model<WebhookFailureLogDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(AdminInvite.name)
    private adminInviteModel: Model<AdminInviteDocument>,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private readonly INVITE_TTL_HOURS = 48;

  /**
   * Invites a new administrator by email. Creates a single-use, hashed,
   * time-limited invite token and emails an acceptance link. No user record is
   * created until the invite is accepted, so abandoned invites leave no
   * half-provisioned privileged accounts behind.
   */
  async inviteAdmin(
    superAdminId: string,
    dto: CreateAdminInviteDto,
  ): Promise<{
    message: string;
    email: string;
    expiresAt: Date;
    emailSent: boolean;
    inviteUrl?: string;
  }> {
    const email = dto.email.toLowerCase().trim();

    // Reject if a user with this email already exists.
    const existingUser = await this.userModel.countDocuments({ email }).exec();
    if (existingUser > 0) {
      throw new ConflictException('A user with this email already exists');
    }

    // Generate a high-entropy raw token; only its hash is persisted.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() + this.INVITE_TTL_HOURS * 60 * 60 * 1000,
    );

    // Replace any prior unaccepted invite for the same email (re-invite flow).
    await this.adminInviteModel.deleteMany({ email, acceptedAt: null }).exec();

    await this.adminInviteModel.create({
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      tokenHash,
      role: UserRole.ADMIN,
      invitedBy: new Types.ObjectId(superAdminId),
      expiresAt,
    });

    const dashboardUrl = (
      this.configService.get<string>('DASHBOARD_URL') || 'http://localhost:4200'
    ).replace(/\/$/, '');
    const inviteUrl = `${dashboardUrl}/accept-invite?token=${rawToken}`;

    await this.auditLogModel.create({
      action: 'ADMIN_INVITED',
      performedBy: new Types.ObjectId(superAdminId),
      details: { email, role: UserRole.ADMIN },
    });

    let emailSent = false;
    try {
      await this.mailService.sendAdminInvite({
        to: email,
        firstName: dto.firstName.trim(),
        inviteUrl,
        expiresInHours: this.INVITE_TTL_HOURS,
      });
      emailSent = this.mailService.isConfigured;
    } catch {
      // Invite is persisted; surface a soft failure so the superadmin can retry.
      emailSent = false;
    }

    return {
      message: emailSent
        ? 'Invitation email sent'
        : 'Invitation created (email not configured — share the link manually)',
      email,
      expiresAt,
      emailSent,
      // Only expose the raw link when we could NOT email it (dev / misconfig).
      inviteUrl: emailSent ? undefined : inviteUrl,
    };
  }

  async listAdminInvites(): Promise<
    Array<{
      email: string;
      firstName: string;
      lastName: string;
      invitedAt: Date;
      expiresAt: Date;
      status: 'pending' | 'expired';
    }>
  > {
    const invites = await this.adminInviteModel
      .find({ acceptedAt: null })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const now = Date.now();
    return invites.map((inv: any) => ({
      email: inv.email,
      firstName: inv.firstName,
      lastName: inv.lastName,
      invitedAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      status: new Date(inv.expiresAt).getTime() < now ? 'expired' : 'pending',
    }));
  }

  /**
   * Revokes an admin's access by deactivating their account. The account and
   * password are preserved (role stays `admin`); they simply can't log in
   * anymore — enforced by the login/JWT status checks. Reversible via unrevoke.
   */
  async revokeAdmin(
    superAdminId: string,
    targetId: string,
  ): Promise<{ id: string; status: UserStatus }> {
    if (targetId === superAdminId) {
      throw new ForbiddenException('You cannot revoke your own account');
    }

    const admin = await this.userModel.findById(targetId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    if (admin.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only admin accounts can be revoked here');
    }
    if (admin.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('This admin is already revoked');
    }

    admin.status = UserStatus.DEACTIVATED;
    admin.deactivatedReason = 'Admin access revoked by superadmin';
    admin.deactivatedAt = new Date();
    admin.deactivatedBy = new Types.ObjectId(superAdminId);
    await admin.save();

    await this.auditLogModel.create({
      action: 'ADMIN_REVOKED',
      performedBy: new Types.ObjectId(superAdminId),
      targetUser: admin._id,
      details: { email: admin.email },
    });

    return { id: admin._id.toString(), status: admin.status };
  }

  /** Restores a previously-revoked admin's access (reactivates the account). */
  async unrevokeAdmin(
    superAdminId: string,
    targetId: string,
  ): Promise<{ id: string; status: UserStatus }> {
    const admin = await this.userModel.findById(targetId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    if (admin.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only admin accounts can be restored here');
    }
    if (admin.status === UserStatus.ACTIVE) {
      throw new BadRequestException('This admin is already active');
    }

    admin.status = UserStatus.ACTIVE;
    admin.deactivatedReason = null;
    admin.deactivatedAt = null;
    admin.deactivatedBy = null;
    await admin.save();

    await this.auditLogModel.create({
      action: 'ADMIN_UNREVOKED',
      performedBy: new Types.ObjectId(superAdminId),
      targetUser: admin._id,
      details: { email: admin.email },
    });

    return { id: admin._id.toString(), status: admin.status };
  }

  async getDashboardOverview(): Promise<SuperAdminDashboardOverviewResponse> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch platform config first to apply the correct fee/share split
    const config = await this.platformConfigModel.findOne().lean().exec();
    const platformFeePercent = config?.platformFeePercent ?? 20;
    const instructorSharePercent = config?.instructorSharePercent ?? 80;

    const [
      grossRevenueResult,
      unpaidGrossResult,
      activeAdminsCount,
      pendingPayoutsResult,
      webhookFailures,
    ] = await Promise.all([
      // Total gross sales (full course price collected)
      this.earningModel
        .aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
        .exec(),
      // Gross sales not yet paid out to instructors
      this.earningModel
        .aggregate([
          { $match: { status: { $ne: EarningStatus.PAID_OUT } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
      this.userModel
        .countDocuments({ role: UserRole.ADMIN, status: UserStatus.ACTIVE })
        .exec(),
      this.earningModel
        .aggregate([
          { $match: { status: EarningStatus.PENDING } },
          {
            $group: {
              _id: '$instructorId',
              oldestDate: { $min: '$createdAt' },
            },
          },
        ])
        .exec(),
      this.webhookFailureLogModel
        .find({ occurredAt: { $gte: twentyFourHoursAgo } })
        .sort({ occurredAt: -1 })
        .exec(),
    ]);

    const grossRevenue = grossRevenueResult[0]?.total || 0;
    const unpaidGross = unpaidGrossResult[0]?.total || 0;

    // Platform Revenue = only the platform's share (e.g. 20% of gross)
    const platformRevenue = Math.round((grossRevenue * platformFeePercent) / 100 * 100) / 100;
    // Payout Liability = what the platform owes instructors from unpaid earnings (e.g. 80% of unpaid gross)
    const payoutLiability = Math.round((unpaidGross * instructorSharePercent) / 100 * 100) / 100;
    const pendingPayouts = pendingPayoutsResult.length;

    const criticalAlerts: any[] = [];

    // Group webhook failures by service
    if (webhookFailures.length > 0) {
      const serviceGroups = webhookFailures.reduce(
        (acc, curr) => {
          acc[curr.service] = acc[curr.service] || {
            count: 0,
            lastOccurredAt: curr.occurredAt,
          };
          acc[curr.service].count += 1;
          if (curr.occurredAt > acc[curr.service].lastOccurredAt) {
            acc[curr.service].lastOccurredAt = curr.occurredAt;
          }
          return acc;
        },
        {} as Record<string, { count: number; lastOccurredAt: Date }>,
      );

      for (const [service, data] of Object.entries(serviceGroups)) {
        criticalAlerts.push({
          type: 'webhook_failure',
          service,
          occurredCount: data.count,
          lastOccurredAt: data.lastOccurredAt,
        });
      }
    }

    // Check payout backlog
    if (pendingPayouts > 0) {
      const oldestPendingDate = pendingPayoutsResult.reduce((oldest, curr) => {
        return curr.oldestDate < oldest ? curr.oldestDate : oldest;
      }, pendingPayoutsResult[0].oldestDate);

      criticalAlerts.push({
        type: 'payout_backlog',
        count: pendingPayouts,
        oldestPendingDate,
      });
    }

    // ── Last 7 days daily revenue chart (platform share only) ────────────────
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const last7Earnings = await this.earningModel
      .find({ createdAt: { $gte: sevenDaysAgo } })
      .lean()
      .exec();

    // Build day buckets: key = "YYYY-M-D"
    const buckets: { [key: string]: number } = {};
    const chartLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      buckets[key] = 0;
      chartLabels.push(dayNames[d.getDay()]);
    }
    for (const e of last7Earnings) {
      const d = new Date((e as any).createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (buckets[key] !== undefined) {
        buckets[key] += (e.amount * platformFeePercent) / 100;
      }
    }
    const chartData = Object.values(buckets).map(v => Math.round(v * 100) / 100);

    // ── Revenue growth: this week vs previous week (platform share) ──────────
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const prevWeekEarnings = await this.earningModel
      .find({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } })
      .lean()
      .exec();

    const thisWeekGross = last7Earnings.reduce((sum, e) => sum + e.amount, 0);
    const prevWeekGross = prevWeekEarnings.reduce((sum, e) => sum + e.amount, 0);

    const thisWeekRev = (thisWeekGross * platformFeePercent) / 100;
    const prevWeekRev = (prevWeekGross * platformFeePercent) / 100;

    let revenueGrowthPercent = 0;
    if (prevWeekRev > 0) {
      revenueGrowthPercent = Math.round(((thisWeekRev - prevWeekRev) / prevWeekRev) * 1000) / 10;
    } else if (thisWeekRev > 0) {
      revenueGrowthPercent = 100;
    }

    return {
      systemStatus: webhookFailures.length === 0 ? 'operational' : 'degraded',
      platformRevenue,
      payoutLiability,
      activeAdmins: activeAdminsCount,
      pendingPayouts,
      revenueGrowthPercent,
      revenueChart: { labels: chartLabels, data: chartData },
      criticalAlerts,
    };
  }

  async getAdmins(): Promise<AdminListItem[]> {
    // Only fetch ADMIN role, not SUPERADMIN
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isDeleted: { $ne: true } }).exec();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // ── Single aggregate: get last activity date per admin ──────────────────
    const adminIds = admins.map((a) => a._id);
    const lastActivityAgg = await this.auditLogModel
      .aggregate([
        { $match: { performedBy: { $in: adminIds } } },
        {
          $group: {
            _id: '$performedBy',
            lastActiveAt: { $max: '$createdAt' },
          },
        },
      ])
      .exec();

    // Build a lookup map: adminId string → lastActiveAt Date
    const lastActivityMap = new Map<string, Date>(
      lastActivityAgg.map((r) => [r._id.toString(), r.lastActiveAt]),
    );

    const adminList = await Promise.all(
      admins.map(async (admin) => {
        const actionsThisMonth = await this.auditLogModel
          .countDocuments({
            performedBy: admin._id,
            createdAt: { $gte: startOfMonth },
          })
          .exec();

        return {
          id: admin._id.toString(),
          name: `${admin.firstName} ${admin.lastName}`,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          lastActiveAt: lastActivityMap.get(admin._id.toString()) ?? null,
          actionsThisMonth,
        };
      }),
    );

    return adminList;
  }

  async getAdminActivity(
    adminId: string,
    query: AdminActivityQueryDto,
  ): Promise<AdminActivityPaginatedResponse> {
    const admin = await this.userModel.findById(adminId).exec();
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new NotFoundException('Admin not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find({ performedBy: new Types.ObjectId(adminId) })
        .populate('targetUser', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel
        .countDocuments({ performedBy: new Types.ObjectId(adminId) })
        .exec(),
    ]);

    const data = logs.map((log) => {
      let targetLabel = 'Unknown';
      const targetUserObj = log.targetUser as any;
      if (log.details?.courseTitle) {
        targetLabel = log.details.courseTitle;
      } else if (targetUserObj) {
        targetLabel = targetUserObj.email;
      }

      return {
        action: log.action,
        targetId: targetUserObj ? targetUserObj._id.toString() : 'Unknown',
        targetLabel,
        createdAt: (log as any).createdAt,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getPendingPayouts(
    query: AdminActivityQueryDto,
  ): Promise<PendingPayoutPaginatedResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // List open payout REQUESTS (instructor-initiated) awaiting a decision.
    const match = { status: PayoutRequestStatus.PENDING };
    const total = await this.payoutRequestModel.countDocuments(match);

    const requests = await this.payoutRequestModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: 1 } }, // oldest request first
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: 'instructorId',
            foreignField: '_id',
            as: 'instructor',
          },
        },
        { $unwind: '$instructor' },
      ])
      .exec();

    const data = requests.map((r) => ({
      requestId: r._id.toString(),
      instructorId: r.instructorId.toString(),
      instructorName: `${r.instructor.firstName} ${r.instructor.lastName}`,
      instructorEmail: r.instructor.email,
      amount: r.amount,
      earningsCount: r.earningsCount,
      requestedAt: r.createdAt,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Superadmin CONFIRMS a payout request: the instructor's REQUESTED earnings
   * become PAID_OUT and the request is marked APPROVED with the payout method +
   * external reference. The instructor is notified.
   */
  async approvePayout(
    requestId: string,
    superAdminId: string,
    dto: ProcessPayoutDto,
  ): Promise<PayoutProcessResponse> {
    const request = await this.payoutRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Payout request not found');
    }
    if (request.status !== PayoutRequestStatus.PENDING) {
      throw new BadRequestException(
        'This payout request has already been processed',
      );
    }

    const instructorObjId = request.instructorId;
    const processedAt = new Date();

    const session = await this.earningModel.db.startSession();
    session.startTransaction();
    try {
      // The single open request owns all of this instructor's REQUESTED earnings.
      await this.earningModel.updateMany(
        { instructorId: instructorObjId, status: EarningStatus.REQUESTED },
        { $set: { status: EarningStatus.PAID_OUT } },
        { session },
      );

      request.status = PayoutRequestStatus.APPROVED;
      request.method = dto.method;
      request.reference = dto.reference;
      request.processedBy = new Types.ObjectId(superAdminId);
      request.processedAt = processedAt;
      await request.save({ session });

      await this.auditLogModel.create(
        [
          {
            action: 'PAYOUT_PROCESSED',
            performedBy: new Types.ObjectId(superAdminId),
            targetUser: instructorObjId,
            details: {
              requestId: request._id.toString(),
              amount: request.amount,
              earningsCount: request.earningsCount,
              method: dto.method,
              reference: dto.reference,
            },
          },
        ],
        { session },
      );

      await this.notificationModel.create(
        [
          {
            userId: instructorObjId,
            title: 'Payout Processed',
            message: `Your payout of ${request.amount} EGP has been processed successfully. Reference: ${dto.reference}`,
            type: 'PAYOUT_PROCESSED',
            isRead: false,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return {
        requestId: request._id.toString(),
        instructorId: instructorObjId.toString(),
        amount: request.amount,
        status: EarningStatus.PAID_OUT,
        processedBy: superAdminId,
        processedAt,
        reference: dto.reference,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Superadmin DECLINES a payout request: the instructor's REQUESTED earnings
   * revert to PENDING (so they can request again later) and the request is
   * marked REJECTED with a reason. The instructor is notified.
   */
  async rejectPayout(
    requestId: string,
    superAdminId: string,
    dto: RejectPayoutDto,
  ): Promise<PayoutProcessResponse> {
    const request = await this.payoutRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Payout request not found');
    }
    if (request.status !== PayoutRequestStatus.PENDING) {
      throw new BadRequestException(
        'This payout request has already been processed',
      );
    }

    const instructorObjId = request.instructorId;
    const processedAt = new Date();

    const session = await this.earningModel.db.startSession();
    session.startTransaction();
    try {
      await this.earningModel.updateMany(
        { instructorId: instructorObjId, status: EarningStatus.REQUESTED },
        { $set: { status: EarningStatus.PENDING } },
        { session },
      );

      request.status = PayoutRequestStatus.REJECTED;
      request.note = dto.reason;
      request.processedBy = new Types.ObjectId(superAdminId);
      request.processedAt = processedAt;
      await request.save({ session });

      await this.auditLogModel.create(
        [
          {
            action: 'PAYOUT_REJECTED',
            performedBy: new Types.ObjectId(superAdminId),
            targetUser: instructorObjId,
            details: {
              requestId: request._id.toString(),
              amount: request.amount,
              reason: dto.reason,
            },
          },
        ],
        { session },
      );

      await this.notificationModel.create(
        [
          {
            userId: instructorObjId,
            title: 'Payout Request Declined',
            message: `Your payout request of ${request.amount} EGP was declined. Reason: ${dto.reason}`,
            type: 'PAYOUT_REJECTED',
            isRead: false,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return {
        requestId: request._id.toString(),
        instructorId: instructorObjId.toString(),
        amount: request.amount,
        status: PayoutRequestStatus.REJECTED,
        processedBy: superAdminId,
        processedAt,
        note: dto.reason,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  async getPlatformConfig(): Promise<PlatformConfigResponse> {
    let config = await this.platformConfigModel.findOne().exec();
    if (!config) {
      config = new this.platformConfigModel();
      await config.save();
    }
    return {
      platformFeePercent: config.platformFeePercent,
      instructorSharePercent: config.instructorSharePercent,
      maintenanceMode: config.maintenanceMode,
      minimumPayoutThreshold: config.minimumPayoutThreshold,
      updatedBy: config.updatedBy ? config.updatedBy.toString() : undefined,
      updatedAt: (config as any).updatedAt,
    };
  }

  async updatePlatformConfig(
    superAdminId: string,
    dto: UpdatePlatformConfigDto,
  ): Promise<PlatformConfigResponse> {
    let config = await this.platformConfigModel.findOne().exec();
    if (!config) {
      config = new this.platformConfigModel();
    }

    const updates: Partial<PlatformConfig> = {};
    if (dto.platformFeePercent !== undefined) {
      updates.platformFeePercent = dto.platformFeePercent;
      updates.instructorSharePercent = 100 - dto.platformFeePercent;
    }
    if (dto.maintenanceMode !== undefined) {
      updates.maintenanceMode = dto.maintenanceMode;
    }
    if (dto.minimumPayoutThreshold !== undefined) {
      updates.minimumPayoutThreshold = dto.minimumPayoutThreshold;
    }

    Object.assign(config, updates);
    config.updatedBy = new Types.ObjectId(superAdminId);
    await config.save();

    // Note: This change only affects FUTURE Earning calculations.
    // Existing Earning records are never recalculated retroactively.
    await this.auditLogModel.create({
      action: 'PLATFORM_CONFIG_UPDATED',
      performedBy: new Types.ObjectId(superAdminId),
      targetUser: new Types.ObjectId(superAdminId), // Required by schema, safe self-reference
      details: { changedFields: dto },
    });

    return {
      platformFeePercent: config.platformFeePercent,
      instructorSharePercent: config.instructorSharePercent,
      maintenanceMode: config.maintenanceMode,
      minimumPayoutThreshold: config.minimumPayoutThreshold,
      updatedBy: config.updatedBy.toString(),
      updatedAt: (config as any).updatedAt,
    };
  }

  async getAuditLogs(
    query: AuditLogsFilterDto,
  ): Promise<AuditLogPaginatedResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.userId) {
      filter.$or = [
        { performedBy: new Types.ObjectId(query.userId) },
        { targetUser: new Types.ObjectId(query.userId) },
      ];
    }
    if (query.action) {
      filter.action = query.action;
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'firstName lastName')
        .populate('targetUser', 'firstName lastName')
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    const data = logs.map((log) => {
      const performedByObj = log.performedBy as any;
      const targetUserObj = log.targetUser as any;
      return {
        id: log._id.toString(),
        action: log.action,
        performedBy: {
          id: performedByObj ? performedByObj._id.toString() : 'Unknown',
          name: performedByObj
            ? `${performedByObj.firstName} ${performedByObj.lastName}`
            : 'System',
        },
        targetUser: {
          id: targetUserObj ? targetUserObj._id.toString() : 'Unknown',
          name: targetUserObj
            ? `${targetUserObj.firstName} ${targetUserObj.lastName}`
            : 'System',
        },
        details: log.details,
        createdAt: (log as any).createdAt,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getSystemHealth(): Promise<SystemHealthResponse> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failuresCount = await this.webhookFailureLogModel
      .countDocuments({ occurredAt: { $gte: twentyFourHoursAgo } })
      .exec();

    const lastFailure = await this.webhookFailureLogModel
      .findOne()
      .sort({ occurredAt: -1 })
      .exec();

    let apiStatus = 'healthy';
    if (failuresCount > 5) apiStatus = 'critical';
    else if (failuresCount > 0) apiStatus = 'degraded';

    return {
      apiStatus,
      // NOTE: apiStatus/averageResponseTimeMs require either a timing interceptor or external monitoring
      // (Datadog, Sentry, etc.) — this implementation returns webhookFailuresLast24h only with apiStatus
      // hardcoded to a basic self-check value based on webhook failures
      averageResponseTimeMs: null,
      errorRateLast24h: null,
      webhookFailuresLast24h: failuresCount,
      lastWebhookFailure: lastFailure
        ? {
            service: lastFailure.service,
            endpoint: lastFailure.endpoint,
            errorMessage: lastFailure.errorMessage,
            occurredAt: lastFailure.occurredAt,
          }
        : null,
    };
  }
}
