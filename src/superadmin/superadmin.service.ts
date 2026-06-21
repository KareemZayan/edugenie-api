import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schema/user.schema';
import { Earning, EarningDocument } from '../earnings/schema/earning.schema';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import { PlatformConfig, PlatformConfigDocument } from './schema/platform-config.schema';
import { WebhookFailureLog, WebhookFailureLogDocument } from './schema/webhook-failure-log.schema';
import { Notification, NotificationDocument } from '../notifications/schema/notification.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { EarningStatus } from '../common/enums/earning-status.enum';
import { ProcessPayoutDto } from './dto/process-payout.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { AuditLogsFilterDto } from './dto/audit-logs-filter.dto';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';
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
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(PlatformConfig.name) private platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(WebhookFailureLog.name) private webhookFailureLogModel: Model<WebhookFailureLogDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async getDashboardOverview(): Promise<SuperAdminDashboardOverviewResponse> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      platformRevenueResult,
      payoutLiabilityResult,
      activeAdminsCount,
      pendingPayoutsResult,
      webhookFailures,
    ] = await Promise.all([
      this.earningModel.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).exec(),
      this.earningModel.aggregate([
        { $match: { status: { $ne: EarningStatus.PAID_OUT } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).exec(),
      this.userModel.countDocuments({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }).exec(),
      this.earningModel.aggregate([
        { $match: { status: EarningStatus.PENDING } },
        { $group: { _id: '$instructorId', oldestDate: { $min: '$createdAt' } } },
      ]).exec(),
      this.webhookFailureLogModel
        .find({ occurredAt: { $gte: twentyFourHoursAgo } })
        .sort({ occurredAt: -1 })
        .exec(),
    ]);

    const platformRevenue = platformRevenueResult[0]?.total || 0;
    const payoutLiability = payoutLiabilityResult[0]?.total || 0;
    const pendingPayouts = pendingPayoutsResult.length;

    const criticalAlerts: any[] = [];
    
    // Group webhook failures by service
    if (webhookFailures.length > 0) {
      const serviceGroups = webhookFailures.reduce((acc, curr) => {
        acc[curr.service] = acc[curr.service] || { count: 0, lastOccurredAt: curr.occurredAt };
        acc[curr.service].count += 1;
        if (curr.occurredAt > acc[curr.service].lastOccurredAt) {
          acc[curr.service].lastOccurredAt = curr.occurredAt;
        }
        return acc;
      }, {} as Record<string, { count: number; lastOccurredAt: Date }>);

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

    return {
      systemStatus: webhookFailures.length === 0 ? 'operational' : 'degraded',
      platformRevenue,
      payoutLiability,
      activeAdmins: activeAdminsCount,
      pendingPayouts,
      criticalAlerts,
    };
  }

  async getAdmins(): Promise<AdminListItem[]> {
    // Only fetch ADMIN role, not SUPERADMIN
    const admins = await this.userModel.find({ role: UserRole.ADMIN }).exec();
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const adminList = await Promise.all(
      admins.map(async (admin) => {
        const actionsThisMonth = await this.auditLogModel.countDocuments({
          performedBy: admin._id,
          createdAt: { $gte: startOfMonth },
        }).exec();

        return {
          id: admin._id.toString(),
          name: `${admin.firstName} ${admin.lastName}`,
          email: admin.email,
          role: admin.role,
          // NOTE: lastActiveAt requires a login-timestamp field on User — not currently tracked
          lastActiveAt: null, 
          actionsThisMonth,
        };
      })
    );

    return adminList;
  }

  async getAdminActivity(adminId: string, query: AdminActivityQueryDto): Promise<AdminActivityPaginatedResponse> {
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
      this.auditLogModel.countDocuments({ performedBy: new Types.ObjectId(adminId) }).exec(),
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

  async getPendingPayouts(query: AdminActivityQueryDto): Promise<PendingPayoutPaginatedResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // Group Earning records by instructorId where status === 'PENDING'
    const aggregationPipeline: any[] = [
      { $match: { status: EarningStatus.PENDING } },
      {
        $group: {
          _id: '$instructorId',
          amount: { $sum: '$amount' },
          earningsCount: { $sum: 1 },
          periodStart: { $min: '$createdAt' },
          periodEnd: { $max: '$createdAt' },
        },
      },
    ];

    const allGrouped = await this.earningModel.aggregate(aggregationPipeline).exec();
    const total = allGrouped.length;

    const paginatedGrouped = await this.earningModel.aggregate([
      ...aggregationPipeline,
      { $sort: { periodStart: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'instructor',
        },
      },
      { $unwind: '$instructor' },
    ]).exec();

    const data = paginatedGrouped.map((item) => ({
      instructorId: item._id.toString(),
      instructorName: `${item.instructor.firstName} ${item.instructor.lastName}`,
      amount: item.amount,
      earningsCount: item.earningsCount,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
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

  async processPayout(
    instructorId: string,
    superAdminId: string,
    dto: ProcessPayoutDto,
  ): Promise<PayoutProcessResponse> {
    const config = await this.getPlatformConfig();

    const session = await this.earningModel.db.startSession();
    session.startTransaction();

    try {
      const instructorObjId = new Types.ObjectId(instructorId);
      
      const pendingEarnings = await this.earningModel
        .find({ instructorId: instructorObjId, status: EarningStatus.PENDING })
        .session(session)
        .exec();

      if (pendingEarnings.length === 0) {
        throw new BadRequestException('No pending earnings for this instructor');
      }

      const totalAmount = pendingEarnings.reduce((sum, e) => sum + e.amount, 0);

      if (totalAmount < config.minimumPayoutThreshold) {
        throw new BadRequestException('Total pending amount is below the minimum payout threshold');
      }

      await this.earningModel.updateMany(
        { instructorId: instructorObjId, status: EarningStatus.PENDING },
        { $set: { status: EarningStatus.PAID_OUT } },
        { session }
      );

      await this.auditLogModel.create([{
        action: 'PAYOUT_PROCESSED',
        performedBy: new Types.ObjectId(superAdminId),
        targetUser: instructorObjId,
        details: { amount: totalAmount, earningsCount: pendingEarnings.length, method: dto.method, reference: dto.reference },
      }], { session });

      await this.notificationModel.create([{
        userId: instructorObjId,
        title: 'Payout Processed',
        message: `Your payout of ${totalAmount} EGP has been processed successfully. Reference: ${dto.reference}`,
        type: 'PAYOUT_PROCESSED',
        isRead: false,
      }], { session });

      await session.commitTransaction();
      session.endSession();

      return {
        instructorId,
        amount: totalAmount,
        status: EarningStatus.PAID_OUT,
        processedBy: superAdminId,
        processedAt: new Date(),
        reference: dto.reference,
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

  async getAuditLogs(query: AuditLogsFilterDto): Promise<AuditLogPaginatedResponse> {
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
          name: performedByObj ? `${performedByObj.firstName} ${performedByObj.lastName}` : 'System',
        },
        targetUser: {
          id: targetUserObj ? targetUserObj._id.toString() : 'Unknown',
          name: targetUserObj ? `${targetUserObj.firstName} ${targetUserObj.lastName}` : 'System',
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
