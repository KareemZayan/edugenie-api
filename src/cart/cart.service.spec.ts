import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CartService } from './cart.service';
import { Cart } from './schema/cart.schema';
import { CoursesService } from '../courses/courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('CartService', () => {
  let service: CartService;
  let cartModel: any;
  let coursesService: any;
  let enrollmentsService: any;

  beforeEach(async () => {
    cartModel = {
      findOne: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      create: jest.fn()
    };
    coursesService = {
      findOne: jest.fn()
    };
    enrollmentsService = {
      hasDuplicate: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getModelToken(Cart.name), useValue: cartModel },
        { provide: CoursesService, useValue: coursesService },
        { provide: EnrollmentsService, useValue: enrollmentsService }
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  describe('addToCart', () => {
    const studentId = new Types.ObjectId().toString();
    const courseId = new Types.ObjectId().toString();

    it('should add to cart successfully', async () => {
      enrollmentsService.hasDuplicate.mockResolvedValue(false);
      const mockCart = { studentId: new Types.ObjectId(studentId), items: [], save: jest.fn() };
      cartModel.findOne = jest.fn().mockResolvedValue(mockCart);
      coursesService.findOne.mockResolvedValue({ _id: courseId, price: 100, title: 'Course', thumbnail: 'img', instructorId: { name: 'Inst' } });
      
      jest.spyOn(service, 'getCart').mockResolvedValue({ items: [], subtotal: 100, total: 100 });

      const result = await service.addToCart(studentId, 'full_course', courseId);
      expect(mockCart.items.length).toBe(1);
      expect(mockCart.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject when student already owns the item', async () => {
      enrollmentsService.hasDuplicate.mockResolvedValue(true);
      await expect(service.addToCart(studentId, 'full_course', courseId)).rejects.toThrow(ConflictException);
    });

    it('should reject a section with price null', async () => {
      enrollmentsService.hasDuplicate.mockResolvedValue(false);
      const mockCart = { studentId: new Types.ObjectId(studentId), items: [], save: jest.fn() };
      cartModel.findOne = jest.fn().mockResolvedValue(mockCart);
      const sectionId = new Types.ObjectId().toString();
      coursesService.findOne.mockResolvedValue({ 
        _id: courseId, price: 100, sections: { id: () => ({ price: null }) }
      });
      await expect(service.addToCart(studentId, 'section', courseId, sectionId)).rejects.toThrow(BadRequestException);
    });

    it('should reject adding the same item twice', async () => {
      enrollmentsService.hasDuplicate.mockResolvedValue(false);
      const mockCart = { 
        studentId: new Types.ObjectId(studentId), 
        items: [{ itemType: 'full_course', courseId: new Types.ObjectId(courseId) }], 
        save: jest.fn() 
      };
      cartModel.findOne = jest.fn().mockResolvedValue(mockCart);
      await expect(service.addToCart(studentId, 'full_course', courseId)).rejects.toThrow(ConflictException);
    });
  });

  describe('removeFromCart', () => {
    it('should throw NotFoundException if item not in cart', async () => {
      const studentId = new Types.ObjectId().toString();
      const mockCart = { studentId: new Types.ObjectId(studentId), items: [], save: jest.fn() };
      cartModel.findOne = jest.fn().mockResolvedValue(mockCart);
      await expect(service.removeFromCart(studentId, new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });
});
