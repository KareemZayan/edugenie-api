import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsOptional } from 'class-validator';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  name!: string;


  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  slug!: string;

}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.pre('validate', function (this: CategoryDocument) {
  if (this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
});
