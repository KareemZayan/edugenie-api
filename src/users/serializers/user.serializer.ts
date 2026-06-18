import { Exclude, Expose } from 'class-transformer';
import { UserResponse } from '../interfaces/user-response.interface';

export class UserSerializer implements UserResponse {
  @Expose() id: string;
  @Expose() firstName: string;
  @Expose() lastName: string;
  @Expose() email: string;
  @Expose() role: string;
  @Expose() avatar?: string;
  @Expose() level?: string;
  @Expose() skills: string[];
  @Expose() interests: string[];
  @Expose() bio?: string;
  @Expose() averageInstructorRating?: number;
  @Expose() profileViews: number;
  @Expose() isVerified: boolean;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() password!: string;
  @Exclude() passwordReset?: { code: string; expiresAt: Date };
  @Exclude() __v?: number;

  constructor(partial: Partial<UserSerializer>) {
    Object.assign(this, partial);
    // Convert Mongo _id to id if present
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
      delete (this as any)._id;
    }
  }
}
