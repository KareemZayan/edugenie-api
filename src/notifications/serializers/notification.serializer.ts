import { Exclude, Expose } from 'class-transformer';

export class NotificationSerializer {
  @Expose() id: string;
  @Expose() userId: string;
  @Expose() title: string;
  @Expose() message: string;
  @Expose() isRead: boolean;
  @Expose() type: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<NotificationSerializer>) {
    Object.assign(this, partial);
    const doc = partial as Record<string, unknown>;
    if (doc._id) {
      this.id = doc._id.toString();
      delete (this as any)._id;
    }
    if (doc.userId) {
      this.userId = doc.userId.toString();
      delete (this as any).userId;
    }
  }
}
