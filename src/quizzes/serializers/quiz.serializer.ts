import { ApiProperty } from '@nestjs/swagger';

import { Exclude, Expose } from 'class-transformer';

export class QuizSerializer {
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;
  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  sectionId: string;
  @Expose()
  @ApiProperty({ example: 'MEDIUM', nullable: true })
  difficulty: string | null;
  @Expose()
  @ApiProperty({ example: 1 })
  numberOfQuestions: number;
  @Expose()
  @ApiProperty({ example: ['SINGLE_CHOICE', 'TRUE_FALSE'], type: [String] })
  questionTypes: string[];
  @Expose()
  @ApiProperty({ example: 'string_example' })
  generationStatus: string;
  @Expose()
  @ApiProperty()
  questions: any[];
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
  @Expose()
  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @Exclude()
  @ApiProperty({ required: false, example: 1 })
  __v?: number;

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
