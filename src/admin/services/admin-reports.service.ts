import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from '../../reports/schema/report.schema';
import { Review, ReviewDocument } from '../../reviews/schema/review.schema';
import { AuditLog, AuditLogDocument } from '../../audit-logs/schemas/audit-log.schema';
import { AdminReportsFilterDto } from '../dto/admin-reports-filter.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import { ReportStatus } from '../../common/enums/report-status.enum';
import { ReportResolvedAction } from '../../common/enums/report-action.enum';
import { ReportType } from '../../common/enums/report-type.enum';
import { ReportListResponse, ReportResolutionResponse } from '../../common/interfaces/frontend-contracts';

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async getReports(query: AdminReportsFilterDto): Promise<ReportListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.type) {
      filter.type = query.type;
    }

    const [reports, total] = await Promise.all([
      this.reportModel.find(filter)
        .populate('reportedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reportModel.countDocuments(filter).exec()
    ]);

    const data = reports.map((report) => {
      let reportedByName = undefined;
      if (report.reportedBy) {
        const reporter = report.reportedBy as any;
        reportedByName = `${reporter.firstName} ${reporter.lastName}`;
      }
      return {
        reportId: report._id.toString(),
        type: report.type,
        targetId: report.targetId,
        reason: report.reason,
        reportedBy: reportedByName,
        status: report.status,
        createdAt: (report as any).createdAt,
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
      }
    };
  }

  async resolveReport(id: string, adminId: string, dto: ResolveReportDto): Promise<ReportResolutionResponse> {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== ReportStatus.OPEN) {
      throw new BadRequestException('Report is already resolved');
    }

    report.status = ReportStatus.RESOLVED;
    report.resolution = dto.resolution;
    report.resolvedAction = dto.action;
    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = new Date();
    await report.save();

    if (dto.action === ReportResolvedAction.CONTENT_REMOVED) {
      if (report.type === ReportType.REVIEW) {
        // Concrete removal action for review
        try {
          await this.reviewModel.findByIdAndDelete(report.targetId).exec();
        } catch (error) {
          this.logger.error(`Failed to delete review ${report.targetId} during report resolution`, error);
        }
      } else {
        // NOTE: content_removed for type 'payment' or 'course' requires coordination 
        // with the respective modules — implementing the report status update only, 
        // flag for product decision on the actual remediation action.
        this.logger.warn(`Action 'content_removed' requested for type '${report.type}' but not concretely implemented yet.`);
      }
    }

    await this.auditLogModel.create({
      action: 'REPORT_RESOLVED',
      performedBy: new Types.ObjectId(adminId),
      targetUser: report.reportedBy as any, // Might be null for system generated
      details: {
        reportId: report._id.toString(),
        resolution: dto.resolution,
        actionTaken: dto.action,
      },
    });

    return {
      reportId: report._id.toString(),
      status: report.status,
      resolution: report.resolution as string,
      resolvedBy: adminId,
      resolvedAt: report.resolvedAt as Date,
    };
  }
}
