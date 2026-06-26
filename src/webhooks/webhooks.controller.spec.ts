import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { getModelToken } from '@nestjs/mongoose';
import { PaymobService } from '../paymob/paymob.service';
import { Order } from '../orders/schema/order.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Earning } from '../earnings/schema/earning.schema';
import { Course } from '../courses/schema/course.schema';
import { Lesson } from '../lessons/schema/lesson.schema';
import { WebhookFailureLog } from '../superadmin/schema/webhook-failure-log.schema';
import { PlatformConfig } from '../superadmin/schema/platform-config.schema';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let paymobService: any;
  let orderModel: any;
  let enrollmentModel: any;
  let earningModel: any;
  let courseModel: any;
  let platformConfigModel: any;

  // Builds a Paymob-style verified transaction payload for the given order.
  const buildPayload = (orderId: string, totalAmount: number) => ({
    obj: {
      success: true,
      is_refunded: false,
      is_voided: false,
      error_occured: false,
      amount_cents: Math.round(totalAmount * 100),
      currency: 'EGP',
      order: { merchant_order_id: orderId },
    },
  });

  beforeEach(async () => {
    paymobService = {
      verifyWebhookHmac: jest.fn(),
    };

    orderModel = function () {};
    orderModel.db = {
      startSession: jest.fn().mockResolvedValue({
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

    platformConfigModel = {
      findOne: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue({ instructorSharePercent: 80 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: PaymobService, useValue: paymobService },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getModelToken(Earning.name), useValue: earningModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Lesson.name), useValue: {} },
        { provide: getModelToken(WebhookFailureLog.name), useValue: { create: jest.fn() } },
        { provide: getModelToken(PlatformConfig.name), useValue: platformConfigModel },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe('handlePaymobWebhook', () => {
    it('should reject a missing HMAC signature', async () => {
      const req = { body: {} } as any;
      const res = {} as any;

      await expect(
        controller.handlePaymobWebhook(req, res, ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an invalid HMAC signature', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(false);
      const req = { body: { obj: {} } } as any;
      const res = {} as any;

      await expect(
        controller.handlePaymobWebhook(req, res, 'invalid_hmac'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept a valid, amount-matching webhook and transition PENDING -> COMPLETED', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(true);
      const orderId = new Types.ObjectId();
      const req = { body: buildPayload(orderId.toString(), 100) } as any;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

      const mockOrder = {
        _id: orderId,
        status: 'PENDING',
        totalAmount: 100,
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
      enrollmentModel.session.mockResolvedValue(null);
      courseModel.session.mockResolvedValue({
        _id: new Types.ObjectId(),
        instructorId: new Types.ObjectId(),
      });

      await controller.handlePaymobWebhook(req, res, 'valid_hmac');

      expect(mockOrder.status).toBe('COMPLETED');
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('Webhook processed successfully');
    });

    it('should NOT fulfill when the paid amount does not match the order total', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(true);
      const orderId = new Types.ObjectId();
      // Paid only 50 but the order total is 100.
      const req = { body: buildPayload(orderId.toString(), 50) } as any;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

      const mockOrder = {
        _id: orderId,
        status: 'PENDING',
        totalAmount: 100,
        items: [],
        save: jest.fn(),
      };
      orderModel.session.mockResolvedValue(mockOrder);

      await controller.handlePaymobWebhook(req, res, 'valid_hmac');

      expect(mockOrder.status).toBe('FAILED');
      expect(res.send).toHaveBeenCalledWith('Amount mismatch — not fulfilled');
    });

    it('should be idempotent when the order is already COMPLETED', async () => {
      paymobService.verifyWebhookHmac.mockReturnValue(true);
      const orderId = new Types.ObjectId();
      const req = { body: buildPayload(orderId.toString(), 100) } as any;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

      const mockOrder = { _id: orderId, status: 'COMPLETED', save: jest.fn() };
      orderModel.session.mockResolvedValue(mockOrder);

      await controller.handlePaymobWebhook(req, res, 'valid_hmac');

      expect(mockOrder.save).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('Already processed');
    });
  });
});
