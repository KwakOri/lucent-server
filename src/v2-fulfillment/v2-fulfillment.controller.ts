import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { V2FulfillmentService } from './v2-fulfillment.service';

interface ReserveInventoryBody {
  order_id?: string;
  order_item_id?: string;
  variant_id?: string;
  location_id?: string;
  fulfillment_group_id?: string | null;
  quantity?: number;
  reason?: string | null;
  idempotency_key?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface TransitionReservationBody {
  reason?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Controller('v2/fulfillment/admin')
export class V2FulfillmentController {
  constructor(
    private readonly v2FulfillmentService: V2FulfillmentService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Post('inventory/reservations/reserve')
  async reserveInventory(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ReserveInventoryBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.reserveInventory(body);
    return successResponse(result, '재고 예약이 생성되었습니다');
  }

  @Post('inventory/reservations/:reservationId/release')
  async releaseReservation(
    @Headers('authorization') authorization: string | undefined,
    @Param('reservationId') reservationId: string,
    @Body() body: TransitionReservationBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.releaseReservation(
      reservationId,
      body,
    );
    return successResponse(result, '재고 예약이 해제되었습니다');
  }

  @Post('inventory/reservations/:reservationId/consume')
  async consumeReservation(
    @Headers('authorization') authorization: string | undefined,
    @Param('reservationId') reservationId: string,
    @Body() body: TransitionReservationBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.consumeReservation(
      reservationId,
      body,
    );
    return successResponse(result, '재고 예약이 출고 소모로 전환되었습니다');
  }

  @Get('inventory/reservations/:reservationId')
  async getReservationById(
    @Headers('authorization') authorization: string | undefined,
    @Param('reservationId') reservationId: string,
  ) {
    await this.requireAdmin(authorization);
    const reservation =
      await this.v2FulfillmentService.getReservationById(reservationId);
    return successResponse(reservation);
  }

  private async requireAdmin(authorization: string | undefined): Promise<void> {
    if (this.authSessionService.isLocalAdminBypassEnabled()) {
      return;
    }

    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }
}
