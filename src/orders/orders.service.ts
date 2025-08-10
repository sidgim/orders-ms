import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { NATS_SERVICE } from '@app/config/services';
import { firstValueFrom } from 'rxjs';

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
    try {
      const productIds = createOrderDto.items.map((item) => item.productId);
      // obtengo los productos del microservicio de productos
      const products: Product[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );
      if (products.length !== createOrderDto.items.length) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Some products are not available',
        });
      }
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const product = products.find((p) => p.id === orderItem.productId);
        if (!product) {
          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message: `Product with id ${orderItem.productId} not found`,
          });
        }
        return product.price * orderItem.quantity + acc;
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
              data: createOrderDto.items.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                if (!product) {
                  throw new RpcException({
                    status: HttpStatus.BAD_REQUEST,
                    message: `Product with id ${item.productId} not found`,
                  });
                }
                return {
                  productId: item.productId,
                  quantity: item.quantity,
                  price: product.price,
                };
              }),
            },
          },
        },
        include: {
          orderItems: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        orderItems: order.orderItems.map((orderItem) => {
          const product = products.find((p) => p.id === orderItem.productId);
          // Punto de error 3: se verifica si el producto existe
          if (!product) {
            return {
              ...orderItem,
              name: 'Producto no encontrado',
            };
          }
          return {
            ...orderItem,
            name: product.name,
          };
        }),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: JSON.stringify(error),
      });
    }
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
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
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
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${changeOrderStatusDto.id} not found`,
      });
    }
    return order;
  }
}
