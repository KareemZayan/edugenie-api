import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { getModelToken } from '@nestjs/mongoose';
import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Course } from '../courses/schema/course.schema';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let paymobService: any;
  let orderModel: any;
  let enrollmentModel: any;
  let earningModel: any;
  let courseModel: any;

  beforeEach(async () => {
    paymobService = {
      verifyWebhookHmac: jest.fn(),
    };

    orderModel = function () {};
    orderModel.db = {
      startSession: jest
        .fn()
        .mockResolvedValue({
          startTransaction: jest.fn(),
          commitTransaction: jest.fn(),
          abortTransaction: jest.fn(),
          endSession: jest.fn(),
        }),
    };
    orderModel.findById = jest.fn().mockReturnThis();
    orderModel.session = jest.fn();

    enrollmentModel = function (data: any) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
    };
    enrollmentModel.findOne = jest.fn().mockReturnThis();
    enrollmentModel.session = jest.fn();

    earningModel = function (data: any) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
    };

    courseModel = {
      findById: jest.fn().mockReturnThis(),
      session: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: PaymobService, useValue: paymobService },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getModelToken(Earning.name), useValue: earningModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe('handlePaymobWebhook', () => {
    it('should reject invalid HMAC signature', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(false);
      const req = { body: {} } as any;
      const res = {} as any;

      await expect(
        controller.handlePaymobWebhook(req, res, 'invalid_hmac'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid HMAC and transition PENDING -> COMPLETED', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(true);
      const orderId = new Types.ObjectId();
      const req = { body: { order_id: orderId.toString() } } as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      const mockOrder = {
        _id: orderId,
        status: 'PENDING',
        studentId: new Types.ObjectId(),
        items: [
          {
            courseId: new Types.ObjectId(),
            itemType: 'full_course',
            price: 100,
          },
        ],
        save: jest.fn(),
      };

      orderModel.session.mockResolvedValue(mockOrder);
      enrollmentModel.session.mockResolvedValue(null); // No existing enrollment
      courseModel.session.mockResolvedValue({
        _id: new Types.ObjectId(),
        instructorId: new Types.ObjectId(),
      });

      await controller.handlePaymobWebhook(req, res, 'valid_hmac');

      expect(mockOrder.status).toBe('COMPLETED');
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('Webhook processed successfully');
    });

    it('should be idempotent (already COMPLETED)', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(true);
      const orderId = new Types.ObjectId();
      const req = { body: { order_id: orderId.toString() } } as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      const mockOrder = {
        _id: orderId,
        status: 'COMPLETED',
        save: jest.fn(),
      };

      orderModel.session.mockResolvedValue(mockOrder);

      await controller.handlePaymobWebhook(req, res, 'valid_hmac');

      expect(mockOrder.save).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('Already processed');
    });
  });
});
