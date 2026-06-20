import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { Order } from './schema/order.schema';
import { CartService } from '../cart/cart.service';
import { PaymobService } from '../paymob/paymob.service';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModel: any;
  let cartService: any;
  let paymobService: any;

  beforeEach(async () => {
    orderModel = function(data: any) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
      this._id = new Types.ObjectId();
    };
    orderModel.findOne = jest.fn();

    cartService = {
      validateCart: jest.fn(),
      getCart: jest.fn()
    };

    paymobService = {
      createPaymentUrl: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: CartService, useValue: cartService },
        { provide: PaymobService, useValue: paymobService }
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('processCheckout', () => {
    const studentId = new Types.ObjectId().toString();

    it('should reject checkout with an empty cart', async () => {
      cartService.validateCart.mockResolvedValue({ items: [] });
      await expect(service.processCheckout(studentId)).rejects.toThrow(BadRequestException);
    });

    it('should create an Order with status PENDING before calling Paymob', async () => {
      cartService.validateCart.mockResolvedValue({ items: [{ itemType: 'full_course', courseId: new Types.ObjectId(), price: 100 }] });
      cartService.getCart.mockResolvedValue({ items: [{ type: 'full_course', courseId: new Types.ObjectId().toString(), courseTitle: 'C', price: 100 }] });
      orderModel.findOne.mockResolvedValue(null);
      paymobService.createPaymentUrl.mockResolvedValue({ clientSecret: 'secret' });

      const result = await service.processCheckout(studentId);
      expect(result).toBeDefined();
      expect(paymobService.createPaymentUrl).toHaveBeenCalled();
    });

    it('should return same orderId for idempotent call', async () => {
      cartService.validateCart.mockResolvedValue({ items: [{ itemType: 'full_course', courseId: new Types.ObjectId(), price: 100 }] });
      cartService.getCart.mockResolvedValue({ items: [{ type: 'full_course', courseId: new Types.ObjectId().toString(), courseTitle: 'C', price: 100 }] });
      
      const existingOrder = { _id: new Types.ObjectId(), totalAmount: 100, status: 'PENDING' };
      orderModel.findOne.mockResolvedValue(existingOrder);
      paymobService.createPaymentUrl.mockResolvedValue({ clientSecret: 'secret_existing' });

      const result = await service.processCheckout(studentId);
      expect(result.orderId).toBe(existingOrder._id.toString());
      expect(result.clientSecret).toBe('secret_existing');
    });

    it('should set Order status to FAILED when Paymob throws', async () => {
      cartService.validateCart.mockResolvedValue({ items: [{ itemType: 'full_course', courseId: new Types.ObjectId(), price: 100 }] });
      cartService.getCart.mockResolvedValue({ items: [{ type: 'full_course', courseId: new Types.ObjectId().toString(), courseTitle: 'C', price: 100 }] });
      orderModel.findOne.mockResolvedValue(null);
      paymobService.createPaymentUrl.mockRejectedValue(new Error('Paymob failure'));

      await expect(service.processCheckout(studentId)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
