import { User } from '../../users/schemas/user.schema';
import { InstructorProfileResponse } from '../interfaces/instructor-profile.interface';

export class InstructorProfileMapper {
  static toProfileResponse(user: User | any): InstructorProfileResponse {
    return {
      id: user._id?.toString() || user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      avatar: user.avatar || null,
      bio: user.bio || null,
      level: user.level || null,
      skills: user.skills || [],
      interests: user.interests || [],
      goals: user.goals || [],
      averageInstructorRating: user.averageInstructorRating || 0,
      profileViews: user.profileViews || 0,
    };
  }

  static toPublicProfileResponse(user: User | any): Partial<InstructorProfileResponse> {
    return {
      id: user._id?.toString() || user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      avatar: user.avatar || null,
      bio: user.bio || null,
      level: user.level || null,
      skills: user.skills || [],
      interests: user.interests || [],
      goals: user.goals || [],
      averageInstructorRating: user.averageInstructorRating || 0,
      profileViews: user.profileViews || 0,
    };
  }
}
