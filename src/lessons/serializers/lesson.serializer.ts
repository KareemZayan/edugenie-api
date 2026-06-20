import { Exclude, Expose } from 'class-transformer';

export class LessonSerializer {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() videoUrl: string;
  @Expose() videoPublicId: string;
  @Expose() videoDuration: number;
  @Expose() transcript: string;
  @Expose() order: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<LessonSerializer>) {
    Object.assign(this, partial);

    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }
  }
}
