import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { paginatedResponse, successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { Enums } from '../types/database';
import { OrdersService } from './orders.service';

interface CreateOrderBody {
  items?: Array<{
    productId: string;
    quantity: number;
  }>;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingMainAddress?: string;
  shippingDetailAddress?: string;
  shippingMemo?: string;
}

interface UpdateOrderStatusBody {
  status?: Enums<'order_status'>;
}

interface UpdateOrderItemsStatusBody {
  itemIds?: string[];
  status?: Enums<'order_item_status'>;
}

interface DownloadBody {
  orderId?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getOrders(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
    @Query('status') status?: Enums<'order_status'>,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    const page = this.parseOrDefault(rawPage, 1);
    const limit = this.parseOrDefault(rawLimit, 20);

    if (isAdmin) {
      const result = await this.ordersService.getAllOrders({
        page,
        limit,
        status,
        dateFrom,
        dateTo,
      });

      return paginatedResponse(result.orders, {
        total: result.total,
        page,
        limit,
      });
    }

    const result = await this.ordersService.getUserOrders(user.id, {
      page,
      limit,
    });
    return paginatedResponse(result.orders, {
      total: result.total,
      page,
      limit,
    });
  }

  @Post()
  async createOrder(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateOrderBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);

    const order = await this.ordersService.createOrder({
      userId: user.id,
      items: body.items || [],
      buyerName: body.buyerName,
      buyerEmail: body.buyerEmail,
      buyerPhone: body.buyerPhone,
      shippingName: body.shippingName,
      shippingPhone: body.shippingPhone,
      shippingMainAddress: body.shippingMainAddress,
      shippingDetailAddress: body.shippingDetailAddress,
      shippingMemo: body.shippingMemo,
    });

    return successResponse(order);
  }

  @Get(':id')
  async getOrderById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    const order = await this.ordersService.getOrderById(
      orderId,
      isAdmin ? undefined : user.id,
    );
    return successResponse(order);
  }

  @Patch(':id')
  async updateOrderById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
    @Body() body: UpdateOrderStatusBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    if (!body.status) {
      throw new ApiException(
        '변경할 상태를 지정해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    const order = await this.ordersService.updateOrderStatus(
      orderId,
      body.status,
    );
    return successResponse(order);
  }

  @Delete(':id')
  async cancelOrder(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const result = await this.ordersService.cancelOrder(orderId, user.id);
    return successResponse(result);
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
    @Body() body: UpdateOrderStatusBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    if (!isAdmin) {
      throw new ApiException('관리자만 접근 가능합니다', 403, 'UNAUTHORIZED');
    }

    if (!body.status) {
      throw new ApiException('상태값이 필요합니다', 400, 'VALIDATION_ERROR');
    }

    const order = await this.ordersService.updateOrderStatus(
      orderId,
      body.status,
    );
    return successResponse(order);
  }

  @Patch(':id/items/status')
  async updateOrderItemsStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') _orderId: string,
    @Body() body: UpdateOrderItemsStatusBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    if (!body.itemIds || body.itemIds.length === 0) {
      throw new ApiException(
        '변경할 아이템을 선택해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (!body.status) {
      throw new ApiException(
        '변경할 상태를 선택해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    const updatedItems = [];
    for (const itemId of body.itemIds) {
      const updated = await this.ordersService.updateItemStatus(
        itemId,
        body.status,
      );
      updatedItems.push(updated);
    }

    return successResponse({ updatedItems });
  }

  @Get(':id/items/:itemId/download')
  async downloadOrderItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const downloadInfo = await this.ordersService.generateDownloadLink(
      orderId,
      itemId,
      user.id,
    );
    return successResponse(downloadInfo);
  }

  @Post('items/:itemId/download')
  async downloadOrderItemLegacy(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
    @Body() body: DownloadBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);

    const orderId =
      body.orderId || (await this.ordersService.resolveOrderIdForItem(itemId));
    const downloadInfo = await this.ordersService.generateDownloadLink(
      orderId,
      itemId,
      user.id,
    );
    return successResponse(downloadInfo);
  }

  @Get(':id/items/:itemId/shipment')
  async getShipmentTracking(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const tracking = await this.ordersService.getShipmentTracking(
      itemId,
      user.id,
    );

    if (!tracking) {
      return successResponse(null, '배송 정보가 없습니다');
    }

    return successResponse(tracking);
  }

  private parseOrDefault(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
