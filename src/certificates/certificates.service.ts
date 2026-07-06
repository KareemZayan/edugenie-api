import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';

import { Certificate } from './schema/certificate.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Course } from '../courses/schema/course.schema';
import { Quiz } from '../quizzes/schema/quiz.schema';
import { QuizAttempt } from '../quizzes/schema/quiz-attempt.schema';
import { User } from '../users/schema/user.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { EDUGENIE_LOGO_JPEG_BASE64 } from './assets/logo.base64';

export interface CertificateView {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  issuedAt: Date;
  courseId: string;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectModel(Certificate.name)
    private readonly certificateModel: Model<Certificate>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Quiz.name) private readonly quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name)
    private readonly quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private get studentUrl(): string {
    return (
      this.config.get<string>('STUDENT_APP_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private toView(c: Certificate & { _id: Types.ObjectId }): CertificateView {
    return {
      id: c._id.toString(),
      certificateNumber: c.certificateNumber,
      verificationCode: c.verificationCode,
      studentName: c.studentName,
      courseTitle: c.courseTitle,
      instructorName: c.instructorName,
      issuedAt: c.issuedAt,
      courseId: c.courseId.toString(),
    };
  }

  /**
   * Eligibility gate: a FULL-COURSE enrollment whose lessons are 100% done AND
   * whose every section-quiz has a passed attempt. Mirrors the section-level
   * rule in progress.service (all lessons + quiz passed), lifted to the course.
   */
  async isCourseFullyCompleted(
    studentId: string,
    courseId: string,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(courseId)) return false;
    const studentObjId = new Types.ObjectId(studentId);
    const courseObjId = new Types.ObjectId(courseId);

    const enrollment = await this.enrollmentModel
      .findOne({ studentId: studentObjId, courseId: courseObjId })
      .lean<{ type: PurchaseType; progressPercentage: number }>()
      .exec();
    if (!enrollment) return false;
    if (enrollment.type !== PurchaseType.FULL_COURSE) return false;
    if (enrollment.progressPercentage !== 100) return false;

    const course = await this.courseModel
      .findById(courseObjId)
      .select('sections._id')
      .lean<{ sections: Array<{ _id: Types.ObjectId }> }>()
      .exec();
    if (!course) return false;

    const sectionIds = (course.sections ?? []).map((s) => s._id);
    const quizzes = await this.quizModel
      .find({ sectionId: { $in: sectionIds } })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>()
      .exec();
    if (quizzes.length === 0) return true; // no quizzes → lessons suffice

    const quizIds = quizzes.map((q) => q._id);
    const passedQuizIds = await this.quizAttemptModel.distinct('quizId', {
      studentId: studentObjId,
      quizId: { $in: quizIds },
      passed: true,
    });
    return passedQuizIds.length === quizIds.length;
  }

  /**
   * Issue a certificate for a completed course. Idempotent: returns the existing
   * certificate if present, else creates one only when eligible, fires the
   * CERTIFICATE_EARNED notification (which also emails), and returns it. Returns
   * null when the student isn't eligible yet. Never throws to callers in the
   * completion hooks — issuance failures are logged.
   */
  async issueForCourse(
    studentId: string,
    courseId: string,
  ): Promise<CertificateView | null> {
    try {
      const studentObjId = new Types.ObjectId(studentId);
      const courseObjId = new Types.ObjectId(courseId);

      const existing = await this.certificateModel
        .findOne({ studentId: studentObjId, courseId: courseObjId })
        .exec();
      if (existing) {
        return this.toView(existing as Certificate & { _id: Types.ObjectId });
      }

      if (!(await this.isCourseFullyCompleted(studentId, courseId))) {
        return null;
      }

      const [student, course] = await Promise.all([
        this.userModel
          .findById(studentObjId)
          .select('firstName lastName')
          .lean<{ firstName?: string; lastName?: string }>()
          .exec(),
        this.courseModel
          .findById(courseObjId)
          .select('title instructorId')
          .populate('instructorId', 'firstName lastName')
          .lean<{
            title: string;
            instructorId?: { firstName?: string; lastName?: string };
          }>()
          .exec(),
      ]);
      if (!student || !course) return null;

      const studentName =
        `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() ||
        'Student';
      const instructor = course.instructorId;
      const instructorName = instructor
        ? `${instructor.firstName ?? ''} ${instructor.lastName ?? ''}`.trim() ||
          'EduGenie'
        : 'EduGenie';

      const year = new Date().getFullYear();
      const certificateNumber = `EG-${year}-${randomBytes(4)
        .toString('hex')
        .toUpperCase()}`;
      const verificationCode = randomBytes(16).toString('hex');

      let cert: Certificate & { _id: Types.ObjectId };
      try {
        cert = (await this.certificateModel.create({
          studentId: studentObjId,
          courseId: courseObjId,
          certificateNumber,
          verificationCode,
          studentName,
          courseTitle: course.title,
          instructorName,
          issuedAt: new Date(),
        })) as Certificate & { _id: Types.ObjectId };
      } catch (err) {
        // Unique-index race (two completion hooks at once) — return the winner.
        const raced = await this.certificateModel
          .findOne({ studentId: studentObjId, courseId: courseObjId })
          .exec();
        if (raced) {
          return this.toView(raced as Certificate & { _id: Types.ObjectId });
        }
        throw err;
      }

      // Fires the in-app notification AND the certificate email (dispatchEmail).
      await this.notifications.create(
        studentObjId,
        'Certificate Earned!',
        `You earned a certificate for completing "${course.title}". View or download it from your profile.`,
        NotificationType.CERTIFICATE_EARNED,
        courseId,
      );

      return this.toView(cert);
    } catch (err) {
      this.logger.error(
        `issueForCourse failed (student ${studentId}, course ${courseId}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  async listMine(studentId: string): Promise<CertificateView[]> {
    const certs = await this.certificateModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ issuedAt: -1 })
      .exec();
    return certs.map((c) =>
      this.toView(c as Certificate & { _id: Types.ObjectId }),
    );
  }

  async getForStudent(
    id: string,
    studentId: string,
  ): Promise<CertificateView> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Certificate not found');
    }
    const cert = await this.certificateModel.findById(id).exec();
    if (!cert) throw new NotFoundException('Certificate not found');
    if (cert.studentId.toString() !== studentId) {
      throw new ForbiddenException('This certificate is not yours.');
    }
    return this.toView(cert as Certificate & { _id: Types.ObjectId });
  }

  /** Public verification by code. Returns validity + safe public fields. */
  async getByCode(code: string): Promise<{
    valid: boolean;
    studentName?: string;
    courseTitle?: string;
    instructorName?: string;
    certificateNumber?: string;
    issuedAt?: Date;
  }> {
    const cert = await this.certificateModel
      .findOne({ verificationCode: code })
      .lean<Certificate>()
      .exec();
    if (!cert) return { valid: false };
    return {
      valid: true,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName,
      certificateNumber: cert.certificateNumber,
      issuedAt: cert.issuedAt,
    };
  }

  private async loadCertDocForStudent(id: string, studentId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Certificate not found');
    }
    const cert = await this.certificateModel.findById(id).exec();
    if (!cert) throw new NotFoundException('Certificate not found');
    if (cert.studentId.toString() !== studentId) {
      throw new ForbiddenException('This certificate is not yours.');
    }
    return cert;
  }

  /** Regenerate the PDF on demand (nothing is stored). */
  async renderPdf(id: string, studentId: string): Promise<Buffer> {
    const cert = await this.loadCertDocForStudent(id, studentId);

    const W = 842;
    const H = 595; // landscape (points)
    const doc = await PDFDocument.create();
    const page = doc.addPage([W, H]);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
    const serif = await doc.embedFont(StandardFonts.TimesRoman);
    const serifB = await doc.embedFont(StandardFonts.TimesRomanBold);

    // Palette derived from the EduGenie logo (indigo → blue) + a gold seal.
    const indigo = rgb(0.118, 0.106, 0.294); // #1E1B4B
    const blue = rgb(0.145, 0.388, 0.922); // #2563EB
    const gold = rgb(0.718, 0.584, 0.18); // #B7952E
    const muted = rgb(0.42, 0.39, 0.5);
    const hair = rgb(0.886, 0.878, 0.937);

    const wOf = (t: string, s: number, f = helv) => f.widthOfTextAtSize(t, s);
    const drawTracked = (
      t: string,
      x: number,
      y: number,
      s: number,
      f: typeof helv,
      c: ReturnType<typeof rgb>,
      tracking = 0,
    ) => {
      let cx = x;
      for (const ch of t) {
        page.drawText(ch, { x: cx, y, size: s, font: f, color: c });
        cx += f.widthOfTextAtSize(ch, s) + tracking;
      }
    };
    const trackedWidth = (t: string, s: number, f: typeof helv, tr: number) =>
      [...t].reduce((w, ch) => w + f.widthOfTextAtSize(ch, s) + tr, -tr);
    const center = (
      t: string,
      y: number,
      s: number,
      f: typeof helv,
      c: ReturnType<typeof rgb>,
      tracking = 0,
    ) => {
      if (tracking) {
        drawTracked(t, (W - trackedWidth(t, s, f, tracking)) / 2, y, s, f, c, tracking);
      } else {
        page.drawText(t, { x: (W - wOf(t, s, f)) / 2, y, size: s, font: f, color: c });
      }
    };
    // Shrink a single line until it fits maxW (keeps long names/titles on one line).
    const fit = (t: string, maxW: number, start: number, f: typeof helv, min: number) => {
      let s = start;
      while (s > min && wOf(t, s, f) > maxW) s -= 0.5;
      return s;
    };

    // Double frame
    page.drawRectangle({
      x: 16,
      y: 16,
      width: W - 32,
      height: H - 32,
      borderColor: indigo,
      borderWidth: 1.4,
    });
    page.drawRectangle({
      x: 24,
      y: 24,
      width: W - 48,
      height: H - 48,
      borderColor: blue,
      borderWidth: 0.6,
    });

    // ── Header: logo lockup (left) + eyebrow (right) ──
    try {
      const logo = await doc.embedJpg(
        Buffer.from(EDUGENIE_LOGO_JPEG_BASE64, 'base64'),
      );
      const logoH = 58;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: 52, y: H - 52 - logoH, width: logoW, height: logoH });
    } catch {
      // Fall back to the wordmark if the JPEG can't be embedded.
      page.drawText('EduGenie', { x: 52, y: H - 86, size: 26, font: helvB, color: indigo });
    }

    const eyebrow = 'CERTIFICATE OF COMPLETION';
    const ebTracking = 2.4;
    drawTracked(
      eyebrow,
      W - 54 - trackedWidth(eyebrow, 11, helvB, ebTracking),
      H - 76,
      11,
      helvB,
      muted,
      ebTracking,
    );
    page.drawLine({
      start: { x: 54, y: H - 122 },
      end: { x: W - 54, y: H - 122 },
      thickness: 0.8,
      color: hair,
    });

    // ── Body ──
    center('THIS CERTIFICATE IS PROUDLY PRESENTED TO', 402, 10, helvB, muted, 2);

    const nameSize = fit(cert.studentName, 660, 40, serifB, 22);
    center(cert.studentName, 352, nameSize, serifB, indigo);
    page.drawLine({
      start: { x: (W - 130) / 2, y: 338 },
      end: { x: (W + 130) / 2, y: 338 },
      thickness: 1.6,
      color: gold,
    });

    center('for successfully completing the online course', 306, 12, helv, muted);
    const titleSize = fit(cert.courseTitle, 690, 26, serifB, 15);
    center(cert.courseTitle, 266, titleSize, serifB, blue);

    const dateStr = new Date(cert.issuedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    center(
      `Instructor: ${cert.instructorName}       •       Issued ${dateStr}`,
      230,
      11,
      helv,
      muted,
    );

    // ── Footer: verified seal (left) · credential (center) · QR (right) ──
    const verifyUrl = `${this.studentUrl}/verify/${cert.verificationCode}`;

    // Verified seal — the credential's signature mark.
    const scx = 108;
    const scy = 92;
    const R = 40;
    page.drawCircle({ x: scx, y: scy, size: R, borderColor: gold, borderWidth: 2 });
    page.drawCircle({ x: scx, y: scy, size: R - 6, borderColor: gold, borderWidth: 0.7 });
    page.drawText('EDUGENIE', {
      x: scx - wOf('EDUGENIE', 6.5, helvB) / 2,
      y: scy + 15,
      size: 6.5,
      font: helvB,
      color: gold,
    });
    // Checkmark
    page.drawLine({ start: { x: scx - 12, y: scy - 1 }, end: { x: scx - 3, y: scy - 10 }, thickness: 2.6, color: gold });
    page.drawLine({ start: { x: scx - 3, y: scy - 10 }, end: { x: scx + 13, y: scy + 9 }, thickness: 2.6, color: gold });
    page.drawText('VERIFIED', {
      x: scx - wOf('VERIFIED', 7, helvB) / 2,
      y: scy - 22,
      size: 7,
      font: helvB,
      color: gold,
    });

    // Credential block
    const vx = 190;
    drawTracked('CERTIFICATE No.', vx, 106, 8, helvB, muted, 1);
    page.drawText(cert.certificateNumber, { x: vx, y: 92, size: 12, font: helvB, color: indigo });
    page.drawText('Verify authenticity at', { x: vx, y: 74, size: 8, font: helv, color: muted });
    page.drawText(verifyUrl, { x: vx, y: 62, size: 8, font: helv, color: blue });

    // QR
    try {
      const qrBuf = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 180 });
      const qr = await doc.embedPng(qrBuf);
      const qs = 84;
      const qx = W - 54 - qs;
      page.drawImage(qr, { x: qx, y: 54, width: qs, height: qs });
      const cap = 'Scan to verify';
      page.drawText(cap, {
        x: qx + (qs - wOf(cap, 7, helv)) / 2,
        y: 44,
        size: 7,
        font: helv,
        color: muted,
      });
    } catch (err) {
      this.logger.warn(`QR render failed: ${(err as Error).message}`);
    }

    void serif; // reserved for future body copy

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}
