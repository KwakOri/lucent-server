import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { createPresignedDownloadUrlFromR2 } from '../images/r2.util';
import { CommerceNotificationsService } from '../notifications/commerce-notifications.service';
import { getSupabaseClient } from '../supabase/supabase.client';
import { V2CatalogService } from '../v2-catalog/v2-catalog.service';
import { V2FulfillmentService } from '../v2-fulfillment/v2-fulfillment.service';

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
  shipping_postcode?: string | null;
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

interface CancelV2OrderInput {
  reason?: string | null;
}

interface RefundV2OrderInput {
  amount?: number | null;
  reason?: string | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CreatedOrderItemContext {
  orderItem: any;
  adjustments: any[];
}

interface CheckoutLineContext {
  cartItemId: string | null;
  variantId: string;
  quantity: number;
  productId: string | null;
  productKind: 'STANDARD' | 'BUNDLE';
  campaignId: string | null;
  bundleConfigurationSnapshot: Record<string, unknown> | null;
}

interface CheckoutPayload {
  lines: Array<{ variant_id: string; quantity: number }>;
  lineContexts: CheckoutLineContext[];
  campaignId: string | null;
  couponCode: string | null;
  channel: string | null;
  requestedShippingAmount: number | null;
  shippingPostcode: string | null;
  shippingRequired: boolean;
}

interface BundleSelectionItem {
  component_variant_id: string;
  quantity?: number;
}

interface BundleConfigurationSnapshot {
  bundle_definition_id: string;
  selected_components: BundleSelectionItem[];
}

const BASE_SHIPPING_FEE = 3500;
const JEJU_EXTRA_FEE = 3000;
const ISLAND_EXTRA_FEE = 5000;
const DEFAULT_CHECKOUT_RESERVATION_TTL_MINUTES = 10;

const JEJU_POSTCODE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [63000, 63644],
];

const ISLAND_POSTCODE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [40200, 40240], // 울릉도
  [22386, 22388], // 인천 중구 섬
  [23004, 23010], // 강화군 섬
  [23100, 23136], // 옹진군 섬
  [32133, 32133], // 태안 가의도
  [33411, 33411], // 보령 호도
  [46768, 46771], // 부산 강서구 섬
  [52570, 52571], // 사천 섬
  [53031, 53033], // 통영 섬
  [53089, 53104], // 통영 섬
  [56347, 56349], // 부안 섬
  [57068, 57069], // 영광 섬
  [58760, 58762], // 목포 섬
  [58800, 58810], // 신안 섬
  [58816, 58818], // 신안 섬
  [58828, 58866], // 신안 섬
  [58953, 58958], // 진도 섬
  [59102, 59103], // 완도 섬
  [59106, 59106], // 완도 섬
];

@Injectable()
export class V2CheckoutService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  constructor(
    private readonly v2CatalogService: V2CatalogService,
    private readonly commerceNotificationsService: CommerceNotificationsService,
    private readonly v2FulfillmentService: V2FulfillmentService,
  ) {}

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

    const checkoutPayload = this.resolveCheckoutPayload(input, cartItems);
    const { quote } = await this.buildCheckoutQuote(profileId, checkoutPayload);

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

    const checkoutPayload = this.resolveCheckoutPayload(input, cartItems);
    const { quote, shippingAmount } = await this.buildCheckoutQuote(
      profileId,
      checkoutPayload,
    );

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
        summary.shipping_amount ?? shippingAmount ?? 0,
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
        price_candidates: quote?.price_candidates || [],
        promotion_evaluations: quote?.promotion_evaluations || [],
        coupon: quote?.coupon || null,
        applied_promotions: quote?.applied_promotions || [],
        quote_lines: quote?.lines || [],
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
      const createdOrderItemContexts = await this.createOrderItems(
        insertedOrder.id as string,
        currencyCode,
        Array.isArray(quote?.lines) ? quote.lines : [],
        checkoutPayload.lineContexts,
        checkoutPayload.campaignId,
      );
      await this.createOrderItemAdjustments(createdOrderItemContexts);
      await this.createOrderAdjustments(
        insertedOrder.id as string,
        quote,
        checkoutPayload.couponCode,
      );
      await this.reserveTrackedInventoryForOrderItems(
        insertedOrder.id as string,
        createdOrderItemContexts,
      );
      await this.markCartConverted(cart.id, insertedOrder.id as string);
    } catch (error) {
      const rollbackOrderId = insertedOrder.id as string;
      await this.releaseActiveReservationsByOrderId(
        rollbackOrderId,
        'ORDER_CREATE_ROLLBACK',
      );
      await this.deleteOrderForRollback(rollbackOrderId);
      throw this.mapOrderCreateFailure(error);
    }

    const order = await this.getOrderById(
      insertedOrder.id as string,
      profileId,
    );

    void this.commerceNotificationsService.notifyOrderPlaced(order);

    return {
      idempotent_replayed: false,
      quote_reference: quote?.quote_reference || null,
      order,
    };
  }

  async listOrders(
    profileId: string,
    input: {
      page?: string;
      limit?: string;
      orderStatus?: string;
      includeAllForAdmin?: boolean;
    } = {},
  ): Promise<{
    items: any[];
    total: number;
    limit: number;
    page: number;
    totalPages: number;
  }> {
    const parsedPage = Number.parseInt(input.page || '1', 10);
    const page =
      Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const parsedLimit = Number.parseInt(input.limit || '20', 10);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const orderStatus = this.normalizeOptionalText(input.orderStatus);

    let query = this.supabase
      .from('v2_orders')
      .select('id', { count: 'exact' })
      .order('placed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!input.includeAllForAdmin) {
      query = query.eq('profile_id', profileId);
    }

    if (orderStatus) {
      query = query.eq('order_status', orderStatus);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new ApiException(
        'v2 orders 목록 조회 실패',
        500,
        'V2_ORDERS_FETCH_FAILED',
      );
    }

    const orderIds = (data || []).map((row: any) => row.id).filter(Boolean);
    if (orderIds.length === 0) {
      const total = count || 0;
      return {
        items: [],
        total,
        limit,
        page,
        totalPages: total > 0 ? Math.ceil(total / limit) : 1,
      };
    }

    const items = await Promise.all(
      orderIds.map((orderId: string) => this.fetchOrderAggregate(orderId)),
    );

    const total = count || items.length;
    return {
      items,
      total,
      limit,
      page,
      totalPages: total > 0 ? Math.ceil(total / limit) : 1,
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

  async listDigitalEntitlements(
    profileId: string,
    input: {
      includeAllForAdmin?: boolean;
    } = {},
  ): Promise<{ items: any[]; total: number }> {
    let ordersQuery = this.supabase
      .from('v2_orders')
      .select(
        'id,order_no,placed_at,order_status,payment_status,fulfillment_status,canceled_at,completed_at',
      )
      .order('placed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (!input.includeAllForAdmin) {
      ordersQuery = ordersQuery.eq('profile_id', profileId);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      throw new ApiException(
        '디지털 entitlement 주문 조회 실패',
        500,
        'V2_DIGITAL_ENTITLEMENT_ORDERS_FETCH_FAILED',
      );
    }

    const orderRows = (orders || []) as any[];
    if (orderRows.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const orderById = new Map<string, any>();
    for (const orderRow of orderRows) {
      const orderId = this.normalizeOptionalUuid(orderRow.id);
      if (!orderId) {
        continue;
      }
      orderById.set(orderId, orderRow);
    }

    const orderIds = Array.from(orderById.keys());
    if (orderIds.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const { data: entitlements, error: entitlementsError } = await this.supabase
      .from('v2_digital_entitlements')
      .select(
        `
        *,
        order_item:v2_order_items (
          id,
          order_id,
          product_id,
          variant_id,
          line_type,
          line_status,
          quantity,
          final_line_total,
          line_subtotal,
          product_name_snapshot,
          variant_name_snapshot,
          display_snapshot
        ),
        digital_asset:v2_digital_assets (
          id,
          variant_id,
          file_name,
          file_size,
          mime_type,
          status,
          storage_path,
          version_no,
          metadata,
          deleted_at
        )
      `,
      )
      .in('order_id', orderIds)
      .order('granted_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (entitlementsError) {
      throw new ApiException(
        '디지털 entitlement 목록 조회 실패',
        500,
        'V2_DIGITAL_ENTITLEMENTS_FETCH_FAILED',
      );
    }

    const rows = (entitlements || []) as any[];
    if (rows.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const variantIds = Array.from(
      new Set(
        rows
          .map((row) =>
            this.normalizeOptionalUuid(
              row?.order_item?.variant_id as string | null | undefined,
            ),
          )
          .filter((variantId): variantId is string => Boolean(variantId)),
      ),
    );

    const variantSnapshotById = await this.fetchVariantSnapshotsByIds(variantIds);
    const productIds = Array.from(
      new Set(
        rows
          .map((row) => {
            const rowOrderItem = row?.order_item;
            const productIdFromItem = this.normalizeOptionalUuid(
              rowOrderItem?.product_id as string | null | undefined,
            );
            if (productIdFromItem) {
              return productIdFromItem;
            }

            const variantId = this.normalizeOptionalUuid(
              rowOrderItem?.variant_id as string | null | undefined,
            );
            if (!variantId) {
              return null;
            }
            const variantSnapshot = variantSnapshotById.get(variantId);
            return this.normalizeOptionalUuid(
              variantSnapshot?.product_id as string | null | undefined,
            );
          })
          .filter((productId): productId is string => Boolean(productId)),
      ),
    );
    const thumbnailByProductId =
      await this.loadPrimaryProductThumbnailByProductIds(productIds);
    const legacyDownloadUrlByV2ProductId =
      await this.loadLegacyDownloadUrlByV2ProductIds(productIds);

    const fallbackVariantIds = Array.from(
      new Set(
        rows
          .filter((row) => !this.isReadyDigitalAsset(row?.digital_asset))
          .map((row) =>
            this.normalizeOptionalUuid(
              row?.order_item?.variant_id as string | null | undefined,
            ),
          )
          .filter((variantId): variantId is string => Boolean(variantId)),
      ),
    );
    const fallbackAssetByVariantId =
      await this.loadLatestReadyDigitalAssetByVariantIds(fallbackVariantIds);

    const items = rows
      .map((row) => {
        const orderId = this.normalizeOptionalUuid(row?.order_id);
        if (!orderId) {
          return null;
        }
        const order = orderById.get(orderId);
        if (!order) {
          return null;
        }

        const orderItem =
          row?.order_item &&
          typeof row.order_item === 'object' &&
          !Array.isArray(row.order_item)
            ? row.order_item
            : null;
        const displaySnapshot =
          orderItem?.display_snapshot &&
          typeof orderItem.display_snapshot === 'object' &&
          !Array.isArray(orderItem.display_snapshot)
            ? (orderItem.display_snapshot as Record<string, unknown>)
            : {};
        const variantId = this.normalizeOptionalUuid(
          orderItem?.variant_id as string | null | undefined,
        );
        const variantSnapshot = variantId ? variantSnapshotById.get(variantId) : null;
        const productId =
          this.normalizeOptionalUuid(
            orderItem?.product_id as string | null | undefined,
          ) ||
          this.normalizeOptionalUuid(
            variantSnapshot?.product_id as string | null | undefined,
          );
        const productTitle =
          this.normalizeOptionalText(
            orderItem?.product_name_snapshot as string | null | undefined,
          ) ||
          this.normalizeOptionalText(
            displaySnapshot.product_title as string | null | undefined,
          ) ||
          this.normalizeOptionalText(
            variantSnapshot?.product?.title as string | null | undefined,
          ) ||
          '디지털 상품';
        const variantTitle =
          this.normalizeOptionalText(
            orderItem?.variant_name_snapshot as string | null | undefined,
          ) ||
          this.normalizeOptionalText(
            displaySnapshot.variant_title as string | null | undefined,
          ) ||
          this.normalizeOptionalText(
            displaySnapshot.title as string | null | undefined,
          ) ||
          this.normalizeOptionalText(
            variantSnapshot?.title as string | null | undefined,
          );
        const thumbnailUrl =
          (productId ? thumbnailByProductId.get(productId) : null) ||
          this.normalizeOptionalText(
            displaySnapshot.thumbnail_url as string | null | undefined,
          );
        const legacyDownloadUrl =
          (productId ? legacyDownloadUrlByV2ProductId.get(productId) : null) ||
          null;

        const digitalAsset = this.resolveReadyDigitalAsset({
          explicitAsset: row?.digital_asset,
          variantId,
          fallbackByVariantId: fallbackAssetByVariantId,
        });

        const availability = this.evaluateEntitlementAvailability({
          entitlement: row,
          hasReadyAsset: Boolean(
            legacyDownloadUrl || this.normalizeOptionalText(digitalAsset?.storage_path),
          ),
        });

        return {
          id: row.id,
          status: row.status,
          access_type: row.access_type,
          granted_at: row.granted_at || null,
          expires_at: row.expires_at || null,
          download_count: this.normalizeNonNegativeInteger(
            row.download_count ?? 0,
            'download_count',
          ),
          max_downloads:
            typeof row.max_downloads === 'number' &&
            Number.isInteger(row.max_downloads) &&
            row.max_downloads >= 0
              ? row.max_downloads
              : null,
          remaining_downloads: availability.remaining_downloads,
          can_download: availability.can_download,
          blocked_reason: availability.blocked_reason,
          order: {
            id: order.id,
            order_no: order.order_no,
            placed_at: order.placed_at || null,
            order_status: order.order_status,
            payment_status: order.payment_status,
            fulfillment_status: order.fulfillment_status,
          },
          order_item: {
            id: orderItem?.id || null,
            line_type: orderItem?.line_type || null,
            line_status: orderItem?.line_status || null,
            quantity: Math.max(
              1,
              this.normalizeNonNegativeInteger(
                orderItem?.quantity ?? 1,
                'quantity',
              ),
            ),
            final_line_total: this.normalizeNonNegativeInteger(
              orderItem?.final_line_total ?? orderItem?.line_subtotal ?? 0,
              'final_line_total',
            ),
            product_id: productId || null,
            product_title: productTitle,
            variant_title: variantTitle || null,
            thumbnail_url: thumbnailUrl || null,
            item_kind: 'DIGITAL',
          },
          digital_asset: digitalAsset
            ? {
                id: digitalAsset.id,
                file_name: digitalAsset.file_name,
                file_size: digitalAsset.file_size,
                mime_type: digitalAsset.mime_type,
                status: digitalAsset.status,
                version_no: digitalAsset.version_no,
              }
            : null,
          download_path: `/api/v2/checkout/me/digital-entitlements/${row.id}/download`,
        };
      })
      .filter((item): item is any => Boolean(item));

    return {
      items,
      total: items.length,
    };
  }

  async createDigitalEntitlementDownloadRedirect(
    profileId: string,
    entitlementId: string,
    input: {
      includeAllForAdmin?: boolean;
      ipAddress?: string | null;
      userAgent?: string | null;
    } = {},
  ): Promise<{
    download_url: string;
    expires_at: string;
    expires_in_seconds: number;
    remaining_downloads: number | null;
  }> {
    const normalizedEntitlementId = this.normalizeOptionalUuid(entitlementId);
    if (!normalizedEntitlementId) {
      throw new ApiException(
        'entitlement_id가 올바르지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const entitlement = await this.fetchDigitalEntitlementById(
      normalizedEntitlementId,
    );
    await this.assertOrderOwnership(entitlement.order_id, profileId, {
      includeAllForAdmin: input.includeAllForAdmin,
    });

    const entitlementOrderItem =
      entitlement?.order_item &&
      typeof entitlement.order_item === 'object' &&
      !Array.isArray(entitlement.order_item)
        ? entitlement.order_item
        : null;
    const entitlementVariantId = this.normalizeOptionalUuid(
      entitlementOrderItem?.variant_id as string | null | undefined,
    );
    let entitlementProductId = this.normalizeOptionalUuid(
      entitlementOrderItem?.product_id as string | null | undefined,
    );
    if (!entitlementProductId && entitlementVariantId) {
      const variantSnapshotById = await this.fetchVariantSnapshotsByIds([
        entitlementVariantId,
      ]);
      entitlementProductId = this.normalizeOptionalUuid(
        variantSnapshotById.get(entitlementVariantId)?.product_id as
          | string
          | null
          | undefined,
      );
    }
    const legacyDownloadUrlByV2ProductId =
      await this.loadLegacyDownloadUrlByV2ProductIds(
        entitlementProductId ? [entitlementProductId] : [],
      );
    const legacyDownloadUrl =
      (entitlementProductId
        ? legacyDownloadUrlByV2ProductId.get(entitlementProductId)
        : null) || null;

    const fallbackByVariantId =
      await this.loadLatestReadyDigitalAssetByVariantIds(
        entitlementVariantId ? [entitlementVariantId] : [],
      );
    const digitalAsset = this.resolveReadyDigitalAsset({
      explicitAsset: entitlement.digital_asset,
      variantId: entitlementVariantId,
      fallbackByVariantId,
    });

    const storagePath = this.normalizeOptionalText(digitalAsset?.storage_path);
    if (!storagePath && !legacyDownloadUrl) {
      throw new ApiException(
        '다운로드 가능한 디지털 파일을 찾을 수 없습니다',
        404,
        'DIGITAL_ASSET_NOT_FOUND',
      );
    }

    const availability = this.evaluateEntitlementAvailability({
      entitlement,
      hasReadyAsset: Boolean(legacyDownloadUrl || storagePath),
    });
    if (!availability.can_download) {
      throw new ApiException(
        '현재 entitlement 상태에서는 다운로드할 수 없습니다',
        409,
        availability.blocked_reason || 'ENTITLEMENT_NOT_DOWNLOADABLE',
      );
    }

    let downloadUrl: string;
    let expiresAt: string;
    let expiresInSeconds: number;
    if (legacyDownloadUrl) {
      downloadUrl = legacyDownloadUrl;
      expiresInSeconds = 0;
      expiresAt = new Date().toISOString();
    } else if (storagePath) {
      const signedDownload = await createPresignedDownloadUrlFromR2({
        key: storagePath,
        fileName: this.normalizeOptionalText(digitalAsset.file_name),
        contentType: this.normalizeOptionalText(digitalAsset.mime_type),
        expiresInSeconds: this.normalizeDigitalDownloadUrlTtlSeconds(),
      });
      downloadUrl = signedDownload.downloadUrl;
      expiresInSeconds = signedDownload.expiresInSeconds;
      expiresAt = signedDownload.expiresAt;
    } else {
      throw new ApiException(
        '다운로드 URL 생성에 실패했습니다',
        500,
        'DIGITAL_DOWNLOAD_URL_CREATE_FAILED',
      );
    }

    const logResult = await this.v2FulfillmentService.logEntitlementDownload(
      normalizedEntitlementId,
      {
        metadata: {
          source: 'V2_CHECKOUT_DIGITAL_DOWNLOAD',
          profile_id: profileId,
          request_ip: this.normalizeOptionalText(input.ipAddress),
          user_agent: this.normalizeOptionalText(input.userAgent),
        },
      },
    );

    return {
      download_url: downloadUrl,
      expires_at: expiresAt,
      expires_in_seconds: expiresInSeconds,
      remaining_downloads:
        typeof logResult?.remaining_downloads === 'number'
          ? logResult.remaining_downloads
          : null,
    };
  }

  async cancelOrder(
    profileId: string,
    orderId: string,
    input: CancelV2OrderInput,
  ): Promise<any> {
    const order = await this.fetchOrderRow(orderId);
    if (order.profile_id !== profileId) {
      throw new ApiException(
        '주문을 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }

    if (order.order_status === 'CANCELED') {
      return this.fetchOrderAggregate(orderId);
    }

    const now = new Date().toISOString();
    const cancelReason =
      this.normalizeOptionalText(input.reason) || 'USER_REQUESTED';
    const currentPaymentStatus = order.payment_status as V2PaymentStatus;
    const nextPaymentStatus: V2PaymentStatus =
      currentPaymentStatus === 'REFUNDED' ? 'REFUNDED' : 'CANCELED';

    const { error: orderUpdateError } = await this.supabase
      .from('v2_orders')
      .update({
        order_status: 'CANCELED' as V2OrderStatus,
        payment_status: nextPaymentStatus,
        fulfillment_status: 'CANCELED' as V2FulfillmentStatus,
        canceled_at: order.canceled_at || now,
        cancel_reason: cancelReason,
        metadata: {
          ...(order.metadata || {}),
          canceled: {
            at: now,
            by: 'USER',
            reason: cancelReason,
          },
        },
      })
      .eq('id', orderId);

    if (orderUpdateError) {
      throw new ApiException(
        'v2 order 취소 실패',
        500,
        'V2_ORDER_CANCEL_FAILED',
      );
    }

    const { error: orderItemsUpdateError } = await this.supabase
      .from('v2_order_items')
      .update({ line_status: 'CANCELED' as V2OrderLineStatus })
      .eq('order_id', orderId)
      .in('line_status', ['PENDING', 'CONFIRMED', 'FULFILLED']);

    if (orderItemsUpdateError) {
      throw new ApiException(
        'v2 order item 취소 상태 반영 실패',
        500,
        'V2_ORDER_ITEMS_CANCEL_FAILED',
      );
    }

    await this.releaseActiveReservationsByOrderId(orderId, 'ORDER_CANCELED');

    return this.fetchOrderAggregate(orderId);
  }

  async refundOrder(orderId: string, input: RefundV2OrderInput): Promise<any> {
    const order = await this.fetchOrderAggregate(orderId);

    const payments = Array.isArray(order.payments) ? order.payments : [];
    const refundedSoFar = payments.reduce((sum: number, payment: any) => {
      return (
        sum +
        this.normalizeNonNegativeInteger(
          payment?.refunded_total ?? 0,
          'payment.refunded_total',
        )
      );
    }, 0);

    const orderGrandTotal = this.normalizeNonNegativeInteger(
      order.grand_total ?? 0,
      'order.grand_total',
    );
    if (orderGrandTotal <= 0) {
      throw new ApiException(
        '환불 가능한 주문 금액이 없습니다',
        400,
        'V2_ORDER_REFUND_AMOUNT_INVALID',
      );
    }

    const refundableAmount = Math.max(orderGrandTotal - refundedSoFar, 0);
    if (refundableAmount <= 0) {
      throw new ApiException(
        '이미 전액 환불된 주문입니다',
        400,
        'V2_ORDER_ALREADY_REFUNDED',
      );
    }

    const requestedAmount =
      input.amount === null || input.amount === undefined
        ? refundableAmount
        : this.normalizeNonNegativeInteger(input.amount, 'amount');
    if (requestedAmount <= 0) {
      throw new ApiException(
        'refund amount는 1 이상이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (requestedAmount > refundableAmount) {
      throw new ApiException(
        'refund amount가 환불 가능 금액을 초과했습니다',
        400,
        'V2_ORDER_REFUND_AMOUNT_EXCEEDED',
      );
    }

    const now = new Date().toISOString();
    const nextRefundedTotal = refundedSoFar + requestedAmount;
    const isFullRefund = nextRefundedTotal >= orderGrandTotal;
    const nextPaymentStatus: V2PaymentStatus = isFullRefund
      ? 'REFUNDED'
      : 'PARTIALLY_REFUNDED';
    const externalReference =
      this.normalizeOptionalText(input.external_reference) ||
      `MANUAL-REFUND-${Date.now().toString(36).toUpperCase()}`;
    const reason = this.normalizeOptionalText(input.reason) || null;

    const { error: paymentInsertError } = await this.supabase
      .from('v2_payments')
      .insert({
        order_id: orderId,
        provider: 'MANUAL',
        method: 'MANUAL_REFUND',
        status: nextPaymentStatus,
        amount: requestedAmount,
        currency_code: this.normalizeCurrencyCode(order.currency_code),
        external_reference: externalReference,
        refunded_total: requestedAmount,
        metadata: {
          ...(this.normalizeOptionalJsonObject(input.metadata) || {}),
          reason,
          refunded_at: now,
        },
      });

    if (paymentInsertError) {
      throw new ApiException(
        'v2 refund payment 이벤트 저장 실패',
        500,
        'V2_ORDER_REFUND_PAYMENT_CREATE_FAILED',
      );
    }

    const { error: orderUpdateError } = await this.supabase
      .from('v2_orders')
      .update({
        payment_status: nextPaymentStatus,
        order_status: isFullRefund
          ? ('CANCELED' as V2OrderStatus)
          : (order.order_status as V2OrderStatus),
        fulfillment_status: isFullRefund
          ? ('CANCELED' as V2FulfillmentStatus)
          : (order.fulfillment_status as V2FulfillmentStatus),
        canceled_at: isFullRefund
          ? order.canceled_at || now
          : order.canceled_at,
        cancel_reason: isFullRefund
          ? reason || order.cancel_reason
          : order.cancel_reason,
        metadata: {
          ...(order.metadata || {}),
          last_refund: {
            amount: requestedAmount,
            external_reference: externalReference,
            reason,
            refunded_at: now,
            full_refund: isFullRefund,
          },
        },
      })
      .eq('id', orderId);

    if (orderUpdateError) {
      throw new ApiException(
        'v2 order refund 상태 업데이트 실패',
        500,
        'V2_ORDER_REFUND_UPDATE_FAILED',
      );
    }

    const { error: orderItemsUpdateError } = await this.supabase
      .from('v2_order_items')
      .update({
        line_status: isFullRefund
          ? ('REFUNDED' as V2OrderLineStatus)
          : ('PARTIALLY_REFUNDED' as V2OrderLineStatus),
      })
      .eq('order_id', orderId)
      .in('line_status', ['PENDING', 'CONFIRMED', 'FULFILLED']);

    if (orderItemsUpdateError) {
      throw new ApiException(
        'v2 order item refund 상태 반영 실패',
        500,
        'V2_ORDER_ITEMS_REFUND_FAILED',
      );
    }

    if (isFullRefund) {
      await this.releaseActiveReservationsByOrderId(orderId, 'ORDER_REFUNDED');
    }

    await this.createManualOrderAdjustment(
      orderId,
      'ORDER',
      -requestedAmount,
      reason ? `MANUAL_REFUND:${reason}` : 'MANUAL_REFUND',
      {
        external_reference: externalReference,
        full_refund: isFullRefund,
      },
    );

    return this.fetchOrderAggregate(orderId);
  }

  async getOrderDebugById(orderId: string): Promise<any> {
    const order = await this.fetchOrderAggregate(orderId);
    const items = Array.isArray(order.items) ? order.items : [];

    return {
      order_id: order.id,
      order_no: order.order_no,
      statuses: {
        order_status: order.order_status,
        payment_status: order.payment_status,
        fulfillment_status: order.fulfillment_status,
      },
      totals: {
        subtotal_amount: order.subtotal_amount,
        item_discount_total: order.item_discount_total,
        order_discount_total: order.order_discount_total,
        shipping_amount: order.shipping_amount,
        shipping_discount_total: order.shipping_discount_total,
        tax_total: order.tax_total,
        grand_total: order.grand_total,
      },
      pricing_snapshot: order.pricing_snapshot || {},
      item_count: items.length,
      items: items.map((item: any) => ({
        id: item.id,
        parent_order_item_id: item.parent_order_item_id,
        line_type: item.line_type,
        line_status: item.line_status,
        quantity: item.quantity,
        list_unit_price: item.list_unit_price,
        sale_unit_price: item.sale_unit_price,
        final_unit_price: item.final_unit_price,
        line_subtotal: item.line_subtotal,
        discount_total: item.discount_total,
        final_line_total: item.final_line_total,
        bundle_definition_id: item.bundle_definition_id,
        bundle_component_id_snapshot: item.bundle_component_id_snapshot || null,
        adjustments: item.adjustments || [],
        display_snapshot: item.display_snapshot || {},
      })),
      order_adjustments: order.adjustments || [],
      payments: order.payments || [],
    };
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

    const updatedOrder = await this.fetchOrderAggregate(orderId);

    if (callbackStatus === 'CANCELED' || callbackStatus === 'REFUNDED') {
      await this.releaseActiveReservationsByOrderId(
        orderId,
        `PAYMENT_${callbackStatus}`,
      );
    }

    if (
      callbackStatus === 'CAPTURED' &&
      (order.payment_status as V2PaymentStatus) !== 'CAPTURED'
    ) {
      void this.commerceNotificationsService.notifyPaymentCaptured(updatedOrder);
    }

    return updatedOrder;
  }

  private async reserveTrackedInventoryForOrderItems(
    orderId: string,
    createdOrderItemContexts: CreatedOrderItemContext[],
  ): Promise<void> {
    const orderItems = (createdOrderItemContexts || [])
      .map((context) => context.orderItem)
      .filter(Boolean);

    if (orderItems.length === 0) {
      return;
    }

    const physicalCandidates = orderItems
      .filter((orderItem) => {
        const lineType = this.normalizeOptionalText(orderItem.line_type);
        if (lineType === 'BUNDLE_PARENT') {
          return false;
        }
        const variantId = this.normalizeOptionalUuid(orderItem.variant_id);
        if (!variantId) {
          return false;
        }
        const fulfillmentType = this.normalizeOptionalText(
          orderItem.fulfillment_type_snapshot,
        );
        const requiresShipping = orderItem.requires_shipping_snapshot === true;
        return fulfillmentType === 'PHYSICAL' || requiresShipping;
      })
      .map((orderItem) => ({
        orderItemId: this.normalizeOptionalUuid(orderItem.id),
        variantId: this.normalizeOptionalUuid(orderItem.variant_id),
        quantity: this.normalizePositiveInteger(
          orderItem.quantity,
          'order_item.quantity',
        ),
      }))
      .filter(
        (
          orderItem,
        ): orderItem is {
          orderItemId: string;
          variantId: string;
          quantity: number;
        } => Boolean(orderItem.orderItemId && orderItem.variantId),
      );

    if (physicalCandidates.length === 0) {
      return;
    }

    const variantIds = Array.from(
      new Set(physicalCandidates.map((item) => item.variantId)),
    );
    const { data: variantRows, error: variantRowsError } = await this.supabase
      .from('v2_product_variants')
      .select('id, fulfillment_type, track_inventory, deleted_at')
      .in('id', variantIds);

    if (variantRowsError) {
      throw new ApiException(
        '주문 재고 추적 variant 조회 실패',
        500,
        'V2_ORDER_VARIANT_INVENTORY_FETCH_FAILED',
      );
    }

    const trackedVariantIds = new Set(
      (variantRows || [])
        .filter((variant: any) => {
          if (variant.deleted_at) {
            return false;
          }
          if (variant.fulfillment_type !== 'PHYSICAL') {
            return false;
          }
          return variant.track_inventory === true;
        })
        .map((variant: any) => variant.id as string),
    );

    const reservableItems = physicalCandidates.filter((item) =>
      trackedVariantIds.has(item.variantId),
    );
    if (reservableItems.length === 0) {
      return;
    }

    const locationId = await this.resolveCheckoutStockLocationId();
    const expiresAt = this.buildCheckoutReservationExpiresAt();
    for (const item of reservableItems) {
      await this.v2FulfillmentService.reserveInventory({
        order_id: orderId,
        order_item_id: item.orderItemId,
        variant_id: item.variantId,
        location_id: locationId,
        quantity: item.quantity,
        reason: 'CHECKOUT_ORDER_CREATE',
        idempotency_key: `CHECKOUT-RESERVE:${orderId}:${item.orderItemId}`,
        expires_at: expiresAt,
        metadata: {
          source: 'V2_CHECKOUT_CREATE_ORDER',
        },
      });
    }
  }

  private async resolveCheckoutStockLocationId(): Promise<string> {
    const locations = await this.v2FulfillmentService.listStockLocations();
    const locationId = this.normalizeOptionalUuid(
      Array.isArray(locations) ? locations[0]?.id : null,
    );
    if (!locationId) {
      throw new ApiException(
        '활성 stock location이 없습니다. 운영자에게 문의해주세요.',
        409,
        'STOCK_LOCATION_NOT_FOUND',
      );
    }
    return locationId;
  }

  private buildCheckoutReservationExpiresAt(): string | null {
    const ttlMinutes = this.readNonNegativeIntegerEnv(
      'V2_CHECKOUT_RESERVATION_TTL_MINUTES',
      DEFAULT_CHECKOUT_RESERVATION_TTL_MINUTES,
    );
    if (ttlMinutes <= 0) {
      return null;
    }

    return new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  }

  private async releaseActiveReservationsByOrderId(
    orderId: string,
    reason: string,
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('v2_inventory_reservations')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiException(
        '주문 재고 예약 조회 실패',
        500,
        'V2_ORDER_RESERVATIONS_FETCH_FAILED',
      );
    }

    for (const row of data || []) {
      const reservationId = this.normalizeOptionalUuid(row.id);
      if (!reservationId) {
        continue;
      }
      try {
        await this.v2FulfillmentService.releaseReservation(reservationId, {
          reason,
          idempotency_key: `CHECKOUT-RELEASE:${reservationId}:${reason}`,
          metadata: {
            source: 'V2_CHECKOUT',
          },
        });
      } catch (error) {
        const code = this.extractApiErrorCode(error);
        if (
          code === 'RESERVATION_INVALID_STATE' ||
          code === 'INVENTORY_RESERVATION_NOT_FOUND'
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async deleteOrderForRollback(orderId: string): Promise<void> {
    const { error } = await this.supabase.from('v2_orders').delete().eq('id', orderId);
    if (error) {
      throw new ApiException(
        '주문 롤백 중 주문 삭제 실패',
        500,
        'V2_ORDER_ROLLBACK_FAILED',
      );
    }
  }

  private mapOrderCreateFailure(error: unknown): Error {
    const errorCode = this.extractApiErrorCode(error);
    if (
      errorCode === 'INVENTORY_NOT_ENOUGH' ||
      errorCode === 'INVENTORY_LEVEL_CONFLICT'
    ) {
      return new ApiException(
        '재고가 부족합니다. 수량을 조정한 뒤 다시 시도해 주세요.',
        409,
        'OUT_OF_STOCK',
      );
    }
    if (errorCode === 'INVENTORY_LEVEL_NOT_FOUND') {
      return new ApiException(
        '재고 준비 중인 상품입니다. 잠시 후 다시 시도해 주세요.',
        409,
        'OUT_OF_STOCK',
      );
    }
    if (error instanceof Error) {
      return error;
    }
    return new ApiException('주문 생성 실패', 500, 'V2_ORDER_CREATE_FAILED');
  }

  private extractApiErrorCode(error: unknown): string | null {
    if (!(error instanceof ApiException)) {
      return null;
    }
    const response = error.getResponse();
    if (!response || typeof response !== 'object') {
      return null;
    }
    const errorCode = (response as { errorCode?: unknown }).errorCode;
    return typeof errorCode === 'string' ? errorCode : null;
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

    const items = (data || []) as any[];
    const productIds = Array.from(
      new Set(
        items
          .map((item) =>
            this.normalizeOptionalText(
              item?.variant?.product?.id as string | null | undefined,
            ),
          )
          .filter((productId): productId is string => !!productId),
      ),
    );
    const thumbnailByProductId =
      await this.loadPrimaryProductThumbnailByProductIds(productIds);

    for (const item of items) {
      const product = item?.variant?.product;
      const productId = this.normalizeOptionalText(
        product?.id as string | null | undefined,
      );
      if (!product || !productId) {
        continue;
      }
      item.variant.product = {
        ...product,
        thumbnail_url: thumbnailByProductId.get(productId) ?? null,
      };
    }

    return items;
  }

  private async loadPrimaryProductThumbnailByProductIds(
    productIds: string[],
  ): Promise<Map<string, string>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_product_media')
      .select('product_id,public_url,media_role,is_primary,sort_order,created_at')
      .in('product_id', productIds)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'v2 cart 썸네일 조회 실패',
        500,
        'V2_CART_THUMBNAIL_FETCH_FAILED',
      );
    }

    const rowsByProductId = new Map<string, any[]>();
    for (const row of (data || []) as any[]) {
      const productId = this.normalizeOptionalText(
        row.product_id as string | null | undefined,
      );
      if (!productId) {
        continue;
      }
      const rows = rowsByProductId.get(productId) || [];
      rows.push(row);
      rowsByProductId.set(productId, rows);
    }

    const thumbnailByProductId = new Map<string, string>();
    for (const productId of productIds) {
      const mediaRows = rowsByProductId.get(productId) || [];
      if (mediaRows.length === 0) {
        continue;
      }

      const primaryByFlag = mediaRows.find(
        (media) =>
          media.is_primary &&
          this.normalizeOptionalText(media.public_url as string | null | undefined),
      );
      const primaryByRole = mediaRows.find(
        (media) =>
          media.media_role === 'PRIMARY' &&
          this.normalizeOptionalText(media.public_url as string | null | undefined),
      );
      const fallback = mediaRows.find((media) =>
        this.normalizeOptionalText(media.public_url as string | null | undefined),
      );
      const thumbnailUrl = this.normalizeOptionalText(
        (primaryByFlag || primaryByRole || fallback)?.public_url as
          | string
          | null
          | undefined,
      );
      if (!thumbnailUrl) {
        continue;
      }

      thumbnailByProductId.set(productId, thumbnailUrl);
    }

    return thumbnailByProductId;
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
    input: ValidateV2CheckoutInput,
    cartItems: any[],
  ): CheckoutPayload {
    const lineContexts: CheckoutLineContext[] = cartItems.map(
      (item, index): CheckoutLineContext => {
        const variantId = this.normalizeOptionalText(item.variant_id);
        if (!variantId) {
          throw new ApiException(
            `cart item(${index}) variant_id가 비어있습니다`,
            400,
            'VALIDATION_ERROR',
          );
        }

        const resolvedProductKind =
          this.normalizeOptionalText(item.product_kind_snapshot) ||
          this.normalizeOptionalText(item?.variant?.product?.product_kind) ||
          'STANDARD';
        const productKind: CheckoutLineContext['productKind'] =
          resolvedProductKind === 'BUNDLE' ? 'BUNDLE' : 'STANDARD';

        return {
          cartItemId: this.normalizeOptionalUuid(item.id),
          variantId,
          quantity: this.normalizePositiveInteger(
            item.quantity,
            `cart item(${index}).quantity`,
          ),
          productId: this.normalizeOptionalUuid(
            item.product_id || item?.variant?.product_id || null,
          ),
          productKind,
          campaignId: this.normalizeOptionalUuid(item.campaign_id),
          bundleConfigurationSnapshot: this.normalizeOptionalJsonObject(
            item.bundle_configuration_snapshot,
          ),
        };
      },
    );
    const shippingRequired = cartItems.some(
      (item) => item?.variant?.requires_shipping === true,
    );
    const lines = lineContexts.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
    }));

    const requestedCampaignId = this.normalizeOptionalUuid(input.campaign_id);
    const campaignCandidates = Array.from(
      new Set(
        lineContexts
          .map((item) => item.campaignId)
          .filter((campaignId): campaignId is string => Boolean(campaignId)),
      ),
    );

    let campaignId: string | null = requestedCampaignId;
    if (!campaignId && campaignCandidates.length === 1) {
      campaignId = campaignCandidates[0];
    }

    return {
      lines,
      lineContexts,
      campaignId,
      couponCode: this.normalizeOptionalText(input.coupon_code),
      channel: this.normalizeOptionalText(input.channel),
      requestedShippingAmount:
        input.shipping_amount === null || input.shipping_amount === undefined
          ? null
          : this.normalizeNonNegativeInteger(
              input.shipping_amount,
              'shipping_amount',
            ),
      shippingPostcode: this.normalizeOptionalPostcode(input.shipping_postcode),
      shippingRequired,
    };
  }

  private async buildCheckoutQuote(
    profileId: string,
    checkoutPayload: CheckoutPayload,
  ): Promise<{ quote: any; shippingAmount: number }> {
    const requestedShippingAmount = checkoutPayload.requestedShippingAmount;
    const initialShippingAmount = requestedShippingAmount ?? 0;

    let quote = await this.v2CatalogService.buildPriceQuote({
      lines: checkoutPayload.lines,
      campaign_id: checkoutPayload.campaignId || undefined,
      coupon_code: checkoutPayload.couponCode || undefined,
      channel: checkoutPayload.channel || undefined,
      user_id: profileId,
      shipping_amount: initialShippingAmount,
    });

    if (requestedShippingAmount !== null) {
      return {
        quote,
        shippingAmount: requestedShippingAmount,
      };
    }

    const summary = (quote?.summary || {}) as Record<string, unknown>;
    const subtotalAmount = this.normalizeNonNegativeInteger(
      summary.subtotal ?? 0,
      'subtotal',
    );

    const computedShippingAmount = this.calculateShippingAmountByPolicy({
      shippingRequired: checkoutPayload.shippingRequired,
      subtotalAmount,
      postcode: checkoutPayload.shippingPostcode,
    });

    if (computedShippingAmount !== initialShippingAmount) {
      quote = await this.v2CatalogService.buildPriceQuote({
        lines: checkoutPayload.lines,
        campaign_id: checkoutPayload.campaignId || undefined,
        coupon_code: checkoutPayload.couponCode || undefined,
        channel: checkoutPayload.channel || undefined,
        user_id: profileId,
        shipping_amount: computedShippingAmount,
      });
    }

    return {
      quote,
      shippingAmount: computedShippingAmount,
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
    lineContexts: CheckoutLineContext[],
    fallbackCampaignId: string | null,
  ): Promise<CreatedOrderItemContext[]> {
    const createdOrderItems: CreatedOrderItemContext[] = [];

    for (let index = 0; index < quoteLines.length; index += 1) {
      const line = quoteLines[index];
      const lineContext = lineContexts[index];
      if (!lineContext) {
        throw new ApiException(
          'checkout line context가 quote와 일치하지 않습니다',
          500,
          'V2_CHECKOUT_CONTEXT_MISMATCH',
        );
      }
      const pricing = (line?.pricing || {}) as Record<string, unknown>;
      const quantity = this.normalizePositiveInteger(
        line?.quantity ?? lineContext.quantity ?? 1,
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
      const campaignIdSnapshot =
        sourceCampaignId ||
        lineContext.campaignId ||
        fallbackCampaignId ||
        null;
      const fulfillmentType = this.normalizeOptionalText(
        line?.fulfillment_type,
      );
      const quoteLineAdjustments = this.mapQuoteLineAdjustments(
        line?.adjustments,
      );

      const isBundleLine = lineContext.productKind === 'BUNDLE';
      const bundleConfiguration = this.parseBundleConfigurationSnapshot(
        lineContext.bundleConfigurationSnapshot,
      );
      const bundleDefinitionId = isBundleLine
        ? await this.resolveBundleDefinitionId(
            lineContext,
            line,
            bundleConfiguration,
          )
        : null;

      if (isBundleLine && bundleDefinitionId) {
        const parentRow = {
          order_id: orderId,
          parent_order_item_id: null,
          line_type: 'BUNDLE_PARENT' as V2OrderLineType,
          product_id:
            this.normalizeOptionalUuid(line?.product_id) ||
            lineContext.productId,
          variant_id:
            this.normalizeOptionalUuid(line?.variant_id) ||
            lineContext.variantId,
          bundle_definition_id: bundleDefinitionId,
          quantity,
          line_status: lineStatus,
          currency_code: currencyCode,
          list_unit_price: 0,
          sale_unit_price: 0,
          final_unit_price: 0,
          line_subtotal: 0,
          discount_total: 0,
          tax_total: 0,
          final_line_total: 0,
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
          bundle_component_id_snapshot: null,
          allocated_unit_amount: null,
          allocated_discount_amount: 0,
          display_snapshot: {
            title: this.normalizeOptionalText(line?.title),
            pricing,
            bundle_role: 'PARENT',
            display_price: {
              list_line_total: lineSubtotal,
              sale_line_total: saleUnitPrice * quantity,
              final_line_total: finalLineTotal,
              discount_total: discountTotal,
            },
          },
          metadata: {
            ...(this.normalizeOptionalJsonObject(line?.metadata) || {}),
            bundle_configuration_snapshot: bundleConfiguration,
            bundle_parent_display_only: true,
          },
        };

        const parentOrderItem = await this.insertOrderItem(parentRow);
        createdOrderItems.push({
          orderItem: parentOrderItem,
          adjustments: quoteLineAdjustments,
        });

        const resolvedBundle = await this.v2CatalogService.resolveBundle({
          bundle_definition_id: bundleDefinitionId,
          parent_variant_id:
            this.normalizeOptionalUuid(line?.variant_id) ||
            lineContext.variantId,
          parent_quantity: quantity,
          parent_unit_amount: finalUnitPrice,
          selected_components: bundleConfiguration?.selected_components || [],
        });

        const componentLines = Array.isArray(resolvedBundle?.component_lines)
          ? resolvedBundle.component_lines
          : [];
        if (componentLines.length === 0) {
          throw new ApiException(
            'bundle component line을 생성할 수 없습니다',
            400,
            'V2_BUNDLE_COMPONENTS_EMPTY',
          );
        }

        const allocationWeights = componentLines.map((componentLine: any) =>
          this.normalizeNonNegativeNumber(
            componentLine?.allocation_weight ?? 0,
            `bundle_component_lines[${index}].allocation_weight`,
          ),
        );
        const listLineTotals = this.allocateAmountByWeights(
          lineSubtotal,
          allocationWeights,
        );
        const saleLineTotals = this.allocateAmountByWeights(
          saleUnitPrice * quantity,
          allocationWeights,
        );
        const finalLineTotals = this.allocateAmountByWeights(
          finalLineTotal,
          allocationWeights,
        );

        const componentVariantIds = Array.from(
          new Set<string>(
            componentLines
              .map((componentLine: any) =>
                this.normalizeOptionalUuid(componentLine?.component_variant_id),
              )
              .filter((variantId): variantId is string => Boolean(variantId)),
          ),
        );
        const variantSnapshotById =
          await this.fetchVariantSnapshotsByIds(componentVariantIds);

        for (
          let componentIndex = 0;
          componentIndex < componentLines.length;
          componentIndex += 1
        ) {
          const componentLine = componentLines[componentIndex];
          const componentVariantId = this.normalizeOptionalUuid(
            componentLine?.component_variant_id,
          );
          if (!componentVariantId) {
            throw new ApiException(
              'bundle component variant_id가 비어있습니다',
              400,
              'VALIDATION_ERROR',
            );
          }

          const componentQuantity = this.normalizePositiveInteger(
            componentLine?.quantity,
            `bundle_component_lines[${componentIndex}].quantity`,
          );
          const componentListTotal = this.normalizeNonNegativeInteger(
            listLineTotals[componentIndex] ?? 0,
            `bundle_component_lines[${componentIndex}].list_line_total`,
          );
          const componentSaleTotal = this.normalizeNonNegativeInteger(
            saleLineTotals[componentIndex] ?? componentListTotal,
            `bundle_component_lines[${componentIndex}].sale_line_total`,
          );
          const componentFinalTotal = this.normalizeNonNegativeInteger(
            finalLineTotals[componentIndex] ?? componentSaleTotal,
            `bundle_component_lines[${componentIndex}].final_line_total`,
          );
          const componentDiscountTotal = Math.max(
            componentListTotal - componentFinalTotal,
            0,
          );
          const componentListUnitPrice =
            componentQuantity > 0
              ? Math.floor(componentListTotal / componentQuantity)
              : 0;
          const componentSaleUnitPrice =
            componentQuantity > 0
              ? Math.floor(componentSaleTotal / componentQuantity)
              : componentListUnitPrice;
          const componentFinalUnitPrice =
            componentQuantity > 0
              ? Math.floor(componentFinalTotal / componentQuantity)
              : componentSaleUnitPrice;
          const componentAllocatedUnitAmount = this.normalizeNonNegativeInteger(
            componentLine?.allocated_unit_amount ?? componentFinalUnitPrice,
            `bundle_component_lines[${componentIndex}].allocated_unit_amount`,
          );
          const componentAllocatedDiscountAmount =
            this.normalizeNonNegativeInteger(
              componentLine?.allocated_discount_amount ?? 0,
              `bundle_component_lines[${componentIndex}].allocated_discount_amount`,
            ) * quantity;
          const componentVariantSnapshot =
            variantSnapshotById.get(componentVariantId) || null;
          const componentFulfillmentType = this.normalizeOptionalText(
            componentLine?.fulfillment_type,
          );
          const bundleComponentIdSnapshot = this.normalizeOptionalUuid(
            componentLine?.bundle_component_id_snapshot,
          );

          const componentRow = {
            order_id: orderId,
            parent_order_item_id: parentOrderItem.id,
            line_type: 'BUNDLE_COMPONENT' as V2OrderLineType,
            product_id:
              this.normalizeOptionalUuid(
                componentVariantSnapshot?.product_id,
              ) || null,
            variant_id: componentVariantId,
            bundle_definition_id: bundleDefinitionId,
            quantity: componentQuantity,
            line_status: lineStatus,
            currency_code: currencyCode,
            list_unit_price: componentListUnitPrice,
            sale_unit_price: componentSaleUnitPrice,
            final_unit_price: componentFinalUnitPrice,
            line_subtotal: componentListTotal,
            discount_total: componentDiscountTotal,
            tax_total: 0,
            final_line_total: componentFinalTotal,
            sku_snapshot:
              this.normalizeOptionalText(
                componentLine?.component_variant_sku,
              ) || this.normalizeOptionalText(componentVariantSnapshot?.sku),
            product_name_snapshot:
              this.normalizeOptionalText(
                componentVariantSnapshot?.product?.title,
              ) ||
              this.normalizeOptionalText(
                componentLine?.component_variant_title,
              ) ||
              null,
            variant_name_snapshot:
              this.normalizeOptionalText(
                componentLine?.component_variant_title,
              ) ||
              this.normalizeOptionalText(componentVariantSnapshot?.title) ||
              null,
            project_id_snapshot: this.normalizeOptionalUuid(
              componentVariantSnapshot?.product?.project_id,
            ),
            project_name_snapshot:
              this.normalizeOptionalText(
                componentVariantSnapshot?.product?.project?.name,
              ) || null,
            fulfillment_type_snapshot:
              componentFulfillmentType === 'DIGITAL' ||
              componentFulfillmentType === 'PHYSICAL'
                ? componentFulfillmentType
                : null,
            requires_shipping_snapshot:
              typeof componentLine?.requires_shipping === 'boolean'
                ? componentLine.requires_shipping
                : null,
            campaign_id_snapshot: campaignIdSnapshot,
            campaign_name_snapshot:
              this.normalizeOptionalText(line?.campaign_name) || null,
            bundle_component_id_snapshot: bundleComponentIdSnapshot,
            allocated_unit_amount: componentAllocatedUnitAmount,
            allocated_discount_amount: componentAllocatedDiscountAmount,
            display_snapshot: {
              title: this.normalizeOptionalText(
                componentLine?.component_variant_title,
              ),
              pricing: {
                source_quote_index: index,
                allocated_unit_amount: componentAllocatedUnitAmount,
                allocated_discount_amount: componentAllocatedDiscountAmount,
              },
              bundle_role: 'COMPONENT',
              parent_order_item_id: parentOrderItem.id,
            },
            metadata: {
              bundle_component_id_snapshot: bundleComponentIdSnapshot,
              bundle_definition_id: bundleDefinitionId,
            },
          };

          const componentOrderItem = await this.insertOrderItem(componentRow);
          createdOrderItems.push({
            orderItem: componentOrderItem,
            adjustments: [
              {
                source_type: 'BUNDLE_ALLOC',
                source_id: bundleComponentIdSnapshot,
                label_snapshot: 'BUNDLE_COMPONENT_ALLOCATION',
                amount: componentFinalTotal,
                sequence_no: 1,
                calculation_snapshot: {
                  source_quote_index: index,
                  allocated_line_total: componentFinalTotal,
                  allocated_unit_amount: componentAllocatedUnitAmount,
                  allocated_discount_amount: componentAllocatedDiscountAmount,
                },
              },
            ],
          });
        }

        continue;
      }

      const row = {
        order_id: orderId,
        parent_order_item_id: null,
        line_type: lineType,
        product_id:
          this.normalizeOptionalUuid(line?.product_id) || lineContext.productId,
        variant_id:
          this.normalizeOptionalUuid(line?.variant_id) || lineContext.variantId,
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
        bundle_component_id_snapshot: null,
        allocated_unit_amount: null,
        allocated_discount_amount: 0,
        display_snapshot: {
          title: this.normalizeOptionalText(line?.title),
          pricing,
        },
        metadata: this.normalizeOptionalJsonObject(line?.metadata) || {},
      };

      const createdOrderItem = await this.insertOrderItem(row);
      createdOrderItems.push({
        orderItem: createdOrderItem,
        adjustments: quoteLineAdjustments,
      });
    }

    return createdOrderItems;
  }

  private async createOrderItemAdjustments(
    createdOrderItems: CreatedOrderItemContext[],
  ): Promise<void> {
    for (let index = 0; index < createdOrderItems.length; index += 1) {
      const target = createdOrderItems[index];
      const lineAdjustments = Array.isArray(target.adjustments)
        ? target.adjustments
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
            order_item_id: target.orderItem.id,
            source_type: sourceType,
            source_id: this.normalizeOptionalUuid(adjustment?.source_id),
            label_snapshot:
              this.normalizeOptionalText(adjustment?.label_snapshot) ||
              this.normalizeOptionalText(adjustment?.label) ||
              this.normalizeOptionalText(adjustment?.phase) ||
              sourceType,
            amount,
            sequence_no:
              this.normalizeOptionalPositiveInteger(adjustment?.sequence_no) ||
              adjustmentIndex + 1,
            calculation_snapshot:
              this.normalizeOptionalJsonObject(adjustment) || {},
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

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

  private async insertOrderItem(row: Record<string, unknown>): Promise<any> {
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

    return createdOrderItem;
  }

  private mapQuoteLineAdjustments(adjustments: unknown): any[] {
    if (!Array.isArray(adjustments)) {
      return [];
    }

    return adjustments.map((adjustment) => ({
      source_type: this.normalizeOptionalText(adjustment?.source_type) || 'ETC',
      source_id: this.normalizeOptionalUuid(adjustment?.source_id),
      label_snapshot:
        this.normalizeOptionalText(adjustment?.label_snapshot) ||
        this.normalizeOptionalText(adjustment?.label) ||
        this.normalizeOptionalText(adjustment?.phase) ||
        'LINE_ADJUSTMENT',
      amount: this.normalizeInteger(
        adjustment?.amount ?? 0,
        'adjustment.amount',
      ),
      sequence_no: this.normalizeNonNegativeInteger(
        adjustment?.sequence_no ?? 0,
        'adjustment.sequence_no',
      ),
      calculation_snapshot: this.normalizeOptionalJsonObject(adjustment) || {},
    }));
  }

  private parseBundleConfigurationSnapshot(
    snapshot: Record<string, unknown> | null | undefined,
  ): BundleConfigurationSnapshot | null {
    if (!snapshot) {
      return null;
    }

    const bundleDefinitionId = this.normalizeOptionalUuid(
      snapshot.bundle_definition_id,
    );
    if (!bundleDefinitionId) {
      return null;
    }

    const selectedComponents = Array.isArray(snapshot.selected_components)
      ? snapshot.selected_components
          .map((item) => {
            const componentVariantId = this.normalizeOptionalUuid(
              item?.component_variant_id,
            );
            if (!componentVariantId) {
              return null;
            }
            const quantity =
              item?.quantity === undefined || item?.quantity === null
                ? undefined
                : this.normalizeNonNegativeInteger(
                    item.quantity,
                    'selected_components.quantity',
                  );
            return {
              component_variant_id: componentVariantId,
              ...(quantity === undefined ? {} : { quantity }),
            };
          })
          .filter((item): item is BundleSelectionItem =>
            Boolean(item?.component_variant_id),
          )
      : [];

    return {
      bundle_definition_id: bundleDefinitionId,
      selected_components: selectedComponents,
    };
  }

  private async resolveBundleDefinitionId(
    lineContext: CheckoutLineContext,
    quoteLine: any,
    bundleConfiguration: BundleConfigurationSnapshot | null,
  ): Promise<string> {
    const fromLine = this.normalizeOptionalUuid(
      quoteLine?.bundle_definition_id,
    );
    if (fromLine) {
      return fromLine;
    }
    if (bundleConfiguration?.bundle_definition_id) {
      return bundleConfiguration.bundle_definition_id;
    }

    const bundleProductId =
      lineContext.productId ||
      this.normalizeOptionalUuid(quoteLine?.product_id);
    if (!bundleProductId) {
      throw new ApiException(
        'bundle product_id를 확인할 수 없습니다',
        400,
        'V2_BUNDLE_PRODUCT_NOT_FOUND',
      );
    }

    const { data: activeDefinition, error } = await this.supabase
      .from('v2_bundle_definitions')
      .select('id')
      .eq('bundle_product_id', bundleProductId)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'ACTIVE bundle definition 조회 실패',
        500,
        'V2_BUNDLE_DEFINITION_FETCH_FAILED',
      );
    }
    if (!activeDefinition?.id) {
      throw new ApiException(
        'ACTIVE bundle definition이 없습니다',
        400,
        'V2_BUNDLE_DEFINITION_NOT_FOUND',
      );
    }

    return activeDefinition.id as string;
  }

  private async fetchVariantSnapshotsByIds(
    variantIds: string[],
  ): Promise<Map<string, any>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .select(
        `
        id,
        product_id,
        sku,
        title,
        fulfillment_type,
        requires_shipping,
        product:v2_products (
          id,
          project_id,
          title,
          project:v2_projects (
            id,
            name
          )
        )
      `,
      )
      .in('id', variantIds)
      .is('deleted_at', null);

    if (error) {
      throw new ApiException(
        'bundle component variant snapshot 조회 실패',
        500,
        'V2_VARIANT_SNAPSHOT_FETCH_FAILED',
      );
    }

    return new Map(
      ((data || []) as any[]).map((variant) => [variant.id, variant]),
    );
  }

  private allocateAmountByWeights(
    totalAmount: number,
    weights: number[],
  ): number[] {
    const safeTotal = this.normalizeNonNegativeInteger(
      totalAmount,
      'totalAmount',
    );
    if (weights.length === 0) {
      return [];
    }

    const normalizedWeights = weights.map((weight) =>
      this.normalizeNonNegativeNumber(weight, 'weight'),
    );
    const weightSum = normalizedWeights.reduce(
      (sum, weight) => sum + weight,
      0,
    );
    if (weightSum <= 0) {
      return this.allocateAmountEvenly(safeTotal, weights.length);
    }

    const allocations = normalizedWeights.map((weight) =>
      Math.floor((safeTotal * weight) / weightSum),
    );
    let allocated = allocations.reduce((sum, value) => sum + value, 0);
    let remainder = safeTotal - allocated;
    if (remainder <= 0) {
      return allocations;
    }

    const orderedIndexes = normalizedWeights
      .map((weight, index) => ({
        index,
        remainderValue: (safeTotal * weight) % weightSum,
      }))
      .sort((a, b) => b.remainderValue - a.remainderValue)
      .map((item) => item.index);

    for (let i = 0; i < orderedIndexes.length && remainder > 0; i += 1) {
      allocations[orderedIndexes[i]] += 1;
      remainder -= 1;
      allocated += 1;
    }

    if (allocated < safeTotal) {
      allocations[0] += safeTotal - allocated;
    }

    return allocations;
  }

  private allocateAmountEvenly(totalAmount: number, count: number): number[] {
    if (count <= 0) {
      return [];
    }
    const base = Math.floor(totalAmount / count);
    const remainder = totalAmount % count;
    return Array.from({ length: count }, (_, index) =>
      index < remainder ? base + 1 : base,
    );
  }

  private async fetchOrderRow(orderId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 order 조회 실패',
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

  private async createManualOrderAdjustment(
    orderId: string,
    scope: V2AdjustmentScope,
    amount: number,
    label: string,
    calculationSnapshot: Record<string, unknown> = {},
  ): Promise<void> {
    if (amount === 0) {
      return;
    }

    const { data: latestAdjustment, error: latestAdjustmentError } =
      await this.supabase
        .from('v2_order_adjustments')
        .select('sequence_no')
        .eq('order_id', orderId)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestAdjustmentError) {
      throw new ApiException(
        'v2 order adjustment sequence 조회 실패',
        500,
        'V2_ORDER_ADJUSTMENTS_SEQUENCE_FETCH_FAILED',
      );
    }

    const nextSequenceNo =
      this.normalizeNonNegativeInteger(
        latestAdjustment?.sequence_no ?? 0,
        'sequence_no',
      ) + 1;

    const { error } = await this.supabase.from('v2_order_adjustments').insert({
      order_id: orderId,
      target_scope: scope,
      source_type: 'MANUAL',
      source_id: null,
      code_snapshot: null,
      label_snapshot: label,
      amount,
      sequence_no: nextSequenceNo,
      calculation_snapshot: calculationSnapshot,
    });
    if (error) {
      throw new ApiException(
        'v2 manual order adjustment 생성 실패',
        500,
        'V2_ORDER_MANUAL_ADJUSTMENT_CREATE_FAILED',
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

    const items = Array.isArray(data.items) ? (data.items as any[]) : [];
    if (items.length === 0) {
      return data;
    }

    const variantIds = Array.from(
      new Set(
        items
          .map((item) =>
            this.normalizeOptionalUuid(item?.variant_id as string | null | undefined),
          )
          .filter((variantId): variantId is string => Boolean(variantId)),
      ),
    );
    const variantSnapshotById = await this.fetchVariantSnapshotsByIds(variantIds);

    const productIds = Array.from(
      new Set(
        items
          .map((item) => {
            const itemProductId = this.normalizeOptionalUuid(
              item?.product_id as string | null | undefined,
            );
            if (itemProductId) {
              return itemProductId;
            }
            const itemVariantId = this.normalizeOptionalUuid(
              item?.variant_id as string | null | undefined,
            );
            if (!itemVariantId) {
              return null;
            }
            const variantSnapshot = variantSnapshotById.get(itemVariantId);
            return this.normalizeOptionalUuid(
              variantSnapshot?.product_id as string | null | undefined,
            );
          })
          .filter((productId): productId is string => Boolean(productId)),
      ),
    );
    const thumbnailByProductId =
      await this.loadPrimaryProductThumbnailByProductIds(productIds);

    data.items = items.map((item) => {
      const variantId = this.normalizeOptionalUuid(
        item?.variant_id as string | null | undefined,
      );
      const variantSnapshot = variantId ? variantSnapshotById.get(variantId) : null;
      const displaySnapshot =
        item?.display_snapshot &&
        typeof item.display_snapshot === 'object' &&
        !Array.isArray(item.display_snapshot)
          ? (item.display_snapshot as Record<string, unknown>)
          : {};

      const productId =
        this.normalizeOptionalUuid(item?.product_id as string | null | undefined) ||
        this.normalizeOptionalUuid(
          variantSnapshot?.product_id as string | null | undefined,
        );
      const productTitle =
        this.normalizeOptionalText(
          item?.product_name_snapshot as string | null | undefined,
        ) ||
        this.normalizeOptionalText(
          displaySnapshot.product_title as string | null | undefined,
        ) ||
        this.normalizeOptionalText(
          variantSnapshot?.product?.title as string | null | undefined,
        );
      const variantTitle =
        this.normalizeOptionalText(
          item?.variant_name_snapshot as string | null | undefined,
        ) ||
        this.normalizeOptionalText(
          displaySnapshot.variant_title as string | null | undefined,
        ) ||
        this.normalizeOptionalText(
          displaySnapshot.title as string | null | undefined,
        ) ||
        this.normalizeOptionalText(variantSnapshot?.title as string | null | undefined);
      const thumbnailUrl =
        (productId ? thumbnailByProductId.get(productId) : null) ||
        this.normalizeOptionalText(
          displaySnapshot.thumbnail_url as string | null | undefined,
        );

      return {
        ...item,
        product_name_snapshot: productTitle || item?.product_name_snapshot || null,
        variant_name_snapshot: variantTitle || item?.variant_name_snapshot || null,
        display_snapshot: {
          ...displaySnapshot,
          product_id: productId || null,
          product_title: productTitle || null,
          variant_title: variantTitle || null,
          thumbnail_url: thumbnailUrl || null,
          title:
            this.normalizeOptionalText(
              displaySnapshot.title as string | null | undefined,
            ) ||
            variantTitle ||
            productTitle ||
            null,
        },
      };
    });

    return data;
  }

  private async fetchDigitalEntitlementById(entitlementId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select(
        `
        *,
        order_item:v2_order_items (
          id,
          order_id,
          product_id,
          variant_id,
          line_type,
          line_status,
          quantity,
          final_line_total,
          line_subtotal,
          product_name_snapshot,
          variant_name_snapshot,
          display_snapshot
        ),
        digital_asset:v2_digital_assets (
          id,
          variant_id,
          file_name,
          file_size,
          mime_type,
          status,
          storage_path,
          version_no,
          metadata,
          deleted_at
        )
      `,
      )
      .eq('id', entitlementId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'digital entitlement 조회 실패',
        500,
        'V2_DIGITAL_ENTITLEMENT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'digital entitlement를 찾을 수 없습니다',
        404,
        'V2_DIGITAL_ENTITLEMENT_NOT_FOUND',
      );
    }

    return data;
  }

  private async assertOrderOwnership(
    orderId: string,
    profileId: string,
    input: {
      includeAllForAdmin?: boolean;
    } = {},
  ): Promise<void> {
    const normalizedOrderId = this.normalizeOptionalUuid(orderId);
    if (!normalizedOrderId) {
      throw new ApiException(
        '주문 정보를 확인할 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }

    let query = this.supabase
      .from('v2_orders')
      .select('id')
      .eq('id', normalizedOrderId);

    if (!input.includeAllForAdmin) {
      query = query.eq('profile_id', profileId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new ApiException(
        '주문 소유권 확인 실패',
        500,
        'V2_ORDER_OWNERSHIP_CHECK_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '주문을 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }
  }

  private async loadLatestReadyDigitalAssetByVariantIds(
    variantIds: string[],
  ): Promise<Map<string, any>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .select(
        'id,variant_id,file_name,file_size,mime_type,status,storage_path,version_no,metadata,deleted_at,created_at',
      )
      .in('variant_id', variantIds)
      .eq('status', 'READY')
      .is('deleted_at', null)
      .order('variant_id', { ascending: true })
      .order('version_no', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiException(
        '디지털 에셋 조회 실패',
        500,
        'V2_DIGITAL_ASSET_FETCH_FAILED',
      );
    }

    const mapped = new Map<string, any>();
    for (const assetRow of (data || []) as any[]) {
      const variantId = this.normalizeOptionalUuid(assetRow.variant_id);
      if (!variantId || mapped.has(variantId)) {
        continue;
      }
      mapped.set(variantId, assetRow);
    }

    return mapped;
  }

  private async loadLegacyDownloadUrlByV2ProductIds(
    v2ProductIds: string[],
  ): Promise<Map<string, string>> {
    if (v2ProductIds.length === 0) {
      return new Map();
    }

    const { data: v2Products, error: v2ProductsError } = await this.supabase
      .from('v2_products')
      .select('id,legacy_product_id')
      .in('id', v2ProductIds)
      .is('deleted_at', null);

    if (v2ProductsError) {
      throw new ApiException(
        'legacy 매핑용 v2 product 조회 실패',
        500,
        'V2_PRODUCT_LEGACY_MAPPING_FETCH_FAILED',
      );
    }

    const legacyProductIdByV2ProductId = new Map<string, string>();
    for (const v2Product of (v2Products || []) as any[]) {
      const v2ProductId = this.normalizeOptionalUuid(v2Product?.id);
      const legacyProductId = this.normalizeOptionalUuid(
        v2Product?.legacy_product_id,
      );
      if (!v2ProductId || !legacyProductId) {
        continue;
      }
      legacyProductIdByV2ProductId.set(v2ProductId, legacyProductId);
    }

    const legacyProductIds = Array.from(
      new Set(legacyProductIdByV2ProductId.values()),
    );
    if (legacyProductIds.length === 0) {
      return new Map();
    }

    const { data: legacyProducts, error: legacyProductsError } =
      await this.supabase
        .from('products')
        .select('id,digital_file_url')
        .in('id', legacyProductIds)
        .eq('is_active', true);

    if (legacyProductsError) {
      throw new ApiException(
        'legacy digital_file_url 조회 실패',
        500,
        'LEGACY_PRODUCT_DOWNLOAD_URL_FETCH_FAILED',
      );
    }

    const downloadUrlByLegacyProductId = new Map<string, string>();
    for (const legacyProduct of (legacyProducts || []) as any[]) {
      const legacyProductId = this.normalizeOptionalUuid(legacyProduct?.id);
      const downloadUrl = this.normalizeOptionalHttpUrl(
        legacyProduct?.digital_file_url,
      );
      if (!legacyProductId || !downloadUrl) {
        continue;
      }
      downloadUrlByLegacyProductId.set(legacyProductId, downloadUrl);
    }

    const downloadUrlByV2ProductId = new Map<string, string>();
    for (const [v2ProductId, legacyProductId] of legacyProductIdByV2ProductId) {
      const downloadUrl = downloadUrlByLegacyProductId.get(legacyProductId);
      if (!downloadUrl) {
        continue;
      }
      downloadUrlByV2ProductId.set(v2ProductId, downloadUrl);
    }

    return downloadUrlByV2ProductId;
  }

  private isReadyDigitalAsset(asset: unknown): boolean {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      return false;
    }
    const row = asset as Record<string, unknown>;
    return (
      this.normalizeOptionalText(row.status) === 'READY' &&
      !this.normalizeOptionalText(row.deleted_at)
    );
  }

  private resolveReadyDigitalAsset(input: {
    explicitAsset: unknown;
    variantId: string | null;
    fallbackByVariantId: Map<string, any>;
  }): any | null {
    if (this.isReadyDigitalAsset(input.explicitAsset)) {
      return input.explicitAsset as any;
    }
    if (!input.variantId) {
      return null;
    }
    return input.fallbackByVariantId.get(input.variantId) || null;
  }

  private evaluateEntitlementAvailability(input: {
    entitlement: any;
    hasReadyAsset: boolean;
  }): {
    can_download: boolean;
    blocked_reason: string | null;
    remaining_downloads: number | null;
  } {
    const status = this.normalizeOptionalText(input.entitlement?.status) || 'PENDING';
    const downloadCount = this.normalizeNonNegativeInteger(
      input.entitlement?.download_count ?? 0,
      'download_count',
    );
    const maxDownloads =
      typeof input.entitlement?.max_downloads === 'number' &&
      Number.isInteger(input.entitlement.max_downloads) &&
      input.entitlement.max_downloads >= 0
        ? input.entitlement.max_downloads
        : null;
    const expiresAt = this.normalizeOptionalText(input.entitlement?.expires_at);
    const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const isExpiredByTime =
      typeof expiresAtMs === 'number' &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs <= Date.now();

    let canDownload = true;
    let blockedReason: string | null = null;

    if (!input.hasReadyAsset) {
      canDownload = false;
      blockedReason = 'DIGITAL_ASSET_NOT_READY';
    } else if (isExpiredByTime || status === 'EXPIRED') {
      canDownload = false;
      blockedReason = 'ENTITLEMENT_EXPIRED';
    } else if (status !== 'GRANTED') {
      canDownload = false;
      blockedReason = `ENTITLEMENT_${status}`;
    } else if (maxDownloads !== null && downloadCount >= maxDownloads) {
      canDownload = false;
      blockedReason = 'ENTITLEMENT_DOWNLOAD_LIMIT_EXCEEDED';
    }

    return {
      can_download: canDownload,
      blocked_reason: blockedReason,
      remaining_downloads:
        maxDownloads !== null ? Math.max(maxDownloads - downloadCount, 0) : null,
    };
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
    if (paymentStatus === 'PARTIALLY_REFUNDED') {
      return currentOrderStatus === 'PENDING'
        ? 'CONFIRMED'
        : currentOrderStatus;
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

  private calculateShippingAmountByPolicy(input: {
    shippingRequired: boolean;
    subtotalAmount: number;
    postcode: string | null;
  }): number {
    if (!input.shippingRequired) {
      return 0;
    }

    const baseFee = BASE_SHIPPING_FEE;
    const extraFee = this.resolveExtraShippingFeeByPostcode(input.postcode);
    return baseFee + extraFee;
  }

  private resolveExtraShippingFeeByPostcode(postcode: string | null): number {
    if (!postcode) {
      return 0;
    }

    const postcodeNumber = Number.parseInt(postcode, 10);
    if (!Number.isInteger(postcodeNumber)) {
      return 0;
    }

    if (this.isPostcodeInRanges(postcodeNumber, JEJU_POSTCODE_RANGES)) {
      return JEJU_EXTRA_FEE;
    }
    if (this.isPostcodeInRanges(postcodeNumber, ISLAND_POSTCODE_RANGES)) {
      return ISLAND_EXTRA_FEE;
    }

    return 0;
  }

  private isPostcodeInRanges(
    postcodeNumber: number,
    ranges: ReadonlyArray<readonly [number, number]>,
  ): boolean {
    return ranges.some(
      ([start, end]) => postcodeNumber >= start && postcodeNumber <= end,
    );
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

  private readNonNegativeIntegerEnv(
    key: string,
    defaultValue: number,
  ): number {
    const raw = process.env[key];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return defaultValue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return defaultValue;
    }

    return parsed;
  }

  private normalizeDigitalDownloadUrlTtlSeconds(): number {
    const ttlSeconds = this.readNonNegativeIntegerEnv(
      'V2_DIGITAL_DOWNLOAD_URL_TTL_SECONDS',
      60,
    );
    return Math.min(Math.max(ttlSeconds, 5), 300);
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

  private normalizeOptionalHttpUrl(value: unknown): string | null {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return null;
    }
    if (!/^https?:\/\//i.test(normalized)) {
      return null;
    }
    return normalized;
  }

  private normalizeOptionalPostcode(value: unknown): string | null {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return null;
    }

    const digitsOnly = normalized.replace(/\D/g, '');
    if (!/^\d{5}$/.test(digitsOnly)) {
      return null;
    }

    return digitsOnly;
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

  private normalizeOptionalPositiveInteger(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = this.normalizeInteger(value, 'optional_positive_integer');
    if (parsed <= 0) {
      return null;
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

  private normalizeNonNegativeNumber(
    value: unknown,
    fieldName: string,
  ): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < 0) {
        throw new ApiException(
          `${fieldName}는 0 이상의 숫자여야 합니다`,
          400,
          'VALIDATION_ERROR',
        );
      }
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        if (parsed < 0) {
          throw new ApiException(
            `${fieldName}는 0 이상의 숫자여야 합니다`,
            400,
            'VALIDATION_ERROR',
          );
        }
        return parsed;
      }
    }

    throw new ApiException(
      `${fieldName}는 숫자여야 합니다`,
      400,
      'VALIDATION_ERROR',
    );
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
