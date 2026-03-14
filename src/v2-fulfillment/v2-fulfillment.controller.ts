import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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

interface CreateShipmentBody {
  fulfillment_id?: string;
  carrier?: string | null;
  service_level?: string | null;
  tracking_no?: string | null;
  tracking_url?: string | null;
  label_ref?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ShipmentTransitionBody {
  metadata?: Record<string, unknown> | null;
}

interface RegisterShipmentTrackingBody {
  carrier?: string | null;
  service_level?: string | null;
  tracking_no?: string;
  tracking_url?: string | null;
  label_ref?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface GrantEntitlementBody {
  order_id?: string;
  order_item_id?: string;
  digital_asset_id?: string | null;
  fulfillment_id?: string | null;
  access_type?: 'DOWNLOAD' | 'STREAM' | 'LICENSE';
  token_hash?: string | null;
  token_reference?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface ReissueEntitlementBody {
  token_hash?: string | null;
  token_reference?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface RevokeEntitlementBody {
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface LogEntitlementDownloadBody {
  metadata?: Record<string, unknown> | null;
}

interface GenerateFulfillmentPlanBody {
  order_id?: string;
  stock_location_id?: string | null;
  shipping_profile_id?: string | null;
  shipping_method_id?: string | null;
  shipping_zone_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface EvaluateShippingFeeBody {
  shipping_profile_id?: string | null;
  shipping_method_id?: string;
  shipping_zone_id?: string;
  order_amount?: number | null;
  total_weight?: number | null;
  item_count?: number | null;
  currency_code?: string | null;
  at?: string | null;
}

interface OrchestrateMixedOrderBody {
  order_id?: string;
  stock_location_id?: string | null;
  shipping_profile_id?: string | null;
  shipping_method_id?: string | null;
  shipping_zone_id?: string | null;
  reserve_inventory?: boolean;
  grant_entitlement?: boolean;
  provider_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface OpsQuery {
  limit?: string;
}

interface CutoverCheckBody {
  order_id?: string;
  reserve_inventory?: boolean;
  grant_entitlement?: boolean;
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

  @Post('plans/generate')
  async generateFulfillmentPlan(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: GenerateFulfillmentPlanBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.generateFulfillmentPlan(body);
    return successResponse(result, 'fulfillment plan이 생성/갱신되었습니다');
  }

  @Post('shipping/quote')
  async evaluateShippingFee(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: EvaluateShippingFeeBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.evaluateShippingFee(body);
    return successResponse(result);
  }

  @Post('orchestrate')
  async orchestrateMixedOrder(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: OrchestrateMixedOrderBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.orchestrateMixedOrder(body);
    return successResponse(result, 'mixed order orchestration이 완료되었습니다');
  }

  @Get('ops/queue-summary')
  async getOpsQueueSummary(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: OpsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.getOpsQueueSummary({
      limit: query.limit,
    });
    return successResponse(result);
  }

  @Get('ops/inventory-health')
  async getInventoryHealth(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: OpsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.getInventoryHealth({
      limit: query.limit,
    });
    return successResponse(result);
  }

  @Get('cutover-policy')
  async getCutoverPolicy(
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.requireAdmin(authorization);
    const policy = await this.v2FulfillmentService.getCutoverPolicy();
    return successResponse(policy);
  }

  @Post('cutover-policy/check')
  async checkCutoverPolicy(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CutoverCheckBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.checkCutoverPolicy(body);
    return successResponse(result);
  }

  @Post('shipments')
  async createShipment(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateShipmentBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.createShipment(body);
    return successResponse(
      result,
      result.idempotent_replayed
        ? '기존 shipment를 반환했습니다'
        : 'shipment가 생성되었습니다',
    );
  }

  @Post('shipments/:shipmentId/pack')
  async packShipment(
    @Headers('authorization') authorization: string | undefined,
    @Param('shipmentId') shipmentId: string,
    @Body() body: ShipmentTransitionBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.packShipment(
      shipmentId,
      body,
    );
    return successResponse(result, 'shipment가 포장 단계로 전환되었습니다');
  }

  @Post('shipments/:shipmentId/register-tracking')
  async registerShipmentTracking(
    @Headers('authorization') authorization: string | undefined,
    @Param('shipmentId') shipmentId: string,
    @Body() body: RegisterShipmentTrackingBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.registerShipmentTracking(
      shipmentId,
      body,
    );
    return successResponse(result, '송장 정보가 등록되었습니다');
  }

  @Post('shipments/:shipmentId/dispatch')
  async dispatchShipment(
    @Headers('authorization') authorization: string | undefined,
    @Param('shipmentId') shipmentId: string,
    @Body() body: ShipmentTransitionBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.dispatchShipment(
      shipmentId,
      body,
    );
    return successResponse(result, 'shipment가 출고되었습니다');
  }

  @Post('shipments/:shipmentId/deliver')
  async deliverShipment(
    @Headers('authorization') authorization: string | undefined,
    @Param('shipmentId') shipmentId: string,
    @Body() body: ShipmentTransitionBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.deliverShipment(
      shipmentId,
      body,
    );
    return successResponse(result, 'shipment가 배송 완료 처리되었습니다');
  }

  @Get('shipments/:shipmentId')
  async getShipmentById(
    @Headers('authorization') authorization: string | undefined,
    @Param('shipmentId') shipmentId: string,
  ) {
    await this.requireAdmin(authorization);
    const shipment = await this.v2FulfillmentService.getShipmentById(shipmentId);
    return successResponse(shipment);
  }

  @Post('entitlements/grant')
  async grantEntitlement(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: GrantEntitlementBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.grantEntitlement(body);
    return successResponse(
      result,
      result.idempotent_replayed
        ? '기존 entitlement를 반환했습니다'
        : 'entitlement가 발급되었습니다',
    );
  }

  @Post('entitlements/:entitlementId/reissue')
  async reissueEntitlement(
    @Headers('authorization') authorization: string | undefined,
    @Param('entitlementId') entitlementId: string,
    @Body() body: ReissueEntitlementBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.reissueEntitlement(
      entitlementId,
      body,
    );
    return successResponse(result, 'entitlement가 재발급되었습니다');
  }

  @Post('entitlements/:entitlementId/revoke')
  async revokeEntitlement(
    @Headers('authorization') authorization: string | undefined,
    @Param('entitlementId') entitlementId: string,
    @Body() body: RevokeEntitlementBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.revokeEntitlement(
      entitlementId,
      body,
    );
    return successResponse(result, 'entitlement가 회수되었습니다');
  }

  @Post('entitlements/:entitlementId/download-log')
  async logEntitlementDownload(
    @Headers('authorization') authorization: string | undefined,
    @Param('entitlementId') entitlementId: string,
    @Body() body: LogEntitlementDownloadBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2FulfillmentService.logEntitlementDownload(
      entitlementId,
      body,
    );
    return successResponse(result, 'entitlement 다운로드 이력이 기록되었습니다');
  }

  @Get('entitlements/:entitlementId')
  async getEntitlementById(
    @Headers('authorization') authorization: string | undefined,
    @Param('entitlementId') entitlementId: string,
  ) {
    await this.requireAdmin(authorization);
    const entitlement =
      await this.v2FulfillmentService.getEntitlementById(entitlementId);
    return successResponse(entitlement);
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
