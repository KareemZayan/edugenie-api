export interface InstructorProfileResponse {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  level: string | null;
  skills: string[];
  interests: string[];
  goals: string[];
  averageInstructorRating?: number;
  profileViews?: number;
}

export interface InstructorStatsResponse {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  archivedCourses: number;
  totalStudents: number;
  totalEnrollments: number;
  averageRating: number;
  profileViews: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
