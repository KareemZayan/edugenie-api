import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const userModel = app.get<Model<any>>(getModelToken('User'));
  const categoryModel = app.get<Model<any>>(getModelToken('Category'));
  const courseModel = app.get<Model<any>>(getModelToken('Course'));

  console.log('Seeding data...');

  // 1. Seed Categories
  await categoryModel.deleteMany({});
  const categories = await categoryModel.insertMany([
    { name: 'Web Development', slug: 'web-development', description: 'Learn to build websites.' },
    { name: 'Data Science', slug: 'data-science', description: 'Analyze data and build AI models.' },
    { name: 'Business', slug: 'business', description: 'Master marketing and management.' },
  ]);

  // 2. Seed Users
  await userModel.deleteMany({});
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const admin = await userModel.create({
    email: 'admin@edugenie.com',
    password: passwordHash,
    firstName: 'System',
    lastName: 'Admin',
    role: UserRole.SUPERADMIN,
  });

  const instructor = await userModel.create({
    email: 'instructor@edugenie.com',
    password: passwordHash,
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.INSTRUCTOR,
  });

  const student = await userModel.create({
    email: 'student@edugenie.com',
    password: passwordHash,
    firstName: 'John',
    lastName: 'Smith',
    role: UserRole.STUDENT,
  });

  // 3. Seed Courses
  await courseModel.deleteMany({});
  await courseModel.create({
    title: 'The Complete Web Developer Bootcamp',
    subtitle: 'Learn full-stack web development from scratch.',
    description: 'This is a very detailed course...',
    categoryId: categories[0]._id,
    instructorId: instructor._id,
    price: 99.99,
    level: 'beginner',
    language: 'english',
    thumbnail: 'https://via.placeholder.com/600x400',
    courseStatus: 'published',
    totalLessons: 0,
    totalHours: 0,
    sections: []
  });

  console.log('Seeding complete!');
  await app.close();
}

bootstrap().catch(console.error);
