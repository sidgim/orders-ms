import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, PrismaClient } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';
import { NATS_SERVICE } from '@app/config/services';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from '@app/interfaces/order-whit-products.interface';
import { PaymentSessionDto } from './dto/payment-session.dto';

export type Product = {
  id: number;
  name: string;
  price: number;
  available: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }
  async onModuleInit() {
    await this.$connect();
    this.logger.log('OrdersService connected to database');
  }
  async create(createOrderDto: CreateOrderDto) {
    const productIds = createOrderDto.items.map((item) => item.productId);
    const products: Product[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds),
    );

    if (products.length !== createOrderDto.items.length) {
      throw new BadRequestException(
        'Algunos productos no están disponibles o no existen.',
      );
    }

    const productsMap = new Map(products.map((p) => [p.id, p]));

    const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
      const product = productsMap.get(orderItem.productId)!;
      return acc + product.price * orderItem.quantity;
    }, 0);

    const totalItems = createOrderDto.items.reduce(
      (acc, orderItem) => acc + orderItem.quantity,
      0,
    );

    const order = await this.order.create({
      data: {
        totalAmount,
        totalItems,
        orderItems: {
          createMany: {
            data: createOrderDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: productsMap.get(item.productId)!.price,
            })),
          },
        },
      },
      include: {
        orderItems: true,
      },
    });

    return {
      ...order,
      orderItems: order.orderItems.map((orderItem) => ({
        ...orderItem,
        name: productsMap.get(orderItem.productId)!.name,
      })),
    };
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPage = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    });
    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;
    return {
      data: await this.order.findMany({
        where: {
          status: orderPaginationDto.status,
        },
        skip: (currentPage - 1) * perPage,
        take: perPage,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      meta: {
        total: totalPage,
        page: currentPage,
        lastPage: Math.ceil(totalPage / perPage),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        orderItems: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }
    const productsId = order.orderItems.map((item) => item.productId);
    const products: Product[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productsId),
    );

    return {
      ...order,
      orderItems: order.orderItems.map((o) => ({
        ...o,
        name: products.find((p) => p.id === o.productId)?.name,
      })),
    };
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    console.log('llego');
    const order = await this.order.update({
      where: { id: changeOrderStatusDto.id },
      data: { status: changeOrderStatusDto.status },
    });
    if (!order) {
      throw new NotFoundException(
        `Order with id ${changeOrderStatusDto.id} not found`,
      );
    }
    return order;
  }

  async createPaymentSession(order: OrderWithProducts) {
    const paymentSession: PaymentSessionDto = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.orderItems.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );
    return paymentSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto): Promise<Order> {
    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,

        //La relación
        orderReceipts: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
      include: {
        orderItems: true,
        orderReceipts: true,
      },
    });
    return order;
  }
}
