import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Enums, Tables } from '../types/database';

const SHIPPING_FEE = 3500;

type Order = Tables<'orders'>;
type OrderItem = Tables<'order_items'>;
type OrderStatus = Enums<'order_status'>;
type OrderItemStatus = Enums<'order_item_status'>;
type Shipment = Tables<'shipments'>;

interface CreateOrderInput {
  userId: string;
  items: Array<{
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

export interface OrderWithDetails extends Order {
  items: Array<
    OrderItem & {
      product?: {
        id: string;
        name: string;
        type: Enums<'product_type'>;
        digital_file_url?: string | null;
        sample_audio_url?: string | null;
      };
      shipment?: {
        id: string;
        carrier: string | null;
        tracking_number: string | null;
        shipping_status: string | null;
        shipped_at: string | null;
        delivered_at: string | null;
      } | null;
    }
  >;
}

@Injectable()
export class OrdersService {
  async createOrder(input: CreateOrderInput): Promise<OrderWithDetails> {
    const supabase = getSupabaseClient();
    const {
      userId,
      items,
      buyerName,
      buyerEmail,
      buyerPhone,
      shippingName,
      shippingPhone,
      shippingMainAddress,
      shippingDetailAddress,
      shippingMemo,
    } = input;

    if (!items || items.length === 0) {
      throw new ApiException('주문 상품이 없습니다', 400, 'VALIDATION_ERROR');
    }

    const productIds = items.map((item) => item.productId);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, stock, type')
      .in('id', productIds);

    if (productsError || !products) {
      throw new ApiException(
        '상품 정보 조회 실패',
        500,
        'PRODUCTS_FETCH_FAILED',
      );
    }

    for (const item of items) {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new ApiException(
          '올바른 주문 상품 정보를 입력해주세요',
          400,
          'VALIDATION_ERROR',
        );
      }

      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );
      if (!product) {
        throw new ApiException(
          `상품을 찾을 수 없습니다: ${item.productId}`,
          404,
          'PRODUCT_NOT_FOUND',
        );
      }

      if (
        product.type === 'PHYSICAL_GOODS' &&
        product.stock !== null &&
        product.stock < item.quantity
      ) {
        throw new ApiException(
          `재고가 부족합니다: ${product.name}`,
          400,
          'INSUFFICIENT_STOCK',
        );
      }
    }

    let totalPrice = 0;
    for (const item of items) {
      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );
      if (product) {
        totalPrice += product.price * item.quantity;
      }
    }

    const hasPhysicalProduct = products.some(
      (product) =>
        product.type === 'PHYSICAL_GOODS' || product.type === 'BUNDLE',
    );

    if (hasPhysicalProduct) {
      totalPrice += SHIPPING_FEE;
    }

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const orderStatus: OrderStatus = totalPrice === 0 ? 'DONE' : 'PENDING';

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        order_number: orderNumber,
        total_price: totalPrice,
        status: orderStatus,
        buyer_name: buyerName || null,
        buyer_email: buyerEmail || null,
        buyer_phone: buyerPhone || null,
        shipping_name: shippingName || null,
        shipping_phone: shippingPhone || null,
        shipping_main_address: shippingMainAddress || null,
        shipping_detail_address: shippingDetailAddress || null,
        shipping_memo: shippingMemo || null,
      })
      .select('*')
      .maybeSingle();

    if (orderError || !order) {
      throw new ApiException('주문 생성 실패', 500, 'ORDER_CREATE_FAILED');
    }

    const orderItems = items.map((item) => {
      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );
      const itemStatus: OrderItemStatus =
        product?.price === 0 ? 'COMPLETED' : 'PENDING';

      return {
        order_id: order.id,
        product_id: item!.productId,
        product_name: product!.name,
        product_type: product!.type,
        quantity: item!.quantity,
        price_snapshot: product!.price,
        item_status: itemStatus,
      };
    });

    const { data: createdItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)
      .select('*');

    if (itemsError || !createdItems) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw new ApiException(
        '주문 항목 생성 실패',
        500,
        'ORDER_ITEMS_CREATE_FAILED',
      );
    }

    for (const item of items) {
      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );
      if (
        product &&
        product.type === 'PHYSICAL_GOODS' &&
        product.stock !== null &&
        product.stock >= item.quantity
      ) {
        await supabase
          .from('products')
          .update({ stock: product.stock - item.quantity })
          .eq('id', item.productId);
      }
    }

    return {
      ...order,
      items: createdItems as OrderWithDetails['items'],
    };
  }

  async getUserOrders(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{ orders: OrderWithDetails[]; total: number }> {
    const supabase = getSupabaseClient();
    const { page = 1, limit = 20 } = options;

    let query = supabase
      .from('orders')
      .select(
        `
        *,
        items:order_items (
          *,
          product:products (
            id,
            name,
            type
          )
        )
      `,
        { count: 'exact' },
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new ApiException('주문 목록 조회 실패', 500, 'ORDERS_FETCH_FAILED');
    }

    return {
      orders: (data || []) as OrderWithDetails[],
      total: count || 0,
    };
  }

  async getAllOrders(
    options: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<{ orders: OrderWithDetails[]; total: number }> {
    const supabase = getSupabaseClient();
    const { page = 1, limit = 50, status, dateFrom, dateTo } = options;

    let query = supabase
      .from('orders')
      .select(
        `
        *,
        items:order_items (
          *,
          product:products (
            id,
            name,
            type
          )
        )
      `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new ApiException('주문 목록 조회 실패', 500, 'ORDERS_FETCH_FAILED');
    }

    return {
      orders: (data || []) as OrderWithDetails[],
      total: count || 0,
    };
  }

  async getOrderById(
    orderId: string,
    userId?: string,
  ): Promise<OrderWithDetails> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        items:order_items (
          *,
          product:products (
            id,
            name,
            type,
            digital_file_url,
            sample_audio_url
          ),
          shipment:shipments (
            id,
            carrier,
            tracking_number,
            shipping_status,
            shipped_at,
            delivered_at
          )
        )
      `,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (!data) {
      throw new ApiException('주문을 찾을 수 없습니다', 404, 'ORDER_NOT_FOUND');
    }

    if (error) {
      throw new ApiException('주문 조회 실패', 500, 'ORDER_FETCH_FAILED');
    }

    if (userId && data.user_id !== userId) {
      throw new ApiException('주문 조회 권한이 없습니다', 403, 'UNAUTHORIZED');
    }

    const normalizedItems = ((data as any).items || []).map((item: any) => ({
      ...item,
      shipment: Array.isArray(item.shipment)
        ? item.shipment[0] || null
        : item.shipment || null,
    }));

    return {
      ...(data as any),
      items: normalizedItems,
    } as OrderWithDetails;
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
  ): Promise<Order> {
    const supabase = getSupabaseClient();

    const { data: orderData, error: existingOrderError } = await supabase
      .from('orders')
      .select(
        `
        *,
        items:order_items (
          *,
          product:products (
            id,
            name,
            type
          )
        )
      `,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (existingOrderError) {
      throw new ApiException(
        '주문 상태 변경 실패',
        500,
        'ORDER_STATUS_UPDATE_FAILED',
      );
    }

    if (!orderData) {
      throw new ApiException('주문을 찾을 수 없습니다', 404, 'ORDER_NOT_FOUND');
    }

    const { data: updatedOrder, error: orderUpdateError } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (orderUpdateError || !updatedOrder) {
      throw new ApiException(
        '주문 상태 변경 실패',
        500,
        'ORDER_STATUS_UPDATE_FAILED',
      );
    }

    if (newStatus === 'PAID') {
      const items = ((orderData as any).items || []) as Array<{
        id: string;
        product?: { type?: string };
      }>;
      const digitalItems = items.filter(
        (item) => item.product?.type === 'VOICE_PACK',
      );
      const physicalItems = items.filter(
        (item) =>
          item.product?.type === 'PHYSICAL_GOODS' ||
          item.product?.type === 'BUNDLE',
      );

      if (digitalItems.length > 0) {
        await this.updateItemsStatus(
          orderId,
          digitalItems.map((item) => item.id),
          'COMPLETED',
        );
      }

      if (physicalItems.length > 0) {
        await this.updateItemsStatus(
          orderId,
          physicalItems.map((item) => item.id),
          'READY',
        );
      }

      return updatedOrder;
    }

    const orderItemStatus = this.mapOrderStatusToOrderItemStatus(newStatus);
    await this.updateAllItemsStatus(orderId, orderItemStatus);

    return updatedOrder;
  }

  async cancelOrder(
    orderId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const supabase = getSupabaseClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('status, user_id, order_number')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      throw new ApiException('주문 조회 실패', 500, 'ORDER_FETCH_FAILED');
    }

    if (!order) {
      throw new ApiException('주문을 찾을 수 없습니다', 404, 'ORDER_NOT_FOUND');
    }

    if (order.user_id !== userId) {
      throw new ApiException('주문 취소 권한이 없습니다', 403, 'UNAUTHORIZED');
    }

    if (order.status !== 'PENDING') {
      throw new ApiException(
        '입금대기 상태의 주문만 취소할 수 있습니다',
        400,
        'ORDER_CANNOT_CANCEL',
      );
    }

    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (itemsError) {
      throw new ApiException(
        '주문 아이템 삭제 실패',
        500,
        'ORDER_ITEMS_DELETE_FAILED',
      );
    }

    const { error: orderDeleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (orderDeleteError) {
      throw new ApiException('주문 취소 실패', 500, 'ORDER_CANCEL_FAILED');
    }

    return {
      success: true,
      message: `주문 ${order.order_number}이(가) 취소되었습니다`,
    };
  }

  async generateDownloadLink(
    orderId: string,
    itemId: string,
    userId: string,
  ): Promise<{
    downloadUrl: string;
    expiresIn: number;
    expiresAt: string;
    filename: string;
  }> {
    const supabase = getSupabaseClient();

    const { data: orderItem, error } = await supabase
      .from('order_items')
      .select(
        `
        *,
        order:orders (
          id,
          user_id,
          status
        ),
        product:products (
          id,
          name,
          type,
          digital_file_url
        )
      `,
      )
      .eq('id', itemId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (error || !orderItem) {
      throw new ApiException(
        '주문 아이템을 찾을 수 없습니다',
        404,
        'ORDER_ITEM_NOT_FOUND',
      );
    }

    const order = (orderItem as any).order as {
      user_id: string;
      status: OrderStatus;
    };
    const product = (orderItem as any).product as {
      id: string;
      name: string;
      type: Enums<'product_type'>;
      digital_file_url: string | null;
    };

    if (!order || !product) {
      throw new ApiException(
        '주문 아이템 정보가 올바르지 않습니다',
        500,
        'ORDER_ITEM_INVALID',
      );
    }

    if (order.user_id !== userId) {
      throw new ApiException('다운로드 권한이 없습니다', 403, 'UNAUTHORIZED');
    }

    const validStatuses: OrderStatus[] = ['PAID', 'MAKING', 'SHIPPING', 'DONE'];
    if (!validStatuses.includes(order.status)) {
      throw new ApiException(
        '결제가 완료된 주문만 다운로드할 수 있습니다',
        403,
        'PAYMENT_NOT_COMPLETED',
      );
    }

    if (product.type !== 'VOICE_PACK') {
      throw new ApiException(
        '디지털 상품만 다운로드할 수 있습니다',
        400,
        'NOT_DIGITAL_PRODUCT',
      );
    }

    if (!product.digital_file_url) {
      throw new ApiException(
        '다운로드 가능한 파일이 없습니다',
        404,
        'DIGITAL_FILE_NOT_FOUND',
      );
    }

    const filename = `${product.name.replace(/[^a-zA-Z0-9가-힣\s]/g, '_')}.zip`;
    const downloadUrl = product.digital_file_url;
    const expiresIn = 3600;

    const nextDownloadCount = ((orderItem as any).download_count || 0) + 1;
    await supabase
      .from('order_items')
      .update({
        download_count: nextDownloadCount,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    return {
      downloadUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      filename,
    };
  }

  async resolveOrderIdForItem(itemId: string): Promise<string> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('id', itemId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '주문 아이템 조회 실패',
        500,
        'ORDER_ITEM_FETCH_FAILED',
      );
    }

    if (!data) {
      throw new ApiException(
        '주문 아이템을 찾을 수 없습니다',
        404,
        'ORDER_ITEM_NOT_FOUND',
      );
    }

    return data.order_id;
  }

  async getMyVoicePacks(userId: string): Promise<
    Array<{
      itemId: string;
      orderId: string;
      orderNumber: string | undefined;
      productId: string | undefined;
      productName: string | undefined;
      purchasedAt: string | undefined;
      downloadCount: number;
      lastDownloadedAt: string | null;
      canDownload: boolean;
    }>
  > {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('order_items')
      .select(
        `
        id,
        order_id,
        download_count,
        last_downloaded_at,
        product:products (
          id,
          name,
          type,
          digital_file_url,
          sample_audio_url
        ),
        order:orders (
          id,
          order_number,
          status,
          created_at,
          user_id
        )
      `,
      )
      .eq('order.user_id', userId)
      .in('order.status', ['PAID', 'DONE'])
      .eq('product.type', 'VOICE_PACK')
      .order('order.created_at', { ascending: false });

    if (error) {
      throw new ApiException(
        '보이스팩 목록 조회 실패',
        500,
        'VOICEPACKS_FETCH_FAILED',
      );
    }

    return ((data || []) as any[]).map((item) => ({
      itemId: item.id,
      orderId: item.order_id,
      orderNumber: item.order?.order_number,
      productId: item.product?.id,
      productName: item.product?.name,
      purchasedAt: item.order?.created_at,
      downloadCount: item.download_count || 0,
      lastDownloadedAt: item.last_downloaded_at,
      canDownload: true,
    }));
  }

  async updateItemStatus(
    itemId: string,
    newStatus: OrderItemStatus,
  ): Promise<OrderItem> {
    const supabase = getSupabaseClient();

    const { data: existingItem, error: existingItemError } = await supabase
      .from('order_items')
      .select('id')
      .eq('id', itemId)
      .maybeSingle();

    if (existingItemError) {
      throw new ApiException(
        '주문 상품 상태 변경 실패',
        500,
        'ITEM_STATUS_UPDATE_FAILED',
      );
    }

    if (!existingItem) {
      throw new ApiException(
        '주문 상품을 찾을 수 없습니다',
        404,
        'ORDER_ITEM_NOT_FOUND',
      );
    }

    const { data, error } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .eq('id', itemId)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '주문 상품 상태 변경 실패',
        500,
        'ITEM_STATUS_UPDATE_FAILED',
      );
    }

    return data;
  }

  async updateAllItemsStatus(
    orderId: string,
    newStatus: OrderItemStatus,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .eq('order_id', orderId);

    if (error) {
      throw new ApiException(
        '주문 상품 상태 일괄 변경 실패',
        500,
        'ITEMS_STATUS_UPDATE_FAILED',
      );
    }
  }

  async updateItemsStatus(
    orderId: string,
    itemIds: string[],
    newStatus: OrderItemStatus,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .eq('order_id', orderId)
      .in('id', itemIds);

    if (error) {
      throw new ApiException(
        '주문 상품 상태 변경 실패',
        500,
        'ITEMS_STATUS_UPDATE_FAILED',
      );
    }
  }

  async getShipmentInfo(
    orderItemId: string,
    userId?: string,
  ): Promise<Shipment | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('shipments')
      .select(
        `
        *,
        order_item:order_items (
          id,
          order_id,
          order:orders (
            id,
            user_id
          )
        )
      `,
      )
      .eq('order_item_id', orderItemId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '배송 정보 조회 실패',
        500,
        'SHIPMENT_FETCH_FAILED',
      );
    }

    if (!data) {
      return null;
    }

    if (userId) {
      const ownerUserId = (data as any).order_item?.order?.user_id as
        | string
        | undefined;
      if (ownerUserId !== userId) {
        throw new ApiException(
          '배송 정보 조회 권한이 없습니다',
          403,
          'UNAUTHORIZED',
        );
      }
    }

    return data as Shipment;
  }

  async getShipmentTracking(
    orderItemId: string,
    userId: string,
  ): Promise<{
    carrier: string | null;
    trackingNumber: string | null;
    shippingStatus: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null> {
    const shipment = await this.getShipmentInfo(orderItemId, userId);

    if (!shipment) {
      return null;
    }

    return {
      carrier: shipment.carrier,
      trackingNumber: shipment.tracking_number,
      shippingStatus: shipment.shipping_status || 'PREPARING',
      shippedAt: shipment.shipped_at,
      deliveredAt: shipment.delivered_at,
    };
  }

  async getLegacyDownloadRedirect(
    productId: string,
    userId: string,
  ): Promise<string> {
    const supabase = getSupabaseClient();

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, digital_file_url')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }

    if (!product) {
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    if (!product.digital_file_url) {
      throw new ApiException(
        '다운로드 링크가 설정되지 않았습니다',
        400,
        'DIGITAL_FILE_NOT_FOUND',
      );
    }

    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select(
        `
        id,
        item_status,
        orders!inner (
          id,
          user_id,
          status
        )
      `,
      )
      .eq('product_id', productId)
      .eq('orders.user_id', userId)
      .in('orders.status', ['DONE'])
      .in('item_status', ['COMPLETED']);

    if (orderItemsError) {
      throw new ApiException('주문 내역 조회 실패', 500, 'ORDER_FETCH_FAILED');
    }

    if (!orderItems || orderItems.length === 0) {
      throw new ApiException(
        '이 상품을 구매하지 않았습니다',
        403,
        'UNAUTHORIZED',
      );
    }

    return product.digital_file_url;
  }

  private mapOrderStatusToOrderItemStatus(
    status: OrderStatus,
  ): OrderItemStatus {
    if (status === 'MAKING') {
      return 'PROCESSING';
    }
    if (status === 'READY_TO_SHIP') {
      return 'READY';
    }
    if (status === 'SHIPPING') {
      return 'SHIPPED';
    }
    if (status === 'DONE') {
      return 'COMPLETED';
    }

    return 'PENDING';
  }
}
