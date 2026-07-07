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
  hasOnboarded?: boolean;
  onboarding?: {
    specialization: string;
    currentLevel: string;
    hoursPerWeek: string;
    pace: string;
    priorExperience: string;
    endGoal: string;
    learningStyle?: string;
    knownTopics: string[];
    focusTopics: string[];
    extraNotes?: string;
    profileSummary: string;
    completedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
