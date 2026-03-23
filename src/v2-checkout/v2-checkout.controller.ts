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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import {
  V2AdminActionActor,
  V2AdminActionExecutorService,
} from '../v2-admin/v2-admin-action-executor.service';
import { V2CheckoutService } from './v2-checkout.service';

interface AddV2CartItemBody {
  variant_id?: string;
  quantity?: number;
  campaign_id?: string | null;
  bundle_configuration_snapshot?: Record<string, unknown> | null;
  display_price_snapshot?: Record<string, unknown> | null;
  added_via?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface UpdateV2CartItemBody {
  quantity?: number;
}

interface ValidateV2CheckoutBody {
  campaign_id?: string | null;
  coupon_code?: string | null;
  channel?: string | null;
  shipping_amount?: number | null;
  shipping_postcode?: string | null;
}

interface CreateV2OrderBody {
  idempotency_key?: string;
  campaign_id?: string | null;
  coupon_code?: string | null;
  channel?: string | null;
  shipping_amount?: number | null;
  shipping_postcode?: string | null;
  currency_code?: string | null;
  customer_snapshot?: Record<string, unknown> | null;
  billing_address_snapshot?: Record<string, unknown> | null;
  shipping_address_snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface PaymentCallbackBody {
  external_reference?: string;
  status?:
    | 'AUTHORIZED'
    | 'CAPTURED'
    | 'FAILED'
    | 'CANCELED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED';
  provider?: string | null;
  method?: string | null;
  amount?: number | null;
  refunded_total?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface CancelV2OrderBody {
  reason?: string | null;
}

interface RefundV2OrderBody {
  amount?: number | null;
  reason?: string | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ListV2OrdersQuery {
  page?: string;
  limit?: string;
  order_status?: string;
}

@Controller('v2/checkout')
export class V2CheckoutController {
  constructor(
    private readonly v2CheckoutService: V2CheckoutService,
    private readonly authSessionService: AuthSessionService,
    private readonly v2AdminActionExecutorService: V2AdminActionExecutorService,
  ) {}

  @Get('cart')
  async getCart(@Headers('authorization') authorization: string | undefined) {
    const user = await this.authSessionService.requireUser(authorization);
    const cart = await this.v2CheckoutService.getCartSummary(user.id);
    return successResponse(cart);
  }

  @Post('cart/items')
  async addCartItem(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AddV2CartItemBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const cart = await this.v2CheckoutService.addCartItem(user.id, body);
    return successResponse(cart, 'v2 cart item이 추가되었습니다');
  }

  @Patch('cart/items/:itemId')
  async updateCartItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
    @Body() body: UpdateV2CartItemBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const cart = await this.v2CheckoutService.updateCartItemQuantity(
      user.id,
      itemId,
      body.quantity,
    );
    return successResponse(cart, 'v2 cart item 수량이 변경되었습니다');
  }

  @Delete('cart/items/:itemId')
  async removeCartItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const cart = await this.v2CheckoutService.removeCartItem(user.id, itemId);
    return successResponse(cart, 'v2 cart item이 삭제되었습니다');
  }

  @Post('validate')
  async validateCheckout(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ValidateV2CheckoutBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const result = await this.v2CheckoutService.validateCheckout(user.id, body);
    return successResponse(result);
  }

  @Post('orders')
  async createOrder(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateV2OrderBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const result = await this.v2CheckoutService.createOrder(
      user.id,
      body,
      user.email,
    );
    return successResponse(
      result,
      result.idempotent_replayed
        ? '중복 요청으로 기존 주문을 반환했습니다'
      : 'v2 주문이 생성되었습니다',
    );
  }

  @Get('me/digital-entitlements')
  async listDigitalEntitlements(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);
    const result = await this.v2CheckoutService.listDigitalEntitlements(user.id, {
      includeAllForAdmin: isAdmin,
    });
    return successResponse(result);
  }

  @Get('me/digital-entitlements/:entitlementId/download')
  async downloadDigitalEntitlement(
    @Headers('authorization') authorization: string | undefined,
    @Param('entitlementId') entitlementId: string,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() response: Response,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;
    const result = await this.v2CheckoutService.createDigitalEntitlementDownloadRedirect(
      user.id,
      entitlementId,
      {
        includeAllForAdmin: isAdmin,
        ipAddress,
        userAgent: userAgent || null,
      },
    );

    return response.redirect(result.download_url);
  }

  @Get('orders')
  async listOrders(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ListV2OrdersQuery,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = this.authSessionService.isAdmin(user.email);
    const result = await this.v2CheckoutService.listOrders(user.id, {
      page: query.page,
      limit: query.limit,
      orderStatus: query.order_status,
      includeAllForAdmin: isAdmin,
    });
    return successResponse(result);
  }

  @Get('orders/:orderId')
  async getOrderById(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const order = await this.v2CheckoutService.getOrderById(orderId, user.id);
    return successResponse(order);
  }

  @Post('orders/:orderId/cancel')
  async cancelOrder(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
    @Body() body: CancelV2OrderBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const result = await this.v2CheckoutService.cancelOrder(
      user.id,
      orderId,
      body,
    );
    return successResponse(result, 'v2 주문이 취소되었습니다');
  }

  @Post('orders/:orderId/payment-callback')
  async applyPaymentCallback(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
    @Body() body: PaymentCallbackBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CheckoutService.applyPaymentCallback(
      orderId,
      body,
    );
    return successResponse(result, 'v2 결제 콜백이 반영되었습니다');
  }

  @Post('orders/:orderId/refund')
  async refundOrder(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
    @Body() body: RefundV2OrderBody,
  ) {
    const actor = await this.requireAdmin(authorization);
    const execution = await this.v2AdminActionExecutorService.execute({
      actionKey: 'ORDER_REFUND_EXECUTE',
      domain: 'ORDER',
      actor,
      requiredPermissionCode: 'ORDER_REFUND_APPROVE',
      approval: {
        required: true,
        assigneeRoleCode: 'FINANCE_MANAGER',
        reason: body.reason || null,
      },
      resourceType: 'ORDER',
      resourceId: orderId,
      inputPayload: {
        order_id: orderId,
        ...body,
      },
      transition: () => ({
        transitionKey: 'ORDER_REFUND',
      }),
      execute: () => this.v2CheckoutService.refundOrder(orderId, body),
    });
    return successResponse(execution.result, 'v2 환불이 반영되었습니다');
  }

  @Get('orders/:orderId/debug')
  async getOrderDebug(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CheckoutService.getOrderDebugById(orderId);
    return successResponse(result);
  }

  private async requireAdmin(
    authorization: string | undefined,
  ): Promise<V2AdminActionActor> {
    if (this.authSessionService.isLocalAdminBypassEnabled()) {
      return {
        id: null,
        email: 'local-admin-bypass@local.dev',
        isLocalBypass: true,
      };
    }

    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }

    return {
      id: user.id,
      email: user.email || null,
      isLocalBypass: false,
    };
  }
}
