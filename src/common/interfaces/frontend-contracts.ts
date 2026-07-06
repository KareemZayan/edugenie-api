export interface TranscriptionStatusResponse {
  videoReady: boolean;
  transcriptReady: boolean;
  transcript: string | null;
}

// ── 1. Enums ────────────────────────────────────────────────
export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

export enum EnrollmentType {
  FULL_COURSE = 'full_course',
  SECTIONS = 'sections',
}

export enum CartItemType {
  COURSE = 'course',
  SECTION = 'section',
}

export enum UserLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum CourseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum CourseStatus {
  DRAFT = 'draft',
  UNDER_REVIEW = 'under_review',
  REJECTED = 'rejected',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum QuizDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTI_CHOICE = 'MULTI_CHOICE',
  TRUE_FALSE = 'TRUE_FALSE',
  MIXED = 'MIXED',
}

export enum QuizGenerationStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ── 2. Shared wrappers ──────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ── 3. Auth Module ──────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password?: string;
}
export interface AuthResponse {
  message: string;
  user?: UserResponse;
}

// ── 4. Users Module ─────────────────────────────────────────
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: UserRole;
}
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  bio?: string;
  skills?: string[];
  interests?: string[];
  level?: UserLevel;
}
export interface UserResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatar?: string;
  level?: string;
  skills: string[];
  interests: string[];
  bio?: string;
  averageInstructorRating?: number;
  profileViews: number;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface ChangeUserRoleRequest {
  newRole: 'student' | 'instructor' | 'admin' | 'superadmin';
  confirmSuperAdminChange?: boolean;
}
export interface ChangeRoleResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  oldRole: string;
  newRole: string;
  changedAt: Date;
  changedBy: string;
}

// ── 5. Categories Module ────────────────────────────────────
export interface CreateCategoryRequest {
  name: string;
}

export interface UpdateCategoryRequest {
  name?: string;
}

export interface CategoryResponse {
  id: string;
  name: string;
  courseCount?: number;
}

// ── 6. Courses Module ───────────────────────────────────────
export interface CreateCourseRequest {
  title: string;
  description: string;
  thumbnail: string;
  level: CourseLevel;
  categoryId: string;
  goals?: string[];
  requirements?: string[];
}
export interface CourseResponse {
  id: string;
  title: string;
  description: string;
  price: number;
  thumbnail: string;
  level: string;
  courseStatus: string;
  instructor:
  | Pick<UserResponse, 'id' | 'firstName' | 'lastName' | 'email' | 'avatar'>
  | string;
  category: { id: string; name: string } | string;
  goals: string[];
  requirements: string[];
  ratingAverage: number;
  totalEnrollments: number;
  totalLessons: number;
  totalHours: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── 7. Sections Module ──────────────────────────────────────
export interface CreateSectionRequest {
  title: string;
  description: string;
  expectedOutcomes?: string[];
  price?: number | null;
}
export interface SectionResponse {
  id: string;
  courseId: string;
  title: string;
  order: number;
  description?: string;
  price?: number | null;
  isPublished: boolean;
  lessons: LessonResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SectionPurchaseInfo {
  sectionId: string;
  title: string;
  price: number | null;
  isPurchasable: boolean;
  isAlreadyOwned: boolean;
  courseId: string;
  courseTitle: string;
}

export interface SetSectionPriceRequest {
  price: number | null;
}

// ── 8. Lessons Module ───────────────────────────────────────
export interface LessonResponse {
  id: string;
  courseId: string;
  sectionId: string;
  title: string;
  order: number;
  description?: string;
  videoUrl?: string;
  videoDuration?: number;
  isFree: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── 9. Quizzes Module ───────────────────────────────────────
export interface CreateQuizRequest {
  sectionId: string;
  difficulty: QuizDifficulty;
  numberOfQuestions: number;
  questionType: QuestionType;
}

export interface QuizQuestion {
  questionText: string;
  type: QuestionType;
  options: string[];
  correctAnswers: string[];
}

export interface QuizResponse {
  id: string;
  sectionId: string;
  difficulty: QuizDifficulty;
  numberOfQuestions: number;
  questionType: QuestionType;
  generationStatus: QuizGenerationStatus;
  questions: QuizQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

// ── 10. Orders & Cart Module ────────────────────────────────
export interface CartItem {
  itemType: CartItemType;
  courseId: string;
  sectionId?: string;
  price: number;
}

export interface AddToCartRequest {
  itemType: CartItemType;
  courseId: string;
  sectionId?: string;
}
export interface CartResponse {
  studentId: string;
  items: CartItem[];
}
export interface OrderResponse {
  id: string;
  studentId: string;
  items: CartItem[];
  totalAmount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── 11. Enrollments Module ──────────────────────────────────
export interface EnrollmentResponse {
  id: string;
  studentId: string;
  courseId: string;
  type: EnrollmentType;
  sectionIds: string[];
  progressPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseAccessInfo {
  courseId: string;
  accessType: 'full_course' | 'sections' | 'none';
  accessibleSections: string[];
  totalSections: number;
  enrolledAt: Date | null;
}

// ── 12. Reviews Module ──────────────────────────────────────
export interface ReviewResponse {
  id: string;
  courseId: string;
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── 13. Notifications Module ────────────────────────────────
export interface NotificationResponse {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationListResponse extends PaginatedResponse<NotificationResponse> {
  unreadCount: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

// ── 14. Quizzes Extended Module ─────────────────────────────
export interface SubmitAnswerRequest {
  questionId: string;
  selectedOptionIds: string[];
}

export interface SubmitQuizRequest {
  attemptId: string;
  answers: SubmitAnswerRequest[];
}

export interface QuizOption {
  optionId: string;
  text: string;
}

export interface QuizQuestionForStudent {
  questionId: string;
  text: string;
  /** Per-question type: SINGLE_CHOICE | MULTI_CHOICE | TRUE_FALSE (drives UI). */
  type: string;
  options: QuizOption[];
}

export interface QuizForStudentResponse {
  quizId: string;
  timeLimit: number;
  passingScore: number;
  attemptNumber: number;
  maxAttempts: number;
  attemptsRemaining: number;
  /** Quiz-level type, drives single (radio) vs multi (checkbox) UI. */
  questionType: string;
  questions: QuizQuestionForStudent[];
}

export interface QuizStartResponse {
  attemptId: string;
  startedAt: Date;
  timeLimit: number;
}

export interface QuizSubmitResponse {
  passed: boolean;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  attemptNumber: number;
  remainingAttempts: number;
  progressReset: boolean;
  nextSectionUnlocked: boolean;
}

export interface QuizAttemptSummary {
  attemptNumber: number;
  score: number | null;
  passed: boolean | null;
  submittedAt: Date | null;
}

export interface QuizAttemptsHistoryResponse {
  attempts: QuizAttemptSummary[];
  canRetry: boolean;
}

// ── 15. Earnings Module ──────────────────────────────────────
export interface EarningResponse {
  id: string;
  instructorId: string;
  orderId: string;
  courseId: string;
  sectionId?: string;
  amount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Progress ─────────────────────────────────────────────
export interface TrackProgressRequest {
  lessonId: string;
  watchedDuration: number;
  isCompleted: boolean;
}

export type LessonState = 'not_started' | 'in_progress' | 'completed';

export interface ProgressResponse {
  lessonState: LessonState;
  nextLessonUnlocked: boolean;
  nextLesson: { _id: string; title: string } | null;
  sectionCompleted: boolean;
  quizRequired: boolean;
  quizSectionId: string | null;
}

// ── Lesson detail ─────────────────────────────────────────
export interface LessonDetailResponse {
  _id: string;
  title: string;
  videoUrl: string;
  videoDuration: number;
  transcript: string | null;
  sectionId: string;
}

// ── Resume ────────────────────────────────────────────────
export interface ResumeResponse {
  lessonId: string;
  sectionId: string;
  watchedDuration: number;
}

// ── Notes ─────────────────────────────────────────────────
export interface NoteResponse {
  _id: string;
  content: string;
  timestamp: number;
  createdAt: Date;
}

export interface CreateNoteRequest {
  content: string;
  timestamp: number;
}

export interface NotesListResponse {
  notes: NoteResponse[];
}

// ── 16. Instructor Dashboard Module ──────────────────────────
export interface DashboardOverviewResponse {
  totalEarnings: number;
  earningsChangePercent: number;
  totalStudents: number;
  newStudentsThisWeek: number;
  averageRating: number;
  totalCourses: number;
  pendingPayout: number;
  nextPayoutDate: Date;
}

export type AttentionItemType =
  | 'course_rejected'
  | 'low_review'
  | 'quiz_pending_review';

export interface AttentionItem {
  type: AttentionItemType;
  courseId?: string;
  courseTitle: string;
  rejectionReason?: string;
  rating?: number;
  reviewId?: string;
  sectionId?: string;
  createdAt: Date;
}

export interface AttentionItemsResponse {
  items: AttentionItem[];
}

export interface InstructorCourseListItem {
  id: string;
  title: string;
  thumbnail: string;
  status: CourseStatus;
  totalStudents: number;
  totalRevenue: number;
  rating: number;
  completionRate: number;
}

export interface RejectionReasonResponse {
  courseId: string;
  courseTitle: string;
  status: string;
  rejectionReason: string;
  rejectedBy: string;
  rejectedAt: Date;
}

export interface InstructorStudentListItem {
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  accessType: 'full_course' | 'sections';
  accessibleSections: string[];
  progressPercent: number;
  enrolledAt: Date;
}

export type EarningStatusValue =
  | 'PENDING'
  | 'CLEARED'
  | 'REQUESTED'
  | 'PAID_OUT';
export type PayoutRequestStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface PayoutMethodResponse {
  /** Masked PayPal email (e.g. `j***@example.com`), or null if none saved. */
  paypalEmail: string | null;
  updatedAt: Date | null;
}

export interface InstructorPayoutRequestItem {
  id: string;
  amount: number;
  earningsCount: number;
  status: PayoutRequestStatusValue;
  method: string | null;
  reference: string | null;
  gatewayReference?: string | null;
  failureReason?: string | null;
  note: string | null;
  requestedAt: Date;
  processedAt: Date | null;
}

export interface EarningsPayoutResponse {
  // The instructor only ever sees their share — never the full course price.
  config: {
    instructorSharePercent: number;
    platformFeePercent: number;
    minimumPayoutThreshold: number;
  };
  totals: {
    totalEarned: number;
    pending: number;
    inReview: number;
    paidOut: number;
  };
  /** Back-compat alias of totals.totalEarned. */
  totalEarned: number;
  /** Back-compat alias of totals.pending. */
  pendingPayout: number;
  /** Payouts are automatic (Stripe pays out on a schedule) — no manual request. */
  payoutsAutomatic?: boolean;
  canRequest: boolean;
  openRequest: {
    id: string;
    amount: number;
    earningsCount: number;
    status: PayoutRequestStatusValue;
    requestedAt: Date;
  } | null;
  breakdown: {
    fromFullCourses: number;
    fromSections: number;
  };
  /** Stripe Connect onboarding + live connected-account balance. */
  stripe: {
    hasAccount: boolean;
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    balanceAvailable: number;
    balancePending: number;
  };
  requests: InstructorPayoutRequestItem[];
  history: Array<{
    date: Date;
    amount: number;
    status: EarningStatusValue;
    type: 'full_course' | 'section';
    courseTitle: string;
    sectionTitle: string | null;
    orderId: string;
  }>;
}

export interface InstructorReviewListItem {
  reviewId: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface PendingQuizListItem {
  quizId: string;
  sectionId: string;
  sectionTitle: string;
  courseTitle: string;
  questionCount: number;
  generatedAt: Date;
}

export interface QuizDetailForInstructorResponse {
  quizId: string;
  sectionId: string;
  questions: Array<{
    questionId: string;
    text: string;
    options: Array<{ optionId: string; text: string }>;
    correctAnswers: string[];
  }>;
}

export interface QuizApproveResponse {
  quizId: string;
  status: string;
  approvedAt: Date;
}

// ── 17. Admin Dashboard Module ───────────────────────────────
export interface RejectCourseRequest {
  rejectionReason: string;
}

export interface DeactivateUserRequest {
  reason: string;
}

export interface ResolveReportRequest {
  resolution: string;
  action: 'content_removed' | 'no_action' | 'user_warned';
}

export interface AdminDashboardOverviewResponse {
  pendingApprovals: number;
  newSignupsToday: number;
  openReports: number;
  platformRevenue: number;
  todayRevenue: number;
}

export interface CourseListInstructor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
}

export interface PendingCourseListItem {
  courseId: string;
  title: string;
  thumbnail: string;
  thumbnailPublicId: string;
  level: string;
  price: number;
  totalHours: number;
  category: { id: string; name: string } | null;
  instructorId: string;
  instructorName: string;
  instructor: CourseListInstructor | null;
  submittedAt: Date;
  totalSections: number;
  totalLessons: number;
}

export interface PendingCourseListResponse extends PaginatedResponse<PendingCourseListItem> { }

export interface RejectedCourseListItem {
  courseId: string;
  title: string;
  thumbnail: string;
  thumbnailPublicId: string;
  level: string;
  price: number;
  totalHours: number;
  category: { id: string; name: string } | null;
  instructorId: string;
  instructorName: string;
  instructor: CourseListInstructor | null;
  rejectionReason: string;
  rejectedBy: string;
  rejectedAt: Date;
}

export interface RejectedCourseListResponse extends PaginatedResponse<RejectedCourseListItem> { }

export interface CourseReviewDetailResponse {
  courseId: string;
  title: string;
  description: string;
  price: number;
  instructor: { id: string; name: string; email: string };
  sections: Array<{
    sectionId: string;
    title: string;
    lessons: Array<{
      lessonId: string;
      title: string;
      videoDuration: number;
      videoUrl: string;
    }>;
  }>;
  submittedAt: Date;
}

export interface CourseApprovalResponse {
  courseId: string;
  status: string;
  approvedBy: string;
  approvedAt: Date;
}

export interface CourseRejectionResponse {
  courseId: string;
  status: string;
  rejectionReason: string;
  rejectedBy: string;
  rejectedAt: Date;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
  status: string;
  createdAt: Date;
}

export interface AdminUserListResponse extends PaginatedResponse<AdminUserListItem> { }

export interface UserStatusChangeResponse {
  userId: string;
  status: string;
  deactivatedBy?: string;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
}

export interface ReportListItem {
  reportId: string;
  type: string;
  targetId: string;
  reason: string;
  reportedBy?: string;
  status: string;
  createdAt: Date;
}

export interface ReportListResponse extends PaginatedResponse<ReportListItem> { }

export interface ReportResolutionResponse {
  reportId: string;
  status: string;
  resolution: string;
  resolvedBy: string;
  resolvedAt: Date;
}

export interface PlatformAnalyticsResponse {
  totalUsers: number;
  totalInstructors: number;
  totalStudents: number;
  totalCourses: number;
  totalRevenue: number;
  revenueGrowthPercent: number;
  revenueChart: {
    labels: string[];
    data: number[];
  };
  topCourses: Array<{
    courseId: string;
    title: string;
    enrollments: number;
    revenue: number;
  }>;
  topInstructors: Array<{
    instructorId: string;
    name: string;
    totalRevenue: number;
    totalStudents: number;
  }>;
}

// -- 18. SuperAdmin Dashboard Module ------------------------------
export interface ProcessPayoutRequest {
  method: 'bank_transfer' | 'paypal';
  reference: string;
}

export interface UpdatePlatformConfigRequest {
  platformFeePercent?: number;
  maintenanceMode?: boolean;
  minimumPayoutThreshold?: number;
}

export interface AuditLogsFilterRequest {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface SuperAdminDashboardOverviewResponse {
  systemStatus: string;
  /** Platform commission kept = gross sales − instructor share. */
  platformRevenue: number;
  /** Total gross of completed, non-charged-back sales. */
  grossSales: number;
  /** Total instructor share (money paid out to instructors). */
  instructorPayouts: number;
  /** Total Stripe processing fees the platform absorbed. */
  stripeFees: number;
  /** Daily net-platform-revenue trend for the chart. */
  revenueChart: { labels: string[]; data: number[] };
  /** Week-over-week net revenue growth (%). */
  revenueGrowthPercent: number;
  payoutLiability: number;
  activeAdmins: number;
  pendingPayouts: number;
  criticalAlerts: Array<{
    type: 'webhook_failure' | 'payout_backlog';
    service?: string;
    occurredCount?: number;
    lastOccurredAt?: Date;
    count?: number;
    oldestPendingDate?: Date;
  }>;
}

export interface AdminListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActiveAt: Date | null;
  actionsThisMonth: number;
}

export interface AdminActivityItem {
  action: string;
  targetId: string;
  targetLabel: string;
  createdAt: Date;
}

export interface AdminActivityPaginatedResponse extends PaginatedResponse<AdminActivityItem> { }

export interface PendingPayoutListItem {
  requestId: string;
  instructorId: string;
  instructorName: string;
  instructorEmail: string;
  amount: number;
  earningsCount: number;
  requestedAt: Date;
  /** PayPal destination the instructor chose (snapshot), if any. */
  paypalEmail?: string | null;
  /** PENDING (new), PROCESSING (gateway payout in flight) or FAILED. */
  status?: string;
  /** Set when a gateway payout failed — why it failed. */
  failureReason?: string | null;
  /** Gateway payout batch id (PayPal) — for status checks / verification. */
  gatewayReference?: string | null;
}

export interface PendingPayoutPaginatedResponse extends PaginatedResponse<PendingPayoutListItem> { }

export interface PayoutProcessResponse {
  requestId: string;
  instructorId: string;
  amount: number;
  status: string;
  processedBy: string;
  processedAt: Date;
  reference?: string;
  note?: string;
}

export interface PlatformConfigResponse {
  platformFeePercent: number;
  instructorSharePercent: number;
  maintenanceMode: boolean;
  minimumPayoutThreshold: number;
  updatedBy?: string;
  updatedAt?: Date;
}

export interface AuditLogItem {
  id: string;
  action: string;
  performedBy: { id: string; name: string };
  targetUser: { id: string; name: string };
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogPaginatedResponse extends PaginatedResponse<AuditLogItem> { }

export interface SystemHealthResponse {
  apiStatus: string;
  averageResponseTimeMs: number | null;
  errorRateLast24h: number | null;
  webhookFailuresLast24h: number;
  lastWebhookFailure: {
    service: string;
    endpoint: string;
    errorMessage: string;
    occurredAt: Date;
  } | null;
}

// ── 20. Handoff Auth Module ─────────────────────────────────
export interface HandoffCodeResponse {
  code: string;
  expiresIn: number;
}

export interface RedeemCodeRequest {
  code: string;
}

export interface RedeemCodeResponse {
  success: boolean;
  data: { userId: string; userRole: string };
}
