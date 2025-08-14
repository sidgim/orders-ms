import { OrderStatus } from '@prisma/client';

export interface OrderWithProducts {
  orderItems: {
    name: string;
    quantity: number;
    price: number;
    productId: number;
  }[];
  status: OrderStatus;
  id: string;
  totalAmount: number;
  totalItems: number;
  paid: boolean;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
