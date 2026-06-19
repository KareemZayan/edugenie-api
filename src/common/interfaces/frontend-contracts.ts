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
export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  instructor: Pick<UserResponse, 'id' | 'firstName' | 'lastName' | 'avatar'> | string;
  category: { id: string; name: string; slug: string } | string;
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

// ── 14. Quizzes Extended Module ─────────────────────────────
export interface SubmitAnswerRequest {
  questionId:       string;
  selectedOptionIds: string[];
}

export interface SubmitQuizRequest {
  attemptId: string;
  answers:   SubmitAnswerRequest[];
}

export interface QuizOption {
  optionId: string;
  text:     string;
}

export interface QuizQuestionForStudent {
  questionId: string;
  text:       string;
  options:    QuizOption[];
}

export interface QuizForStudentResponse {
  quizId:             string;
  timeLimit:           number;
  passingScore:        number;
  attemptNumber:       number;
  maxAttempts:         number;
  attemptsRemaining:   number;
  questions:           QuizQuestionForStudent[];
}

export interface QuizStartResponse {
  attemptId: string;
  startedAt: Date;
  timeLimit: number;
}

export interface QuizSubmitResponse {
  passed:              boolean;
  score:                number;
  correctAnswers:       number;
  totalQuestions:       number;
  attemptNumber:        number;
  remainingAttempts:    number;
  progressReset:        boolean;
  nextSectionUnlocked:  boolean;
}

export interface QuizAttemptSummary {
  attemptNumber: number;
  score:         number | null;
  passed:        boolean | null;
  submittedAt:   Date | null;
}

export interface QuizAttemptsHistoryResponse {
  attempts:  QuizAttemptSummary[];
  canRetry:  boolean;
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
  lessonId:        string;
  watchedDuration: number;
  isCompleted:     boolean;
}

export type LessonState = 'not_started' | 'in_progress' | 'completed';

export interface ProgressResponse {
  lessonState:        LessonState;
  nextLessonUnlocked: boolean;
  nextLesson: { _id: string; title: string } | null;
  sectionCompleted:   boolean;
  quizRequired:       boolean;
  quizSectionId:      string | null;
}

// ── Lesson detail ─────────────────────────────────────────
export interface LessonDetailResponse {
  _id:           string;
  title:         string;
  videoUrl:      string;
  videoDuration: number;
  transcript:    string | null;
  sectionId:     string;
}

// ── Resume ────────────────────────────────────────────────
export interface ResumeResponse {
  lessonId:        string;
  sectionId:       string;
  watchedDuration: number;
}

// ── Notes ─────────────────────────────────────────────────
export interface NoteResponse {
  _id:       string;
  content:   string;
  timestamp: number;
  createdAt: Date;
}

export interface CreateNoteRequest {
  content:   string;
  timestamp: number;
}

export interface NotesListResponse {
  notes: NoteResponse[];
}
