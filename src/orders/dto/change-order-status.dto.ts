import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatusList } from '../enum/order.enum';

export class ChangeOrderStatusDto {
  @IsEnum(OrderStatusList, {
    message: `Order status must be one of the following: ${Object.values(OrderStatusList).join(', ')}`,
  })
  status: OrderStatus;

  @IsUUID(4)
  id: string;
}
