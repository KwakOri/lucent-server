import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { V2CatalogService } from '../v2-catalog/v2-catalog.service';

type V2OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'COMPLETED';
type V2PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';
type V2FulfillmentStatus = 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELED';
type V2OrderLineType = 'STANDARD' | 'BUNDLE_PARENT' | 'BUNDLE_COMPONENT';
type V2OrderLineStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'FULFILLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';
type V2AdjustmentScope = 'ORDER' | 'SHIPPING';
type V2AdjustmentSource =
  | 'PRICE_LIST'
  | 'PROMOTION'
  | 'COUPON'
  | 'BUNDLE_ALLOC'
  | 'MANUAL'
  | 'ETC';

interface AddV2CartItemInput {
  variant_id?: string;
  quantity?: number;
  campaign_id?: string | null;
  bundle_configuration_snapshot?: Record<string, unknown> | null;
  display_price_snapshot?: Record<string, unknown> | null;
  added_via?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ValidateV2CheckoutInput {
  campaign_id?: string | null;
  coupon_code?: string | null;
  channel?: string | null;
  shipping_amount?: number | null;
}

interface CreateV2OrderInput extends ValidateV2CheckoutInput {
  idempotency_key?: string;
  currency_code?: string | null;
  customer_snapshot?: Record<string, unknown> | null;
  billing_address_snapshot?: Record<string, unknown> | null;
  shipping_address_snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface PaymentCallbackInput {
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

@Injectable()
export class V2CheckoutService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  constructor(private readonly v2CatalogService: V2CatalogService) {}

  async getCartSummary(profileId: string): Promise<any> {
    const cart = await this.getOrCreateActiveCart(profileId);
    const items = await this.getCartItems(cart.id);
    return this.buildCartSummary(cart, items);
  }

  async addCartItem(
    profileId: string,
    input: AddV2CartItemInput,
  ): Promise<any> {
    const variantId = this.requireText(
      input.variant_id,
      'variant_id는 필수입니다',
      'VALIDATION_ERROR',
      400,
    );
    const quantity = this.normalizePositiveInteger(
      input.quantity ?? 1,
      'quantity',
    );
    const campaignId = this.normalizeOptionalUuid(input.campaign_id);
    const metadata = this.normalizeOptionalJsonObject(input.metadata);
    const bundleConfiguration = this.normalizeOptionalJsonObject(
      input.bundle_configuration_snapshot,
    );
    const displayPriceSnapshot = this.normalizeOptionalJsonObject(
      input.display_price_snapshot,
    );
    const addedVia =
      this.normalizeOptionalText(input.added_via) || 'STOREFRONT';

    const cart = await this.getOrCreateActiveCart(profileId);
    const variant = await this.getVariantForCart(variantId);

    let existingQuery = this.supabase
      .from('v2_cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('variant_id', variant.id)
      .is('deleted_at', null);
    existingQuery = campaignId
      ? existingQuery.eq('campaign_id', campaignId)
      : existingQuery.is('campaign_id', null);

    const { data: existingItem, error: existingError } =
      await existingQuery.maybeSingle();
    if (existingError) {
      throw new ApiException(
        'v2 cart item 조회 실패',
        500,
        'V2_CART_ITEM_FETCH_FAILED',
      );
    }

    if (existingItem) {
      const nextQuantity = (existingItem.quantity as number) + quantity;
      const { error: updateError } = await this.supabase
        .from('v2_cart_items')
        .update({
          quantity: nextQuantity,
          added_via: addedVia,
          metadata: metadata || existingItem.metadata || {},
          bundle_configuration_snapshot:
            bundleConfiguration ?? existingItem.bundle_configuration_snapshot,
          display_price_snapshot:
            displayPriceSnapshot ?? existingItem.display_price_snapshot,
        })
        .eq('id', existingItem.id)
        .eq('cart_id', cart.id);

      if (updateError) {
        throw new ApiException(
          'v2 cart item 수량 업데이트 실패',
          500,
          'V2_CART_ITEM_UPDATE_FAILED',
        );
      }
    } else {
      const { error: insertError } = await this.supabase
        .from('v2_cart_items')
        .insert({
          cart_id: cart.id,
          product_id: variant.product_id,
          variant_id: variant.id,
          quantity,
          campaign_id: campaignId,
          product_kind_snapshot: variant.product?.product_kind || 'STANDARD',
          bundle_configuration_snapshot: bundleConfiguration,
          display_price_snapshot: displayPriceSnapshot,
          added_via: addedVia,
          metadata: metadata || {},
        });

      if (insertError) {
        throw new ApiException(
          'v2 cart item 생성 실패',
          500,
          'V2_CART_ITEM_CREATE_FAILED',
        );
      }
    }

    await this.touchCart(cart.id);
    return this.getCartSummary(profileId);
  }

  async updateCartItemQuantity(
    profileId: string,
    cartItemId: string,
    quantity?: number,
  ): Promise<any> {
    const safeQuantity = this.normalizePositiveInteger(quantity, 'quantity');
    const cart = await this.getOrCreateActiveCart(profileId);

    const { data: targetItem, error: targetError } = await this.supabase
      .from('v2_cart_items')
      .select('id')
      .eq('id', cartItemId)
      .eq('cart_id', cart.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (targetError) {
      throw new ApiException(
        'v2 cart item 조회 실패',
        500,
        'V2_CART_ITEM_FETCH_FAILED',
      );
    }
    if (!targetItem) {
      throw new ApiException(
        'v2 cart item을 찾을 수 없습니다',
        404,
        'V2_CART_ITEM_NOT_FOUND',
      );
    }

    const { error: updateError } = await this.supabase
      .from('v2_cart_items')
      .update({ quantity: safeQuantity })
      .eq('id', cartItemId)
      .eq('cart_id', cart.id);

    if (updateError) {
      throw new ApiException(
        'v2 cart item 수량 변경 실패',
        500,
        'V2_CART_ITEM_UPDATE_FAILED',
      );
    }

    await this.touchCart(cart.id);
    return this.getCartSummary(profileId);
  }

  async removeCartItem(profileId: string, cartItemId: string): Promise<any> {
    const cart = await this.getOrCreateActiveCart(profileId);
    const now = new Date().toISOString();

    const { data: targetItem, error: targetError } = await this.supabase
      .from('v2_cart_items')
      .select('id')
      .eq('id', cartItemId)
      .eq('cart_id', cart.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (targetError) {
      throw new ApiException(
        'v2 cart item 조회 실패',
        500,
        'V2_CART_ITEM_FETCH_FAILED',
      );
    }
    if (!targetItem) {
      throw new ApiException(
        'v2 cart item을 찾을 수 없습니다',
        404,
        'V2_CART_ITEM_NOT_FOUND',
      );
    }

    const { error: deleteError } = await this.supabase
      .from('v2_cart_items')
      .update({ deleted_at: now })
      .eq('id', cartItemId)
      .eq('cart_id', cart.id);

    if (deleteError) {
      throw new ApiException(
        'v2 cart item 삭제 실패',
        500,
        'V2_CART_ITEM_DELETE_FAILED',
      );
    }

    await this.touchCart(cart.id);
    return this.getCartSummary(profileId);
  }

  async validateCheckout(
    profileId: string,
    input: ValidateV2CheckoutInput,
  ): Promise<any> {
    const cart = await this.getOrCreateActiveCart(profileId);
    const cartItems = await this.getCartItems(cart.id);
    if (cartItems.length === 0) {
      throw new ApiException(
        'checkout할 cart item이 없습니다',
        400,
        'V2_CART_EMPTY',
      );
    }

    const checkoutPayload = this.resolveCheckoutPayload(
      profileId,
      input,
      cartItems,
    );
    const quote = await this.v2CatalogService.buildPriceQuote({
      lines: checkoutPayload.lines,
      campaign_id: checkoutPayload.campaignId || undefined,
      coupon_code: checkoutPayload.couponCode || undefined,
      channel: checkoutPayload.channel || undefined,
      user_id: profileId,
      shipping_amount: checkoutPayload.shippingAmount,
    });

    await this.touchCart(cart.id);

    return {
      cart: this.buildCartSummary(cart, cartItems),
      quote,
    };
  }

  async createOrder(
    profileId: string,
    input: CreateV2OrderInput,
    userEmail?: string | null,
  ): Promise<any> {
    const idempotencyKey = this.requireText(
      input.idempotency_key,
      'idempotency_key는 필수입니다',
      'VALIDATION_ERROR',
      400,
    );

    const { data: existingOrder, error: existingOrderError } =
      await this.supabase
        .from('v2_orders')
        .select('id')
        .eq('profile_id', profileId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

    if (existingOrderError) {
      throw new ApiException(
        '기존 주문 멱등 조회 실패',
        500,
        'V2_ORDER_IDEMPOTENCY_CHECK_FAILED',
      );
    }

    if (existingOrder) {
      const order = await this.getOrderById(
        existingOrder.id as string,
        profileId,
      );
      return {
        idempotent_replayed: true,
        order,
      };
    }

    const cart = await this.getOrCreateActiveCart(profileId);
    const cartItems = await this.getCartItems(cart.id);
    if (cartItems.length === 0) {
      throw new ApiException(
        '주문할 cart item이 없습니다',
        400,
        'V2_CART_EMPTY',
      );
    }

    const checkoutPayload = this.resolveCheckoutPayload(
      profileId,
      input,
      cartItems,
    );
    const quote = await this.v2CatalogService.buildPriceQuote({
      lines: checkoutPayload.lines,
      campaign_id: checkoutPayload.campaignId || undefined,
      coupon_code: checkoutPayload.couponCode || undefined,
      channel: checkoutPayload.channel || undefined,
      user_id: profileId,
      shipping_amount: checkoutPayload.shippingAmount,
    });

    const summary = (quote?.summary || {}) as Record<string, unknown>;
    const currencyCode = this.normalizeCurrencyCode(input.currency_code);
    const now = new Date().toISOString();

    const orderRow = {
      profile_id: profileId,
      guest_email_snapshot: null,
      sales_channel_id: checkoutPayload.channel || 'WEB',
      currency_code: currencyCode,
      order_status: 'PENDING' as V2OrderStatus,
      payment_status: 'PENDING' as V2PaymentStatus,
      fulfillment_status: 'UNFULFILLED' as V2FulfillmentStatus,
      source_cart_id: cart.id,
      idempotency_key: idempotencyKey,
      subtotal_amount: this.normalizeNonNegativeInteger(
        summary.subtotal ?? 0,
        'subtotal',
      ),
      item_discount_total: this.normalizeNonNegativeInteger(
        summary.item_discount_total ?? 0,
        'item_discount_total',
      ),
      order_discount_total: this.normalizeNonNegativeInteger(
        summary.order_level_discount_total ?? 0,
        'order_level_discount_total',
      ),
      shipping_amount: this.normalizeNonNegativeInteger(
        summary.shipping_amount ?? checkoutPayload.shippingAmount ?? 0,
        'shipping_amount',
      ),
      shipping_discount_total: this.normalizeNonNegativeInteger(
        summary.shipping_discount_total ?? 0,
        'shipping_discount_total',
      ),
      tax_total: 0,
      grand_total: this.normalizeNonNegativeInteger(
        summary.total_payable_amount ?? 0,
        'total_payable_amount',
      ),
      customer_snapshot:
        this.normalizeOptionalJsonObject(input.customer_snapshot) || {},
      billing_address_snapshot:
        this.normalizeOptionalJsonObject(input.billing_address_snapshot) ||
        null,
      shipping_address_snapshot:
        this.normalizeOptionalJsonObject(input.shipping_address_snapshot) ||
        null,
      pricing_snapshot: {
        quote_reference: quote?.quote_reference || null,
        evaluated_at: quote?.evaluated_at || now,
        context: quote?.context || {},
        summary: quote?.summary || {},
        coupon: quote?.coupon || null,
        applied_promotions: quote?.applied_promotions || [],
      },
      placed_at: now,
      metadata: {
        ...(this.normalizeOptionalJsonObject(input.metadata) || {}),
        order_source: 'V2_CHECKOUT',
        user_email_snapshot: this.normalizeOptionalText(userEmail) || null,
      },
    };

    const insertedOrder = await this.insertOrderWithUniqueOrderNo(orderRow);

    try {
      const orderItems = await this.createOrderItems(
        insertedOrder.id as string,
        currencyCode,
        Array.isArray(quote?.lines) ? quote.lines : [],
        checkoutPayload.campaignId,
      );
      await this.createOrderItemAdjustments(
        orderItems,
        Array.isArray(quote?.lines) ? quote.lines : [],
      );
      await this.createOrderAdjustments(
        insertedOrder.id as string,
        quote,
        checkoutPayload.couponCode,
      );
      await this.markCartConverted(cart.id, insertedOrder.id as string);
    } catch (error) {
      await this.supabase.from('v2_orders').delete().eq('id', insertedOrder.id);
      throw error;
    }

    const order = await this.getOrderById(
      insertedOrder.id as string,
      profileId,
    );
    return {
      idempotent_replayed: false,
      quote_reference: quote?.quote_reference || null,
      order,
    };
  }

  async getOrderById(orderId: string, profileId: string): Promise<any> {
    const order = await this.fetchOrderAggregate(orderId);
    if (order.profile_id !== profileId) {
      throw new ApiException(
        '주문을 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }
    return order;
  }

  async applyPaymentCallback(
    orderId: string,
    input: PaymentCallbackInput,
  ): Promise<any> {
    const callbackStatus = this.normalizePaymentCallbackStatus(input.status);
    const externalReference = this.requireText(
      input.external_reference,
      'external_reference는 필수입니다',
      'VALIDATION_ERROR',
      400,
    );

    const { data: order, error: orderError } = await this.supabase
      .from('v2_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      throw new ApiException(
        'v2 order 조회 실패',
        500,
        'V2_ORDER_FETCH_FAILED',
      );
    }
    if (!order) {
      throw new ApiException(
        'v2 order를 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }

    const now = new Date().toISOString();
    const amount = this.normalizeNonNegativeInteger(
      input.amount ?? order.grand_total,
      'amount',
    );
    const refundedTotal = this.normalizeNonNegativeInteger(
      input.refunded_total ?? 0,
      'refunded_total',
    );

    const { data: existingPayment, error: existingPaymentError } =
      await this.supabase
        .from('v2_payments')
        .select('*')
        .eq('order_id', orderId)
        .eq('external_reference', externalReference)
        .maybeSingle();

    if (existingPaymentError) {
      throw new ApiException(
        'v2 payment 조회 실패',
        500,
        'V2_PAYMENT_FETCH_FAILED',
      );
    }

    const paymentPayload = {
      order_id: orderId,
      provider: this.normalizeOptionalText(input.provider) || 'MANUAL',
      method: this.normalizeOptionalText(input.method) || null,
      status: callbackStatus,
      amount,
      currency_code: (order.currency_code as string) || 'KRW',
      external_reference: externalReference,
      authorized_at:
        callbackStatus === 'AUTHORIZED' || callbackStatus === 'CAPTURED'
          ? existingPayment?.authorized_at || now
          : existingPayment?.authorized_at || null,
      captured_at:
        callbackStatus === 'CAPTURED'
          ? now
          : existingPayment?.captured_at || null,
      failed_at:
        callbackStatus === 'FAILED' ? now : existingPayment?.failed_at || null,
      refunded_total: refundedTotal,
      metadata: {
        ...(existingPayment?.metadata || {}),
        ...(this.normalizeOptionalJsonObject(input.metadata) || {}),
        callback_at: now,
      },
    };

    if (existingPayment) {
      const { error: updatePaymentError } = await this.supabase
        .from('v2_payments')
        .update(paymentPayload)
        .eq('id', existingPayment.id);

      if (updatePaymentError) {
        throw new ApiException(
          'v2 payment 업데이트 실패',
          500,
          'V2_PAYMENT_UPDATE_FAILED',
        );
      }
    } else {
      const { error: insertPaymentError } = await this.supabase
        .from('v2_payments')
        .insert(paymentPayload);

      if (insertPaymentError) {
        throw new ApiException(
          'v2 payment 생성 실패',
          500,
          'V2_PAYMENT_CREATE_FAILED',
        );
      }
    }

    const nextOrderStatus = this.resolveOrderStatusFromPaymentStatus(
      callbackStatus,
      order.order_status as V2OrderStatus,
    );
    const orderUpdate: Record<string, unknown> = {
      payment_status: callbackStatus,
      order_status: nextOrderStatus,
      metadata: {
        ...(order.metadata || {}),
        last_payment_callback: {
          status: callbackStatus,
          external_reference: externalReference,
          applied_at: now,
        },
      },
    };

    if (
      (callbackStatus === 'AUTHORIZED' || callbackStatus === 'CAPTURED') &&
      !order.confirmed_at
    ) {
      orderUpdate.confirmed_at = now;
    }
    if (
      (callbackStatus === 'CANCELED' || callbackStatus === 'REFUNDED') &&
      !order.canceled_at
    ) {
      orderUpdate.canceled_at = now;
    }
    if (callbackStatus === 'CANCELED' || callbackStatus === 'REFUNDED') {
      orderUpdate.fulfillment_status = 'CANCELED' as V2FulfillmentStatus;
    }

    const { error: orderUpdateError } = await this.supabase
      .from('v2_orders')
      .update(orderUpdate)
      .eq('id', orderId);

    if (orderUpdateError) {
      throw new ApiException(
        'v2 order payment 상태 업데이트 실패',
        500,
        'V2_ORDER_PAYMENT_STATUS_UPDATE_FAILED',
      );
    }

    return this.fetchOrderAggregate(orderId);
  }

  private async getOrCreateActiveCart(profileId: string): Promise<any> {
    const { data: existingCart, error: existingCartError } = await this.supabase
      .from('v2_carts')
      .select('*')
      .eq('profile_id', profileId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCartError) {
      throw new ApiException('v2 cart 조회 실패', 500, 'V2_CART_FETCH_FAILED');
    }
    if (existingCart) {
      return existingCart;
    }

    const { data: insertedCart, error: insertError } = await this.supabase
      .from('v2_carts')
      .insert({
        profile_id: profileId,
        status: 'ACTIVE',
        sales_channel_id: 'WEB',
        currency_code: 'KRW',
      })
      .select('*')
      .maybeSingle();

    if (insertError || !insertedCart) {
      if (insertError && (insertError as { code?: string }).code === '23505') {
        const { data: racedCart } = await this.supabase
          .from('v2_carts')
          .select('*')
          .eq('profile_id', profileId)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (racedCart) {
          return racedCart;
        }
      }

      throw new ApiException('v2 cart 생성 실패', 500, 'V2_CART_CREATE_FAILED');
    }

    return insertedCart;
  }

  private async getCartItems(cartId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v2_cart_items')
      .select(
        `
        *,
        variant:v2_product_variants (
          id,
          product_id,
          sku,
          title,
          fulfillment_type,
          requires_shipping,
          status,
          product:v2_products (
            id,
            title,
            product_kind,
            project_id,
            status,
            project:v2_projects (
              id,
              name
            )
          )
        ),
        campaign:v2_campaigns (
          id,
          name,
          status
        )
      `,
      )
      .eq('cart_id', cartId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'v2 cart item 조회 실패',
        500,
        'V2_CART_ITEMS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  private async touchCart(cartId: string): Promise<void> {
    const { error } = await this.supabase
      .from('v2_carts')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', cartId);

    if (error) {
      throw new ApiException('v2 cart touch 실패', 500, 'V2_CART_TOUCH_FAILED');
    }
  }

  private async getVariantForCart(variantId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .select(
        `
        *,
        product:v2_products (
          id,
          title,
          product_kind,
          status
        )
      `,
      )
      .eq('id', variantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 variant 조회 실패',
        500,
        'V2_VARIANT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 variant를 찾을 수 없습니다',
        404,
        'V2_VARIANT_NOT_FOUND',
      );
    }
    if (data.status !== 'ACTIVE') {
      throw new ApiException(
        'ACTIVE 상태 variant만 cart에 담을 수 있습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (!data.product || data.product.status !== 'ACTIVE') {
      throw new ApiException(
        'ACTIVE 상태 product의 variant만 cart에 담을 수 있습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return data;
  }

  private buildCartSummary(cart: any, items: any[]): any {
    const quantityTotal = items.reduce(
      (sum, item) => sum + (item.quantity as number),
      0,
    );

    return {
      ...cart,
      items,
      item_count: items.length,
      quantity_total: quantityTotal,
    };
  }

  private resolveCheckoutPayload(
    profileId: string,
    input: ValidateV2CheckoutInput,
    cartItems: any[],
  ): {
    lines: Array<{ variant_id: string; quantity: number }>;
    campaignId: string | null;
    couponCode: string | null;
    channel: string | null;
    shippingAmount: number;
  } {
    const lines = cartItems.map((item, index) => {
      const variantId = this.normalizeOptionalText(item.variant_id);
      if (!variantId) {
        throw new ApiException(
          `cart item(${index}) variant_id가 비어있습니다`,
          400,
          'VALIDATION_ERROR',
        );
      }

      return {
        variant_id: variantId,
        quantity: this.normalizePositiveInteger(
          item.quantity,
          `cart item(${index}).quantity`,
        ),
      };
    });

    const requestedCampaignId = this.normalizeOptionalUuid(input.campaign_id);
    const campaignCandidates = Array.from(
      new Set(
        cartItems
          .map((item) => this.normalizeOptionalUuid(item.campaign_id))
          .filter((campaignId): campaignId is string => Boolean(campaignId)),
      ),
    );

    let campaignId: string | null = requestedCampaignId;
    if (!campaignId && campaignCandidates.length === 1) {
      campaignId = campaignCandidates[0];
    }

    return {
      lines,
      campaignId,
      couponCode: this.normalizeOptionalText(input.coupon_code),
      channel: this.normalizeOptionalText(input.channel),
      shippingAmount: this.normalizeNonNegativeInteger(
        input.shipping_amount ?? 0,
        'shipping_amount',
      ),
    };
  }

  private async insertOrderWithUniqueOrderNo(
    orderRow: Record<string, unknown>,
  ): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const orderNo = this.generateOrderNo();
      const { data, error } = await this.supabase
        .from('v2_orders')
        .insert({
          ...orderRow,
          order_no: orderNo,
        })
        .select('*')
        .maybeSingle();

      if (!error && data) {
        return data;
      }
      if (error && (error as { code?: string }).code === '23505') {
        continue;
      }
      throw new ApiException(
        'v2 order 생성 실패',
        500,
        'V2_ORDER_CREATE_FAILED',
      );
    }

    throw new ApiException(
      'v2 order 번호 생성 충돌로 주문 생성 실패',
      500,
      'V2_ORDER_NUMBER_COLLISION',
    );
  }

  private async createOrderItems(
    orderId: string,
    currencyCode: string,
    quoteLines: any[],
    fallbackCampaignId: string | null,
  ): Promise<any[]> {
    const orderItems: any[] = [];

    for (let index = 0; index < quoteLines.length; index += 1) {
      const line = quoteLines[index];
      const pricing = (line?.pricing || {}) as Record<string, unknown>;
      const quantity = this.normalizePositiveInteger(
        line?.quantity ?? 1,
        `quote.lines[${index}].quantity`,
      );
      const lineSubtotal = this.normalizeNonNegativeInteger(
        pricing.line_subtotal ?? 0,
        `quote.lines[${index}].pricing.line_subtotal`,
      );
      const finalLineTotal = this.normalizeNonNegativeInteger(
        pricing.line_total_after_item_discounts ?? lineSubtotal,
        `quote.lines[${index}].pricing.line_total_after_item_discounts`,
      );
      const discountTotal = Math.max(lineSubtotal - finalLineTotal, 0);
      const listUnitPrice = this.normalizeNonNegativeInteger(
        pricing.base_unit_amount ?? pricing.unit_amount ?? 0,
        `quote.lines[${index}].pricing.base_unit_amount`,
      );
      const saleUnitPrice = this.normalizeNonNegativeInteger(
        pricing.unit_amount ?? listUnitPrice,
        `quote.lines[${index}].pricing.unit_amount`,
      );
      const finalUnitPrice =
        quantity > 0 ? Math.floor(finalLineTotal / quantity) : 0;
      const lineType = this.normalizeLineType(line?.line_type);
      const lineStatus = 'PENDING' as V2OrderLineStatus;
      const sourceCampaignId = this.normalizeOptionalUuid(line?.campaign_id);
      const campaignIdSnapshot = sourceCampaignId || fallbackCampaignId || null;
      const fulfillmentType = this.normalizeOptionalText(
        line?.fulfillment_type,
      );

      const row = {
        order_id: orderId,
        parent_order_item_id: null,
        line_type: lineType,
        product_id: this.normalizeOptionalUuid(line?.product_id),
        variant_id: this.normalizeOptionalUuid(line?.variant_id),
        bundle_definition_id: this.normalizeOptionalUuid(
          line?.bundle_definition_id,
        ),
        quantity,
        line_status: lineStatus,
        currency_code: currencyCode,
        list_unit_price: listUnitPrice,
        sale_unit_price: saleUnitPrice,
        final_unit_price: finalUnitPrice,
        line_subtotal: lineSubtotal,
        discount_total: discountTotal,
        tax_total: 0,
        final_line_total: finalLineTotal,
        sku_snapshot: this.normalizeOptionalText(line?.sku),
        product_name_snapshot:
          this.normalizeOptionalText(line?.product_name_snapshot) || null,
        variant_name_snapshot:
          this.normalizeOptionalText(line?.variant_name_snapshot) ||
          this.normalizeOptionalText(line?.title) ||
          null,
        project_id_snapshot: this.normalizeOptionalUuid(line?.project_id),
        project_name_snapshot:
          this.normalizeOptionalText(line?.project_name_snapshot) || null,
        fulfillment_type_snapshot:
          fulfillmentType === 'DIGITAL' || fulfillmentType === 'PHYSICAL'
            ? fulfillmentType
            : null,
        requires_shipping_snapshot:
          typeof line?.requires_shipping === 'boolean'
            ? line.requires_shipping
            : null,
        campaign_id_snapshot: campaignIdSnapshot,
        campaign_name_snapshot:
          this.normalizeOptionalText(line?.campaign_name) || null,
        display_snapshot: {
          title: this.normalizeOptionalText(line?.title),
          pricing,
        },
        metadata: this.normalizeOptionalJsonObject(line?.metadata) || {},
      };

      const { data: createdOrderItem, error: createOrderItemError } =
        await this.supabase
          .from('v2_order_items')
          .insert(row)
          .select('*')
          .maybeSingle();

      if (createOrderItemError || !createdOrderItem) {
        throw new ApiException(
          'v2 order item 생성 실패',
          500,
          'V2_ORDER_ITEMS_CREATE_FAILED',
        );
      }

      orderItems.push(createdOrderItem);
    }

    return orderItems;
  }

  private async createOrderItemAdjustments(
    orderItems: any[],
    quoteLines: any[],
  ): Promise<void> {
    for (let index = 0; index < orderItems.length; index += 1) {
      const orderItem = orderItems[index];
      const quoteLine = quoteLines[index];
      const lineAdjustments = Array.isArray(quoteLine?.adjustments)
        ? quoteLine.adjustments
        : [];

      if (lineAdjustments.length === 0) {
        continue;
      }

      const payload = lineAdjustments
        .map((adjustment: any, adjustmentIndex: number) => {
          const sourceType = this.mapAdjustmentSourceType(
            adjustment?.source_type,
          );
          const amount = this.normalizeInteger(
            adjustment?.amount ?? 0,
            'adjustment.amount',
          );
          if (amount === 0) {
            return null;
          }
          return {
            order_item_id: orderItem.id,
            source_type: sourceType,
            source_id: this.normalizeOptionalUuid(adjustment?.source_id),
            label_snapshot:
              this.normalizeOptionalText(adjustment?.label_snapshot) ||
              this.normalizeOptionalText(adjustment?.label) ||
              this.normalizeOptionalText(adjustment?.phase) ||
              sourceType,
            amount,
            sequence_no: adjustmentIndex + 1,
            calculation_snapshot:
              this.normalizeOptionalJsonObject(adjustment) || {},
          };
        })
        .filter((row): row is Record<string, unknown> => Boolean(row));

      if (payload.length === 0) {
        continue;
      }

      const { error } = await this.supabase
        .from('v2_order_item_adjustments')
        .insert(payload);

      if (error) {
        throw new ApiException(
          'v2 order item adjustment 생성 실패',
          500,
          'V2_ORDER_ITEM_ADJUSTMENTS_CREATE_FAILED',
        );
      }
    }
  }

  private async createOrderAdjustments(
    orderId: string,
    quote: any,
    couponCode: string | null,
  ): Promise<void> {
    const appliedPromotions = Array.isArray(quote?.applied_promotions)
      ? quote.applied_promotions
      : [];

    const payload = appliedPromotions
      .map((promotion: any, index: number) => {
        const promotionType =
          this.normalizeOptionalText(promotion?.promotion_type) || '';
        const isShipping = promotionType.startsWith('SHIPPING');
        const isOrder = promotionType.startsWith('ORDER');
        if (!isShipping && !isOrder) {
          return null;
        }

        const discountAmount = this.normalizeNonNegativeInteger(
          promotion?.applied_discount_amount ?? 0,
          'applied_discount_amount',
        );
        if (discountAmount <= 0) {
          return null;
        }

        const sourceType: V2AdjustmentSource =
          this.normalizeOptionalText(promotion?.phase) === 'coupon'
            ? 'COUPON'
            : 'PROMOTION';

        return {
          order_id: orderId,
          target_scope: (isShipping
            ? 'SHIPPING'
            : 'ORDER') as V2AdjustmentScope,
          source_type: sourceType,
          source_id: this.normalizeOptionalUuid(promotion?.promotion_id),
          code_snapshot: sourceType === 'COUPON' ? couponCode : null,
          label_snapshot:
            this.normalizeOptionalText(promotion?.name) ||
            this.normalizeOptionalText(promotion?.promotion_type) ||
            'ORDER_ADJUSTMENT',
          amount: -discountAmount,
          sequence_no: index + 1,
          calculation_snapshot:
            this.normalizeOptionalJsonObject(promotion) || {},
        };
      })
      .filter((row): row is Record<string, unknown> => Boolean(row));

    if (payload.length === 0) {
      return;
    }

    const { error } = await this.supabase
      .from('v2_order_adjustments')
      .insert(payload);
    if (error) {
      throw new ApiException(
        'v2 order adjustment 생성 실패',
        500,
        'V2_ORDER_ADJUSTMENTS_CREATE_FAILED',
      );
    }
  }

  private async markCartConverted(
    cartId: string,
    orderId: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from('v2_carts')
      .update({
        status: 'CONVERTED',
        converted_order_id: orderId,
        last_activity_at: now,
      })
      .eq('id', cartId);

    if (error) {
      throw new ApiException(
        'v2 cart 전환 상태 반영 실패',
        500,
        'V2_CART_CONVERT_FAILED',
      );
    }
  }

  private async fetchOrderAggregate(orderId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select(
        `
        *,
        items:v2_order_items (
          *,
          adjustments:v2_order_item_adjustments (*)
        ),
        adjustments:v2_order_adjustments (*),
        payments:v2_payments (*)
      `,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 order 상세 조회 실패',
        500,
        'V2_ORDER_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 order를 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }

    return data;
  }

  private resolveOrderStatusFromPaymentStatus(
    paymentStatus: V2PaymentStatus,
    currentOrderStatus: V2OrderStatus,
  ): V2OrderStatus {
    if (paymentStatus === 'AUTHORIZED' || paymentStatus === 'CAPTURED') {
      return 'CONFIRMED';
    }
    if (paymentStatus === 'CANCELED' || paymentStatus === 'REFUNDED') {
      return 'CANCELED';
    }
    if (paymentStatus === 'FAILED') {
      return currentOrderStatus === 'PENDING' ? 'PENDING' : currentOrderStatus;
    }
    return currentOrderStatus;
  }

  private mapAdjustmentSourceType(value?: string | null): V2AdjustmentSource {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return 'ETC';
    }
    if (
      normalized === 'PRICE_LIST' ||
      normalized === 'PROMOTION' ||
      normalized === 'COUPON' ||
      normalized === 'BUNDLE_ALLOC' ||
      normalized === 'MANUAL' ||
      normalized === 'ETC'
    ) {
      return normalized;
    }
    return 'ETC';
  }

  private normalizeLineType(value?: string | null): V2OrderLineType {
    const normalized = this.normalizeOptionalText(value);
    if (
      normalized === 'STANDARD' ||
      normalized === 'BUNDLE_PARENT' ||
      normalized === 'BUNDLE_COMPONENT'
    ) {
      return normalized;
    }
    return 'STANDARD';
  }

  private normalizePaymentCallbackStatus(
    value?: string | null,
  ): V2PaymentStatus {
    const normalized = this.normalizeOptionalText(value);
    if (
      normalized === 'AUTHORIZED' ||
      normalized === 'CAPTURED' ||
      normalized === 'FAILED' ||
      normalized === 'CANCELED' ||
      normalized === 'PARTIALLY_REFUNDED' ||
      normalized === 'REFUNDED'
    ) {
      return normalized;
    }
    throw new ApiException(
      'status 값이 유효하지 않습니다',
      400,
      'VALIDATION_ERROR',
    );
  }

  private normalizeCurrencyCode(value?: string | null): string {
    const normalized =
      this.normalizeOptionalText(value)?.toUpperCase() || 'KRW';
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new ApiException(
        'currency_code 형식이 올바르지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return normalized;
  }

  private requireText(
    value: unknown,
    message: string,
    errorCode = 'VALIDATION_ERROR',
    statusCode = 400,
  ): string {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new ApiException(message, statusCode, errorCode);
    }
    return normalized;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalUuid(value: unknown): string | null {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return null;
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalized,
      )
    ) {
      return null;
    }
    return normalized;
  }

  private normalizePositiveInteger(value: unknown, fieldName: string): number {
    const parsed = this.normalizeInteger(value, fieldName);
    if (parsed <= 0) {
      throw new ApiException(
        `${fieldName}는 1 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeNonNegativeInteger(
    value: unknown,
    fieldName: string,
  ): number {
    const parsed = this.normalizeInteger(value, fieldName);
    if (parsed < 0) {
      throw new ApiException(
        `${fieldName}는 0 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeInteger(value: unknown, fieldName: string): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
    throw new ApiException(
      `${fieldName}는 정수여야 합니다`,
      400,
      'VALIDATION_ERROR',
    );
  }

  private normalizeOptionalJsonObject(
    value: unknown,
  ): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'JSON snapshot 값은 object여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value as Record<string, unknown>;
  }

  private generateOrderNo(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `V2-${date}-${random}`;
  }
}
