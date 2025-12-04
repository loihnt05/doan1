import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ArticleDocument = Article & Document;

@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, trim: true, minlength: 5, maxlength: 200 })
  title: string;

  @Prop({
    required: true,
    enum: ['Technology', 'Health', 'Finance', 'Education', 'Entertainment'],
  })
  category: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0, min: 0 })
  views: number;

  @Prop({ default: true })
  published: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

// Add indexes for query optimization
ArticleSchema.index({ category: 1 }); // Single field index
ArticleSchema.index({ createdAt: -1 }); // Descending index
ArticleSchema.index({ title: 'text' }); // Full-text search index
ArticleSchema.index({ category: 1, createdAt: -1 }); // Compound index

// Virtual field - computed property
ArticleSchema.virtual('summary').get(function () {
  return this.content ? this.content.substring(0, 100) + '...' : '';
});

// Enable virtual fields in JSON output
ArticleSchema.set('toJSON', { virtuals: true });
ArticleSchema.set('toObject', { virtuals: true });
