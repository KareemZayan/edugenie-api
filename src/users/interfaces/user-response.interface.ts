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
