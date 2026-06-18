import { Exclude, Expose } from 'class-transformer';

export class QuizSerializer {
  @Expose() id: string;
  @Expose() sectionId: string;
  @Expose() difficulty: string;
  @Expose() numberOfQuestions: number;
  @Expose() questionType: string;
  @Expose() generationStatus: string;
  @Expose() questions: any[];
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() __v?: number;

  constructor(partial: Partial<QuizSerializer>) {
    Object.assign(this, partial);
    
    if ((partial as any)._id) {
      this.id = (partial as any)._id.toString();
      delete (this as any)._id;
    }

    if ((partial as any).sectionId) {
      const sectionId = (partial as any).sectionId;
      if (typeof sectionId === 'object' && sectionId._id) {
         this.sectionId = sectionId._id.toString();
      } else {
         this.sectionId = sectionId?.toString() || sectionId;
      }
    }
  }
}
