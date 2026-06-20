import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Types } from 'mongoose';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: any;

  beforeEach(async () => {
    service = {
      getOrderById: jest.fn(),
      getMyOrders: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  describe('getOrderById', () => {
    it('should return the order for its actual owner', async () => {
      const studentId = new Types.ObjectId().toString();
      const orderId = new Types.ObjectId().toString();
      service.getOrderById.mockResolvedValue({ orderId, status: 'PENDING' });

      const result = await controller.getOrderById(orderId, { userId: studentId });
      expect(result.data.orderId).toBe(orderId);
      expect(service.getOrderById).toHaveBeenCalledWith(studentId, orderId);
    });

    // We mock the service to throw if ownership fails, so we test that the controller passes studentId
    it('should pass studentId to service', async () => {
      const studentId = 'student1';
      const orderId = 'order1';
      service.getOrderById.mockResolvedValue({});
      await controller.getOrderById(orderId, { userId: studentId });
      expect(service.getOrderById).toHaveBeenCalledWith(studentId, orderId);
    });
  });

  describe('getMyOrders', () => {
    it('should never return another students orders (passes studentId to service)', async () => {
      const studentId = 'student1';
      service.getMyOrders.mockResolvedValue({ orders: [] });
      await controller.getMyOrders({ userId: studentId });
      expect(service.getMyOrders).toHaveBeenCalledWith(studentId);
    });
  });
});
