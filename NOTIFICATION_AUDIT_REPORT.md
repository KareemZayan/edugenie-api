# Notification Audit Report
## EduGenie API - NestJS Backend

---

## Project Discovery Summary

### Project Type
**NestJS Backend API** (not Angular frontend as initially requested)

### User Roles Identified

| Role | Enum | Description |
|------|------|-------------|
| STUDENT | `UserRole.STUDENT` | Learners who purchase and consume courses |
| INSTRUCTOR | `UserRole.INSTRUCTOR` | Content creators who publish courses |
| ADMIN | `UserRole.ADMIN` | Platform administrators for content moderation |
| SUPERADMIN | `UserRole.SUPERADMIN` | Super administrators for platform configuration |

### Status Enums Found

- **CourseStatus**: `DRAFT` → `UNDER_REVIEW` → `REJECTED` / `PUBLISHED` → `ARCHIVED`
- **UserStatus**: `ACTIVE` ↔ `DEACTIVATED`
- **OrderStatus**: `PENDING` → `COMPLETED` / `FAILED`
- **EarningStatus**: `PENDING` → `CLEARED` → `PAID_OUT`
- **ReportStatus**: `OPEN` → `RESOLVED`
- **QuizGenerationStatus**: `PENDING` → `COMPLETED`

### Modules Analyzed

| Module | Purpose |
|--------|---------|
| `src/auth/` | Authentication, login, token exchange |
| `src/users/` | User profile management, role changes |
| `src/courses/` | Course CRUD, status transitions, submission for review |
| `src/admin/` | Admin actions: course approval/rejection, user deactivation |
| `src/superadmin/` | Platform config, payout processing |
| `src/orders/` | Checkout, payment processing |
| `src/enrollments/` | Student course access, progress tracking |
| `src/reviews/` | Course ratings and reviews |
| `src/quizzes/` | Quiz generation, attempts, certificates |
| `src/earnings/` | Instructor earnings tracking |
| `src/reports/` | Content reporting system |
| `src/notifications/` | Notification storage and retrieval |
| `src/webhooks/` | Payment webhook handling (Paymob) |

---

## Section 1: Existing Notification Coverage

The following events currently have notification implementation:

| Event | Trigger Location | Recipient | Implementation |
|-------|------------------|-----------|----------------|
| **Course Approved** | `src/admin/services/admin-courses.service.ts:195-201` | Instructor | `NotificationsService.create()` with `NotificationType.COURSE_APPROVED` |
| **Course Rejected** | `src/admin/services/admin-courses.service.ts:246-252` | Instructor | `NotificationsService.create()` with `NotificationType.COURSE_REJECTED` |
| **Account Deactivated** | `src/admin/services/admin-users.service.ts:105-113` | User | Direct `notificationModel.create()` with type `'USER_DEACTIVATED'` |
| **Account Reactivated** | `src/admin/services/admin-users.service.ts:144-150` | User | Direct `notificationModel.create()` with type `'USER_REACTIVATED'` |
| **Role Changed** | `src/users/users.service.ts:162-168` | User | Direct `notificationModel.create()` with type `'ROLE_CHANGE'` |
| **Certificate Earned** | `src/quizzes/quizzes.service.ts:301-310` | Student | Direct `notificationModel.create()` with type `'CERTIFICATE_EARNED'` |
| **Payout Processed** | `src/superadmin/superadmin.service.ts:297-305` | Instructor | Direct `notificationModel.create()` with type `'PAYOUT_PROCESSED'` |

### Notification Enum Definition

```typescript
// src/notifications/enums/notification-type.enum.ts
export enum NotificationType {
  COURSE_APPROVED = 'COURSE_APPROVED',
  COURSE_REJECTED = 'COURSE_REJECTED',
}
```

**Note**: Only 2 notification types are defined in the enum, but 5 additional notification types are used directly as strings in code.

---

## Section 2: Missing Notification Opportunities

The following business events were identified in the codebase but lack notification handling:

### A. Enrollment & Purchase Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Purchase Completed** | `src/webhooks/webhooks.controller.ts:84-139` | System (payment webhook) | No notification to student about successful purchase |
| **Free Course Enrollment** | `src/orders/orders.service.ts:67-84` | System | No notification to student about free enrollment |
| **New Student Enrollment** | `src/webhooks/webhooks.controller.ts` | Student | No notification to course instructor about new enrollment |

### B. Course Lifecycle Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Course Submitted for Review** | `src/courses/courses.service.ts:submitForReview()` | Instructor | No notification to admin |
| **Course Published (Self)** | N/A | - | Courses don't auto-publish |
| **Course Deleted** | `src/courses/courses.service.ts:remove()` | Instructor/Admin | No notification to instructor if admin deletes |
| **Rejection Reason Available** | `src/courses/courses.service.ts:getRejectionReason()` | Instructor | Pull-only - no push notification when reason is available |

### C. Progress & Completion Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Lesson Completed** | `src/enrollments/enrollments.service.ts:markLessonComplete()` | Student | No notification |
| **Course Completed** | `src/enrollments/enrollments.service.ts:markLessonComplete()` | Student | No notification (only quiz completion triggers certificate) |
| **Progress Milestone (25%, 50%, 75%)** | N/A | - | Not implemented |

### D. Review Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **New Review Posted** | `src/reviews/reviews.service.ts:createReview()` | Student | No notification to course instructor |
| **Low Rating Received** | `src/reviews/reviews.service.ts:createReview()` | Student | No urgent notification to instructor |

### E. Quiz Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Quiz Ready for Review** | `src/quizzes/quizzes.service.ts:saveQuizConfig()` | AI/Instructor | No notification to instructor |
| **Quiz Status Changed** | `src/quizzes/quizzes.service.ts:approveQuiz()` | Instructor | No notification to students |

### F. Order/Payment Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Payment Failed** | `src/webhooks/webhooks.controller.ts` | System | No notification to student |
| **Order Created** | `src/orders/orders.service.ts:processCheckout()` | Student | No notification |

### G. Report Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Report Resolved** | `src/admin/services/admin-reports.service.ts:resolveReport()` | Admin | No notification to reporter |
| **Content Removed (due to report)** | `src/admin/services/admin-reports.service.ts` | Admin | No notification to content owner |

### H. Earnings Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **New Earning Recorded** | `src/webhooks/webhooks.controller.ts` | System | No notification to instructor |
| **Earning Status Changed** | `src/superadmin/superadmin.service.ts` | Superadmin | No notification (only payout triggers notification) |

### I. Administrative Events

| Event | Trigger Location | Initiator | Missing Notification |
|-------|------------------|-----------|---------------------|
| **Account Will Be Deactivated** | N/A | - | Pre-warning not implemented |
| **Account Permanently Deleted** | N/A | - | Not implemented |

---

## Section 3: Recommended MVP Notification Matrix

| Event | Recipient | Importance | Delivery Method | Priority |
|-------|-----------|------------|-----------------|----------|
| **Course Submitted for Review** | Admin | High | In-App + Badge | Phase 1 |
| **Course Approved** | Instructor | High | In-App + Email* | **EXISTING** |
| **Course Rejected** | Instructor | High | In-App + Email* | **EXISTING** |
| **Rejection Reason Available** | Instructor | High | In-App | Phase 2 |
| **Purchase Completed** | Student | High | In-App | Phase 1 |
| **New Enrollment** | Instructor | High | In-App | Phase 1 |
| **New Review Posted** | Instructor | Medium | In-App | Phase 2 |
| **Low Rating Review** | Instructor | High | In-App + Badge | Phase 2 |
| **Course Completed** | Student | High | In-App + Toast | Phase 1 |
| **Certificate Earned** | Student | High | In-App + Toast | **EXISTING** |
| **Quiz Ready for Review** | Instructor | Medium | In-App | Phase 2 |
| **Report Resolved** | Student | Medium | In-App | Phase 2 |
| **Content Removed (Report)** | Instructor/Student | High | In-App | Phase 2 |
| **Earning Recorded** | Instructor | Medium | In-App | Phase 3 |
| **Payout Processed** | Instructor | High | In-App + Email* | **EXISTING** |
| **Account Deactivated** | User | High | In-App + Email* | **EXISTING** |
| **Account Reactivated** | User | High | In-App | **EXISTING** |
| **Role Changed** | User | High | In-App | **EXISTING** |
| **Payment Failed** | Student | High | In-App + Email | Phase 1 |

*Email delivery requires external email integration (not currently in scope)

---

## Section 4: Implementation Roadmap

### Phase 1: Critical (High Business Impact)

| # | Event | Files to Modify | Implementation Note |
|---|-------|-----------------|---------------------|
| 1.1 | **Course Submitted for Review** | `src/courses/courses.service.ts`, `src/notifications/enums/` | Add admin notification when status changes to `UNDER_REVIEW` |
| 1.2 | **Purchase Completed** | `src/webhooks/webhooks.controller.ts` | Add student notification after successful payment webhook |
| 1.3 | **New Enrollment** | `src/webhooks/webhooks.controller.ts` | Notify instructor when enrollment is created |
| 1.4 | **Course Completed** | `src/enrollments/enrollments.service.ts` | Add notification when `isCourseCompleted = true` |
| 1.5 | **Payment Failed** | `src/webhooks/webhooks.controller.ts` | Notify student of failed payment |

### Phase 2: Important (User Experience)

| # | Event | Files to Modify | Implementation Note |
|---|-------|-----------------|---------------------|
| 2.1 | **Rejection Reason Available** | `src/courses/courses.service.ts` | Add push notification when rejection reason is set |
| 2.2 | **New Review Posted** | `src/reviews/reviews.service.ts` | Notify course instructor |
| 2.3 | **Low Rating Review** | `src/reviews/reviews.service.ts` | High-priority notification for rating ≤ 2 |
| 2.4 | **Quiz Ready for Review** | `src/quizzes/quizzes.service.ts` | Notify instructor when AI generation completes |
| 2.5 | **Report Resolved** | `src/admin/services/admin-reports.service.ts` | Notify the reporter |
| 2.6 | **Content Removed** | `src/admin/services/admin-reports.service.ts` | Notify content owner |

### Phase 3: Nice to Have

| # | Event | Files to Modify | Implementation Note |
|---|-------|-----------------|---------------------|
| 3.1 | **Earning Recorded** | `src/webhooks/webhooks.controller.ts` | Notify instructor of new earning |
| 3.2 | **Progress Milestones** | `src/enrollments/enrollments.service.ts` | Notify at 25%, 50%, 75% completion |
| 3.3 | **Quiz Status Changed** | `src/quizzes/quizzes.service.ts` | Notify students when quiz is approved |

---

## Evidence Summary

### Files with Existing Notification Creation:

1. `src/admin/services/admin-courses.service.ts` - Lines 195, 246
2. `src/admin/services/admin-users.service.ts` - Lines 105, 144
3. `src/users/users.service.ts` - Line 162
4. `src/quizzes/quizzes.service.ts` - Line 302
5. `src/superadmin/superadmin.service.ts` - Line 297

### Key Service Files for New Notifications:

- `src/webhooks/webhooks.controller.ts` - Payment completion (lines 84-139)
- `src/enrollments/enrollments.service.ts` - Course completion (line ~90)
- `src/reviews/reviews.service.ts` - New reviews (line 48)
- `src/courses/courses.service.ts` - Course submission (line 200)
- `src/admin/services/admin-reports.service.ts` - Report resolution (line 90)

### Notification Schema Reference:

- `src/notifications/schema/notification.schema.ts`
- `src/notifications/enums/notification-type.enum.ts` (needs expansion)

---

## Not Analyzed Files

- `src/reports/schema/report.schema.ts` - Schema file not read
- `src/notes/` module - Not analyzed (assumed less relevant to notifications)
- `src/cloudinary/` module - Not analyzed (infrastructure only)
- `src/ai/` module - Not deeply analyzed for notification opportunities

---

*Report generated based on analysis of the EduGenie NestJS Backend API codebase.*