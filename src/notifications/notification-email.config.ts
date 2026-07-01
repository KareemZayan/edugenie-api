// src/notifications/notification-email.config.ts
// Central policy for which notification events also send an email, and where
// their call-to-action button points. Phase 3 reuses the notification's own
// title/message as the email subject/body.
//
// NOTE: digests / bulk / marketing events are intentionally OFF here — they
// belong to Phase 5 (cron) and require the per-user email preferences from
// Phase 2. `category` is already recorded so the Phase 2 preference check can
// slot straight in (see NotificationsService.dispatchEmail).

import { NotificationType } from './enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { EmailCta } from '../mail/templates/email-layout';

export enum EmailCategory {
  /** Always sent — account safety (login alerts, password/email changes). */
  SECURITY = 'security',
  /** Account activity the user acted on (purchases, approvals, results). */
  PRODUCT = 'product',
  /** Digests / re-engagement — opt-out, sent from cron (Phase 5). */
  MARKETING = 'marketing',
}

export interface NotificationEmailRule {
  /** Whether this event sends an email at all (Phase 3). */
  email: boolean;
  category: EmailCategory;
  /** Overrides the notification title as the email subject line. */
  subject?: string;
}

export const NOTIFICATION_EMAIL_MAP: Record<string, NotificationEmailRule> = {
  // ── Security (always on) ──────────────────────────────────────────────────
  [NotificationType.NEW_LOGIN_ATTEMPT]: {
    email: true,
    category: EmailCategory.SECURITY,
    subject: 'New sign-in to your EduGenie account',
  },

  // ── Student product activity ──────────────────────────────────────────────
  [NotificationType.PURCHASE_COMPLETED]: {
    email: true,
    category: EmailCategory.PRODUCT,
    subject: 'Your EduGenie purchase is confirmed',
  },
  [NotificationType.PAYMENT_FAILED]: {
    email: true,
    category: EmailCategory.PRODUCT,
    subject: 'Your EduGenie payment did not go through',
  },
  [NotificationType.COURSE_COMPLETED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.CERTIFICATE_EARNED]: {
    email: true,
    category: EmailCategory.PRODUCT,
    subject: 'You earned a certificate 🎓',
  },
  [NotificationType.REMEDIATION_READY]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.GOAL_MILESTONE]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.MILESTONE_REACHED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.NEW_CONTENT_PUBLISHED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },

  // ── Instructor product activity ───────────────────────────────────────────
  [NotificationType.COURSE_SUBMITTED_FOR_REVIEW]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.COURSE_APPROVED]: {
    email: true,
    category: EmailCategory.PRODUCT,
    subject: 'Your course was approved',
  },
  [NotificationType.COURSE_REJECTED]: {
    email: true,
    category: EmailCategory.PRODUCT,
    subject: 'Your course needs changes',
  },
  [NotificationType.NEW_ENROLLMENT]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.NEW_REVIEW]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.EARNING_RECORDED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.CONTENT_REMOVED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },

  // ── Admin / moderation ────────────────────────────────────────────────────
  [NotificationType.REPORT_RESOLVED]: {
    email: true,
    category: EmailCategory.PRODUCT,
  },

  // ── Off for now (digests / marketing → Phase 5 + preferences) ─────────────
  [NotificationType.LOW_RATING]: {
    email: false,
    category: EmailCategory.PRODUCT,
  },
  [NotificationType.INACTIVITY_REMINDER]: {
    email: false,
    category: EmailCategory.MARKETING,
  },
  [NotificationType.WEEKLY_SUMMARY]: {
    email: false,
    category: EmailCategory.MARKETING,
  },
  [NotificationType.MONTHLY_SUMMARY]: {
    email: false,
    category: EmailCategory.MARKETING,
  },
};

const STAFF_ROLES: string[] = [
  UserRole.INSTRUCTOR,
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
];

function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Builds a role- and event-appropriate CTA for the email. Students land in the
 * student web app, staff in the dashboard; a few event types deep-link further.
 */
export function resolveNotificationCta(
  type: NotificationType,
  courseId: string | undefined,
  role: string,
  urls: { studentApp: string; dashboard: string },
): EmailCta {
  const { studentApp, dashboard } = urls;

  switch (type) {
    case NotificationType.REMEDIATION_READY:
      return { label: 'View recovery plan', url: `${studentApp}/coach` };

    case NotificationType.CERTIFICATE_EARNED:
    case NotificationType.COURSE_COMPLETED:
    case NotificationType.GOAL_MILESTONE:
    case NotificationType.MILESTONE_REACHED:
      return { label: 'View your progress', url: `${studentApp}/profile` };

    case NotificationType.PURCHASE_COMPLETED:
    case NotificationType.NEW_CONTENT_PUBLISHED:
      return courseId
        ? { label: 'Start learning', url: `${studentApp}/learn/${courseId}` }
        : { label: 'Go to my courses', url: `${studentApp}/profile` };

    case NotificationType.PAYMENT_FAILED:
      return { label: 'Try again', url: `${studentApp}/cart` };

    case NotificationType.COURSE_SUBMITTED_FOR_REVIEW:
    case NotificationType.COURSE_APPROVED:
    case NotificationType.COURSE_REJECTED:
      return courseId
        ? {
            label: 'Open course builder',
            url: `${dashboard}/course-builder/${courseId}`,
          }
        : { label: 'Open dashboard', url: `${dashboard}/my-courses` };

    case NotificationType.NEW_ENROLLMENT:
    case NotificationType.NEW_REVIEW:
    case NotificationType.EARNING_RECORDED:
      return { label: 'Open dashboard', url: `${dashboard}/my-courses` };

    default:
      return {
        label: 'Open EduGenie',
        url: isStaff(role) ? dashboard : studentApp,
      };
  }
}
