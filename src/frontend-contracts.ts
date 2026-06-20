import { PurchaseType } from './common/enums/purchase-type.enum';
import { OrderStatus } from './common/enums/order-status.enum';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CartItemResponse {
  type: PurchaseType;
  courseId: string;
  courseTitle: string;
  thumbnail: string;
  instructorName: string;
  sectionId?: string;
  sectionTitle?: string;
  price: number;
}

export interface CartResponse {
  items: CartItemResponse[];
  subtotal: number;
  total: number;
}

export interface CheckoutResponse {
  clientSecret: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface OrderItemResponse {
  courseTitle: string;
  type: string;
  price: number;
}

export interface OrderDetailResponse {
  orderId: string;
  status: string;
  items: OrderItemResponse[];
  total: number;
  paidAt: Date | null;
}

export interface OrderHistoryItem {
  orderId: string;
  status: string;
  total: number;
  createdAt: Date;
  items: OrderItemResponse[];
}

export interface OrderHistoryResponse {
  orders: OrderHistoryItem[];
}

export interface AddToCartRequest {
  type: PurchaseType;
  courseId: string;
  sectionId?: string;
}
