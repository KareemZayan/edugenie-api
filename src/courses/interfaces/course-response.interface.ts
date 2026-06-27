import { UserResponse } from '../../users/interfaces/user-response.interface';

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
