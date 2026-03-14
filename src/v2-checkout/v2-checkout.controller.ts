import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
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
}

interface CreateV2OrderBody {
  idempotency_key?: string;
  campaign_id?: string | null;
  coupon_code?: string | null;
  channel?: string | null;
  shipping_amount?: number | null;
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

@Controller('v2/checkout')
export class V2CheckoutController {
  constructor(
    private readonly v2CheckoutService: V2CheckoutService,
    private readonly authSessionService: AuthSessionService,
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

  @Get('orders/:orderId')
  async getOrderById(
    @Headers('authorization') authorization: string | undefined,
    @Param('orderId') orderId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const order = await this.v2CheckoutService.getOrderById(orderId, user.id);
    return successResponse(order);
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
