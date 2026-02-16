import { Body, Controller, Headers, Patch } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { Enums } from '../types/database';
import { OrdersService } from './orders.service';

interface BulkUpdateBody {
  orderIds?: string[];
  status?: Enums<'order_status'>;
}

@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Patch('bulk-update')
  async bulkUpdateOrderStatus(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: BulkUpdateBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);

    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    if (!body.orderIds || body.orderIds.length === 0) {
      throw new ApiException(
        '주문 ID 배열이 필요합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (!body.status) {
      throw new ApiException('상태값이 필요합니다', 400, 'VALIDATION_ERROR');
    }

    const updatedOrders = [];
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const orderId of body.orderIds) {
      try {
        const updated = await this.ordersService.updateOrderStatus(
          orderId,
          body.status,
        );
        updatedOrders.push(updated);
      } catch (error) {
        errors.push({
          orderId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (errors.length > 0 && updatedOrders.length === 0) {
      throw new ApiException(
        '모든 주문 업데이트에 실패했습니다',
        500,
        'BULK_UPDATE_FAILED',
      );
    }

    return successResponse({
      message: `${updatedOrders.length}개 주문의 상태가 변경되었습니다`,
      updatedCount: updatedOrders.length,
      updatedOrders,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
}
