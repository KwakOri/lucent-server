import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { CommerceNotificationsService } from '../notifications/commerce-notifications.service';
import { getSupabaseClient } from '../supabase/supabase.client';

type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'CANCELED';
type FulfillmentExecutionStatus =
  | 'REQUESTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';
type ShipmentStatus =
  | 'READY_TO_PACK'
  | 'PACKING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELED';
type DigitalEntitlementStatus =
  | 'PENDING'
  | 'GRANTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'FAILED';
type DigitalAccessType = 'DOWNLOAD' | 'STREAM' | 'LICENSE';
type DigitalEntitlementEventType =
  | 'GRANTED'
  | 'DOWNLOADED'
  | 'REISSUED'
  | 'REVOKED'
  | 'EXPIRED';

interface ReserveInventoryInput {
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

interface TransitionReservationInput {
  reason?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface InventoryLevelRow {
  id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

interface CreateShipmentInput {
  fulfillment_id?: string;
  carrier?: string | null;
  service_level?: string | null;
  tracking_no?: string | null;
  tracking_url?: string | null;
  label_ref?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ShipmentTransitionInput {
  metadata?: Record<string, unknown> | null;
}

interface RegisterShipmentTrackingInput extends ShipmentTransitionInput {
  carrier?: string | null;
  service_level?: string | null;
  tracking_no?: string;
  tracking_url?: string | null;
  label_ref?: string | null;
}

interface GrantEntitlementInput {
  order_id?: string;
  order_item_id?: string;
  digital_asset_id?: string | null;
  fulfillment_id?: string | null;
  access_type?: DigitalAccessType;
  token_hash?: string | null;
  token_reference?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface ReissueEntitlementInput {
  token_hash?: string | null;
  token_reference?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface RevokeEntitlementInput {
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface LogEntitlementDownloadInput {
  metadata?: Record<string, unknown> | null;
}

interface GenerateFulfillmentPlanInput {
  order_id?: string;
  stock_location_id?: string | null;
  shipping_profile_id?: string | null;
  shipping_method_id?: string | null;
  shipping_zone_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface EvaluateShippingFeeInput {
  shipping_profile_id?: string | null;
  shipping_method_id?: string;
  shipping_zone_id?: string;
  order_amount?: number | null;
  total_weight?: number | null;
  item_count?: number | null;
  currency_code?: string | null;
  at?: string | null;
}

interface OrchestrateMixedOrderInput extends GenerateFulfillmentPlanInput {
  reserve_inventory?: boolean;
  grant_entitlement?: boolean;
  provider_type?: string | null;
}

interface OpsLimitInput {
  limit?: string | number | null;
}

interface CutoverCheckInput {
  order_id?: string;
  reserve_inventory?: boolean;
  grant_entitlement?: boolean;
}

@Injectable()
export class V2FulfillmentService {
  private readonly logger = new Logger(V2FulfillmentService.name);

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  constructor(
    private readonly commerceNotificationsService: CommerceNotificationsService,
  ) {}

  async reserveInventory(input: ReserveInventoryInput): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
    const order = await this.fetchOrderForCutover(orderId);
    const orderItemId = this.requireUuid(
      input.order_item_id,
      'order_item_id는 필수입니다',
    );
    const variantId = this.requireUuid(
      input.variant_id,
      'variant_id는 필수입니다',
    );
    const locationId = this.requireUuid(
      input.location_id,
      'location_id는 필수입니다',
    );
    const fulfillmentGroupId = this.normalizeOptionalUuid(
      input.fulfillment_group_id,
    );
    const quantity = this.normalizePositiveInteger(input.quantity, 'quantity');
    const reason = this.normalizeOptionalText(input.reason);
    const idempotencyKey = this.normalizeOptionalText(input.idempotency_key);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const expiresAt = this.normalizeOptionalIsoDateTime(input.expires_at);

    this.assertCutoverPolicyOrThrow({
      order,
      orderItems: [
        {
          variant_id: variantId,
          requires_shipping_snapshot: true,
          fulfillment_type_snapshot: 'PHYSICAL',
        },
      ],
      reserveInventory: true,
      grantEntitlement: false,
    });

    if (idempotencyKey) {
      const existing =
        await this.findReservationByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          idempotent_replayed: true,
          reservation: existing,
        };
      }
    }

    const orderItem = await this.getOrderItemOrThrow(orderItemId, orderId);
    if (orderItem.variant_id && orderItem.variant_id !== variantId) {
      throw new ApiException(
        'order_item과 variant_id가 일치하지 않습니다',
        400,
        'RESERVATION_VARIANT_MISMATCH',
      );
    }

    const inventoryLevel = await this.getInventoryLevelOrThrow(
      variantId,
      locationId,
    );
    if (inventoryLevel.available_quantity < quantity) {
      throw new ApiException(
        `가용 재고가 부족합니다 (available=${inventoryLevel.available_quantity}, requested=${quantity})`,
        409,
        'INVENTORY_NOT_ENOUGH',
      );
    }

    const now = new Date().toISOString();
    const { data: created, error: insertError } = await this.supabase
      .from('v2_inventory_reservations')
      .insert({
        variant_id: variantId,
        location_id: locationId,
        order_id: orderId,
        order_item_id: orderItemId,
        fulfillment_group_id: fulfillmentGroupId,
        quantity,
        status: 'ACTIVE' as ReservationStatus,
        reason,
        idempotency_key: idempotencyKey,
        expires_at: expiresAt,
        metadata,
      })
      .select('*')
      .maybeSingle();

    if (insertError) {
      if (
        idempotencyKey &&
        insertError.code === '23505' &&
        insertError.message?.includes('uq_v2_inventory_reservations_idempotency_key')
      ) {
        const existing =
          await this.findReservationByIdempotencyKey(idempotencyKey);
        if (existing) {
          return { idempotent_replayed: true, reservation: existing };
        }
      }

      throw new ApiException(
        '재고 예약 생성 실패',
        500,
        'INVENTORY_RESERVATION_CREATE_FAILED',
      );
    }
    if (!created) {
      throw new ApiException(
        '재고 예약 생성 결과가 비어 있습니다',
        500,
        'INVENTORY_RESERVATION_CREATE_FAILED',
      );
    }

    try {
      const nextReserved = inventoryLevel.reserved_quantity + quantity;
      await this.updateInventoryLevelWithOptimisticLock(inventoryLevel, {
        on_hand_quantity: inventoryLevel.on_hand_quantity,
        reserved_quantity: nextReserved,
        updated_reason: 'RESERVE',
      });
    } catch (error) {
      await this.supabase
        .from('v2_inventory_reservations')
        .delete()
        .eq('id', created.id);

      if (error instanceof ApiException) {
        throw error;
      }
      throw new ApiException(
        '재고 수량 반영에 실패했습니다',
        500,
        'INVENTORY_LEVEL_UPDATE_FAILED',
      );
    }

    const reservation = await this.fetchReservationById(created.id);
    return {
      idempotent_replayed: false,
      reserved_at: now,
      reservation,
    };
  }

  async releaseReservation(
    reservationId: string,
    input: TransitionReservationInput,
  ): Promise<any> {
    return this.transitionReservation(reservationId, 'RELEASED', input);
  }

  async consumeReservation(
    reservationId: string,
    input: TransitionReservationInput,
  ): Promise<any> {
    return this.transitionReservation(reservationId, 'CONSUMED', input);
  }

  async getReservationById(reservationId: string): Promise<any> {
    const normalized = this.requireUuid(
      reservationId,
      'reservation_id가 올바르지 않습니다',
    );
    return this.fetchReservationById(normalized);
  }

  async generateFulfillmentPlan(
    input: GenerateFulfillmentPlanInput,
  ): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
    const order = await this.fetchOrderForCutover(orderId);
    const stockLocationId = this.normalizeOptionalUuid(input.stock_location_id);
    const shippingProfileId = this.normalizeOptionalUuid(input.shipping_profile_id);
    const shippingMethodId = this.normalizeOptionalUuid(input.shipping_method_id);
    const shippingZoneId = this.normalizeOptionalUuid(input.shipping_zone_id);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const { data: orderItems, error: orderItemsError } = await this.supabase
      .from('v2_order_items')
      .select(
        'id, quantity, line_type, line_status, fulfillment_type_snapshot, requires_shipping_snapshot',
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (orderItemsError) {
      throw new ApiException(
        'order_item 조회 실패',
        500,
        'FULFILLMENT_PLAN_ORDER_ITEMS_FETCH_FAILED',
      );
    }
    if (!orderItems || orderItems.length === 0) {
      throw new ApiException(
        'fulfillment plan 대상 order_item이 없습니다',
        404,
        'FULFILLMENT_PLAN_ORDER_ITEMS_NOT_FOUND',
      );
    }

    const targetItems = orderItems.filter((item: any) =>
      this.isFulfillmentActionableOrderItem(item),
    );
    if (targetItems.length === 0) {
      throw new ApiException(
        'plan 생성 대상 line이 없습니다',
        409,
        'FULFILLMENT_PLAN_EMPTY',
      );
    }

    const { data: existingGroups, error: existingGroupsError } = await this.supabase
      .from('v2_fulfillment_groups')
      .select('*')
      .eq('order_id', orderId);

    if (existingGroupsError) {
      throw new ApiException(
        '기존 fulfillment group 조회 실패',
        500,
        'FULFILLMENT_GROUP_FETCH_FAILED',
      );
    }

    const groupByKind = new Map<string, any>();
    (existingGroups || []).forEach((group: any) => {
      if (group.status !== 'CANCELED' && !groupByKind.has(group.kind)) {
        groupByKind.set(group.kind, group);
      }
    });

    const ensureGroup = async (kind: 'DIGITAL' | 'SHIPMENT'): Promise<any> => {
      const existing = groupByKind.get(kind);
      if (existing) {
        return existing;
      }

      const { data: created, error: createError } = await this.supabase
        .from('v2_fulfillment_groups')
        .insert({
          order_id: orderId,
          kind,
          status: 'PLANNED',
          stock_location_id: kind === 'SHIPMENT' ? stockLocationId : null,
          shipping_profile_id: kind === 'SHIPMENT' ? shippingProfileId : null,
          shipping_method_id: kind === 'SHIPMENT' ? shippingMethodId : null,
          shipping_zone_id: kind === 'SHIPMENT' ? shippingZoneId : null,
          metadata,
        })
        .select('*')
        .maybeSingle();

      if (createError) {
        throw new ApiException(
          `${kind} fulfillment group 생성 실패`,
          500,
          'FULFILLMENT_GROUP_CREATE_FAILED',
        );
      }
      if (!created) {
        throw new ApiException(
          `${kind} fulfillment group 생성 결과가 비어 있습니다`,
          500,
          'FULFILLMENT_GROUP_CREATE_FAILED',
        );
      }

      groupByKind.set(kind, created);
      return created;
    };

    let hasDigital = false;
    let hasShipment = false;
    for (const item of targetItems) {
      if (this.isOrderItemDigital(item)) {
        hasDigital = true;
      } else {
        hasShipment = true;
      }
    }

    this.assertCutoverPolicyOrThrow({
      order,
      orderItems: targetItems,
      reserveInventory: hasShipment,
      grantEntitlement: hasDigital,
    });

    if (hasDigital) {
      await ensureGroup('DIGITAL');
    }
    if (hasShipment) {
      await ensureGroup('SHIPMENT');
    }

    const groups = Array.from(groupByKind.values());
    const groupIds = groups.map((group) => group.id);
    const { data: existingGroupItems, error: existingGroupItemsError } =
      await this.supabase
        .from('v2_fulfillment_group_items')
        .select('fulfillment_group_id, order_item_id')
        .in('fulfillment_group_id', groupIds);

    if (existingGroupItemsError) {
      throw new ApiException(
        '기존 fulfillment group item 조회 실패',
        500,
        'FULFILLMENT_GROUP_ITEM_FETCH_FAILED',
      );
    }

    const existingKeys = new Set<string>();
    (existingGroupItems || []).forEach((item: any) => {
      existingKeys.add(`${item.fulfillment_group_id}:${item.order_item_id}`);
    });

    const rowsToInsert: Array<Record<string, unknown>> = [];
    for (const item of targetItems) {
      const kind = this.isOrderItemDigital(item) ? 'DIGITAL' : 'SHIPMENT';
      const group = groupByKind.get(kind);
      if (!group) {
        continue;
      }
      const key = `${group.id}:${item.id}`;
      if (existingKeys.has(key)) {
        continue;
      }
      rowsToInsert.push({
        fulfillment_group_id: group.id,
        order_item_id: item.id,
        quantity_planned: this.normalizePositiveInteger(item.quantity, 'quantity'),
        quantity_fulfilled: 0,
        status: 'PLANNED',
        metadata: {},
      });
    }

    if (rowsToInsert.length > 0) {
      const { error: insertGroupItemsError } = await this.supabase
        .from('v2_fulfillment_group_items')
        .insert(rowsToInsert);

      if (insertGroupItemsError) {
        throw new ApiException(
          'fulfillment group item 생성 실패',
          500,
          'FULFILLMENT_GROUP_ITEM_CREATE_FAILED',
        );
      }
    }

    const refreshedGroups = await this.fetchFulfillmentGroupsByOrderId(orderId);
    return {
      order_id: orderId,
      groups: refreshedGroups,
      summary: {
        group_count: refreshedGroups.length,
        linked_item_count: rowsToInsert.length,
        has_digital: hasDigital,
        has_shipment: hasShipment,
      },
    };
  }

  async evaluateShippingFee(input: EvaluateShippingFeeInput): Promise<any> {
    const shippingMethodId = this.requireUuid(
      input.shipping_method_id,
      'shipping_method_id는 필수입니다',
    );
    const shippingZoneId = this.requireUuid(
      input.shipping_zone_id,
      'shipping_zone_id는 필수입니다',
    );
    const shippingProfileId = this.normalizeOptionalUuid(input.shipping_profile_id);

    const orderAmount = this.normalizeOptionalNonNegativeInteger(
      input.order_amount,
      'order_amount',
    );
    const totalWeight = this.normalizeOptionalNonNegativeInteger(
      input.total_weight,
      'total_weight',
    );
    const itemCount = this.normalizeOptionalNonNegativeInteger(
      input.item_count,
      'item_count',
    );
    const currencyCode = this.normalizeCurrencyCode(input.currency_code || 'KRW');
    const at = this.normalizeOptionalIsoDateTime(input.at) || new Date().toISOString();

    const { data: rules, error: rulesError } = await this.supabase
      .from('v2_shipping_rate_rules')
      .select('*')
      .eq('shipping_method_id', shippingMethodId)
      .eq('shipping_zone_id', shippingZoneId)
      .eq('is_active', true)
      .eq('currency_code', currencyCode);

    if (rulesError) {
      throw new ApiException(
        'shipping rule 조회 실패',
        500,
        'SHIPPING_RATE_RULE_FETCH_FAILED',
      );
    }

    const baseTime = new Date(at).getTime();
    const filtered = (rules || []).filter((rule: any) => {
      if (
        shippingProfileId &&
        rule.shipping_profile_id &&
        rule.shipping_profile_id !== shippingProfileId
      ) {
        return false;
      }
      if (!shippingProfileId && rule.shipping_profile_id) {
        return false;
      }

      const startsAt = rule.starts_at ? new Date(rule.starts_at).getTime() : null;
      const endsAt = rule.ends_at ? new Date(rule.ends_at).getTime() : null;
      if (startsAt !== null && startsAt > baseTime) {
        return false;
      }
      if (endsAt !== null && endsAt < baseTime) {
        return false;
      }

      return this.isShippingRuleConditionMatched(rule, {
        orderAmount,
        totalWeight,
        itemCount,
      });
    });

    const sorted = filtered.sort((a: any, b: any) => {
      const profilePriorityA =
        shippingProfileId && a.shipping_profile_id === shippingProfileId ? 0 : 1;
      const profilePriorityB =
        shippingProfileId && b.shipping_profile_id === shippingProfileId ? 0 : 1;
      if (profilePriorityA !== profilePriorityB) {
        return profilePriorityA - profilePriorityB;
      }

      const priorityA = typeof a.priority === 'number' ? a.priority : 999_999;
      const priorityB = typeof b.priority === 'number' ? b.priority : 999_999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const createdAtA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const createdAtB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return createdAtA - createdAtB;
    });

    const matchedRule = sorted[0] || null;
    const amount =
      matchedRule && typeof matchedRule.amount === 'number'
        ? matchedRule.amount
        : 0;

    return {
      shipping_method_id: shippingMethodId,
      shipping_zone_id: shippingZoneId,
      shipping_profile_id: shippingProfileId,
      currency_code: currencyCode,
      amount,
      matched_rule: matchedRule
        ? {
            id: matchedRule.id,
            condition_type: matchedRule.condition_type,
            min_value: matchedRule.min_value,
            max_value: matchedRule.max_value,
            amount: matchedRule.amount,
            priority: matchedRule.priority,
          }
        : null,
      evaluated_at: at,
    };
  }

  async getOpsQueueSummary(input: OpsLimitInput): Promise<any> {
    const limit = this.normalizeOpsLimit(input.limit);

    const { data: groups, error: groupsError } = await this.supabase
      .from('v2_fulfillment_groups')
      .select('id, order_id, kind, status, planned_at, fulfilled_at, created_at')
      .order('created_at', { ascending: false });

    if (groupsError) {
      throw new ApiException(
        'fulfillment group queue 조회 실패',
        500,
        'FULFILLMENT_GROUP_QUEUE_FETCH_FAILED',
      );
    }

    const { data: fulfillments, error: fulfillmentsError } = await this.supabase
      .from('v2_fulfillments')
      .select('id, fulfillment_group_id, kind, status, requested_at, completed_at')
      .order('requested_at', { ascending: false });

    if (fulfillmentsError) {
      throw new ApiException(
        'fulfillment queue 조회 실패',
        500,
        'FULFILLMENT_QUEUE_FETCH_FAILED',
      );
    }

    const { data: shipments, error: shipmentsError } = await this.supabase
      .from('v2_shipments')
      .select(
        'id, fulfillment_id, status, carrier, tracking_no, shipped_at, delivered_at, created_at',
      )
      .order('created_at', { ascending: false });

    if (shipmentsError) {
      throw new ApiException(
        'shipment queue 조회 실패',
        500,
        'SHIPMENT_QUEUE_FETCH_FAILED',
      );
    }

    const { data: entitlements, error: entitlementsError } = await this.supabase
      .from('v2_digital_entitlements')
      .select(
        'id, order_id, order_item_id, status, access_type, download_count, max_downloads, expires_at, granted_at, revoked_at, created_at',
      )
      .order('created_at', { ascending: false });

    if (entitlementsError) {
      throw new ApiException(
        'entitlement queue 조회 실패',
        500,
        'ENTITLEMENT_QUEUE_FETCH_FAILED',
      );
    }

    const groupStatusCounts = this.countByCompositeKey(
      groups || [],
      (row) => `${row.kind}:${row.status}`,
    );
    const fulfillmentStatusCounts = this.countByCompositeKey(
      fulfillments || [],
      (row) => `${row.kind}:${row.status}`,
    );
    const shipmentStatusCounts = this.countByCompositeKey(
      shipments || [],
      (row) => `${row.status}`,
    );
    const entitlementStatusCounts = this.countByCompositeKey(
      entitlements || [],
      (row) => `${row.status}`,
    );

    const pendingGroups = (groups || []).filter(
      (group) => group.status !== 'FULFILLED' && group.status !== 'CANCELED',
    );
    const shipmentQueue = (shipments || []).filter((shipment) =>
      ['READY_TO_PACK', 'PACKING', 'SHIPPED', 'IN_TRANSIT'].includes(
        shipment.status,
      ),
    );
    const entitlementQueue = (entitlements || []).filter((entitlement) =>
      ['PENDING', 'GRANTED'].includes(entitlement.status),
    );

    return {
      generated_at: new Date().toISOString(),
      summary: {
        pending_group_count: pendingGroups.length,
        shipment_queue_count: shipmentQueue.length,
        entitlement_queue_count: entitlementQueue.length,
      },
      status_counts: {
        group: groupStatusCounts,
        fulfillment: fulfillmentStatusCounts,
        shipment: shipmentStatusCounts,
        entitlement: entitlementStatusCounts,
      },
      recent: {
        groups: (groups || []).slice(0, limit),
        shipments: shipmentQueue.slice(0, limit),
        entitlements: entitlementQueue.slice(0, limit),
      },
    };
  }

  async getInventoryHealth(input: OpsLimitInput): Promise<any> {
    const limit = this.normalizeOpsLimit(input.limit);
    const { data: levels, error: levelsError } = await this.supabase
      .from('v2_inventory_levels')
      .select(
        'id, variant_id, location_id, on_hand_quantity, reserved_quantity, available_quantity, safety_stock_quantity, updated_at',
      );

    if (levelsError) {
      throw new ApiException(
        'inventory level 조회 실패',
        500,
        'INVENTORY_LEVEL_FETCH_FAILED',
      );
    }

    const { data: reservations, error: reservationsError } = await this.supabase
      .from('v2_inventory_reservations')
      .select('id, variant_id, location_id, quantity, status, created_at')
      .eq('status', 'ACTIVE');

    if (reservationsError) {
      throw new ApiException(
        'ACTIVE reservation 조회 실패',
        500,
        'INVENTORY_RESERVATION_FETCH_FAILED',
      );
    }

    const activeReservationMap = new Map<string, number>();
    for (const reservation of reservations || []) {
      const key = `${reservation.variant_id}:${reservation.location_id}`;
      const current = activeReservationMap.get(key) || 0;
      activeReservationMap.set(
        key,
        current + this.normalizePositiveInteger(reservation.quantity, 'quantity'),
      );
    }

    const mismatches: Array<Record<string, unknown>> = [];
    const lowStocks: Array<Record<string, unknown>> = [];

    for (const level of levels || []) {
      const key = `${level.variant_id}:${level.location_id}`;
      const activeReserved = activeReservationMap.get(key) || 0;
      const reservedQuantity = this.normalizeNonNegativeInteger(
        level.reserved_quantity,
        'reserved_quantity',
      );
      if (reservedQuantity !== activeReserved) {
        mismatches.push({
          level_id: level.id,
          variant_id: level.variant_id,
          location_id: level.location_id,
          reserved_quantity: reservedQuantity,
          active_reservation_quantity: activeReserved,
          delta: reservedQuantity - activeReserved,
          updated_at: level.updated_at,
        });
      }

      const availableQuantity = this.normalizeNonNegativeInteger(
        level.available_quantity,
        'available_quantity',
      );
      const safetyStock = this.normalizeNonNegativeInteger(
        level.safety_stock_quantity,
        'safety_stock_quantity',
      );
      if (availableQuantity <= safetyStock) {
        lowStocks.push({
          level_id: level.id,
          variant_id: level.variant_id,
          location_id: level.location_id,
          available_quantity: availableQuantity,
          safety_stock_quantity: safetyStock,
          on_hand_quantity: level.on_hand_quantity,
          reserved_quantity: level.reserved_quantity,
          updated_at: level.updated_at,
        });
      }
    }

    const mismatchSorted = mismatches.sort((a, b) => {
      const deltaA = Math.abs((a.delta as number) || 0);
      const deltaB = Math.abs((b.delta as number) || 0);
      return deltaB - deltaA;
    });
    const lowStockSorted = lowStocks.sort(
      (a, b) =>
        (a.available_quantity as number) - (b.available_quantity as number),
    );

    return {
      generated_at: new Date().toISOString(),
      summary: {
        level_count: (levels || []).length,
        active_reservation_count: (reservations || []).length,
        mismatch_count: mismatches.length,
        low_stock_count: lowStocks.length,
      },
      mismatches: mismatchSorted.slice(0, limit),
      low_stocks: lowStockSorted.slice(0, limit),
    };
  }

  async getCutoverPolicy(): Promise<any> {
    return this.buildCutoverPolicy();
  }

  async checkCutoverPolicy(input: CutoverCheckInput): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
    const reserveInventory = input.reserve_inventory !== false;
    const grantEntitlement = input.grant_entitlement !== false;
    const order = await this.fetchOrderForCutover(orderId);
    const orderItems = await this.fetchOrderItemsForCutover(orderId);
    const evaluation = this.evaluateCutoverPolicy({
      order,
      orderItems,
      reserveInventory,
      grantEntitlement,
    });

    return {
      order_id: orderId,
      order_channel: order.sales_channel_id,
      options: {
        reserve_inventory: reserveInventory,
        grant_entitlement: grantEntitlement,
      },
      policy: this.buildCutoverPolicy(),
      eligible: evaluation.reasons.length === 0,
      reasons: evaluation.reasons,
    };
  }

  async orchestrateMixedOrder(input: OrchestrateMixedOrderInput): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
    const reserveInventory = input.reserve_inventory !== false;
    const grantEntitlement = input.grant_entitlement !== false;
    const providerType = this.normalizeOptionalText(input.provider_type) || 'MANUAL';

    const plan = await this.generateFulfillmentPlan(input);
    const groups = plan.groups as any[];

    let createdFulfillmentCount = 0;
    let createdShipmentCount = 0;
    let createdReservationCount = 0;
    let createdEntitlementCount = 0;
    const groupResults: Array<{
      group_id: string;
      kind: string;
      fulfillment_id: string;
      shipment_id: string | null;
      reservation_ids: string[];
      entitlement_ids: string[];
    }> = [];

    for (const group of groups) {
      const groupId = group.id as string;
      const fulfillment = await this.findOrCreateFulfillmentForGroup(
        groupId,
        group.kind,
        providerType,
      );
      if (fulfillment.created_now) {
        createdFulfillmentCount += 1;
      }

      const groupItems = await this.fetchFulfillmentGroupItemsByGroupId(groupId);
      const groupResult = {
        group_id: groupId,
        kind: group.kind as string,
        fulfillment_id: fulfillment.record.id as string,
        shipment_id: null as string | null,
        reservation_ids: [] as string[],
        entitlement_ids: [] as string[],
      };
      if (group.kind === 'SHIPMENT') {
        const shipmentResult = await this.createShipment({
          fulfillment_id: fulfillment.record.id,
          metadata: {
            orchestrated: true,
            order_id: orderId,
            group_id: groupId,
          },
        });
        groupResult.shipment_id = shipmentResult.shipment?.id || null;
        if (!shipmentResult.idempotent_replayed) {
          createdShipmentCount += 1;
        }

        if (reserveInventory) {
          const stockLocationId = group.stock_location_id as string | null;
          if (!stockLocationId) {
            throw new ApiException(
              `SHIPMENT group(${groupId})의 stock_location_id가 비어 있습니다`,
              409,
              'FULFILLMENT_GROUP_STOCK_LOCATION_REQUIRED',
            );
          }

          for (const groupItem of groupItems) {
            const orderItemId = groupItem.order_item_id as string;
            const orderItem = await this.getOrderItemOrThrow(orderItemId, orderId);
            if (!orderItem.variant_id) {
              throw new ApiException(
                `order_item(${orderItemId})에 variant_id가 없습니다`,
                409,
                'ORDER_ITEM_VARIANT_REQUIRED',
              );
            }

            const reserveResult = await this.reserveInventory({
              order_id: orderId,
              order_item_id: orderItemId,
              variant_id: orderItem.variant_id,
              location_id: stockLocationId,
              fulfillment_group_id: groupId,
              quantity: this.normalizePositiveInteger(
                groupItem.quantity_planned,
                'quantity_planned',
              ),
              reason: 'ORCHESTRATOR',
              idempotency_key: `ORCH-RESERVE:${groupId}:${orderItemId}`,
              metadata: {
                orchestrated: true,
              },
            });
            if (!reserveResult.idempotent_replayed) {
              createdReservationCount += 1;
            }
            if (reserveResult.reservation?.id) {
              groupResult.reservation_ids.push(reserveResult.reservation.id);
            }
          }
        }
      } else if (group.kind === 'DIGITAL' && grantEntitlement) {
        for (const groupItem of groupItems) {
          const orderItemId = groupItem.order_item_id as string;
          const existingEntitlement =
            await this.findActiveEntitlementByOrderItem(orderItemId);
          if (existingEntitlement) {
            continue;
          }

          const grantResult = await this.grantEntitlement({
            order_id: orderId,
            order_item_id: orderItemId,
            fulfillment_id: fulfillment.record.id,
            access_type: 'DOWNLOAD',
            token_reference: `AUTO:${orderItemId}`,
            metadata: {
              orchestrated: true,
              group_id: groupId,
            },
          });
          if (!grantResult.idempotent_replayed) {
            createdEntitlementCount += 1;
          }
          if (grantResult.entitlement?.id) {
            groupResult.entitlement_ids.push(grantResult.entitlement.id);
          }
        }
      }

      groupResults.push(groupResult);
    }

    return {
      order_id: orderId,
      plan_summary: plan.summary,
      options: {
        reserve_inventory: reserveInventory,
        grant_entitlement: grantEntitlement,
      },
      created: {
        fulfillments: createdFulfillmentCount,
        shipments: createdShipmentCount,
        reservations: createdReservationCount,
        entitlements: createdEntitlementCount,
      },
      groups,
      group_results: groupResults,
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<any> {
    const fulfillmentId = this.requireUuid(
      input.fulfillment_id,
      'fulfillment_id는 필수입니다',
    );
    const carrier = this.normalizeOptionalText(input.carrier);
    const serviceLevel = this.normalizeOptionalText(input.service_level);
    const trackingNo = this.normalizeOptionalText(input.tracking_no);
    const trackingUrl = this.normalizeOptionalText(input.tracking_url);
    const labelRef = this.normalizeOptionalText(input.label_ref);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const fulfillment = await this.getFulfillmentByIdOrThrow(fulfillmentId);
    if (fulfillment.kind !== 'SHIPMENT') {
      throw new ApiException(
        'shipment는 SHIPMENT fulfillment에 대해서만 생성할 수 있습니다',
        409,
        'SHIPMENT_FULFILLMENT_KIND_INVALID',
      );
    }
    const group = await this.getFulfillmentGroupByIdOrThrow(
      fulfillment.fulfillment_group_id,
    );
    const order = await this.fetchOrderForCutover(group.order_id);
    const orderItems = await this.fetchOrderItemsForCutover(order.id);
    this.assertCutoverPolicyOrThrow({
      order,
      orderItems,
      reserveInventory: true,
      grantEntitlement: false,
    });

    const { data: created, error: insertError } = await this.supabase
      .from('v2_shipments')
      .insert({
        fulfillment_id: fulfillmentId,
        carrier,
        service_level: serviceLevel,
        tracking_no: trackingNo,
        tracking_url: trackingUrl,
        label_ref: labelRef,
        status: 'READY_TO_PACK' as ShipmentStatus,
        metadata,
      })
      .select('*')
      .maybeSingle();

    if (insertError) {
      if (
        insertError.code === '23505' &&
        insertError.message?.includes('v2_shipments_fulfillment_unique')
      ) {
        const existing = await this.findShipmentByFulfillmentId(fulfillmentId);
        if (existing) {
          return {
            idempotent_replayed: true,
            shipment: existing,
          };
        }
      }
      throw new ApiException('shipment 생성 실패', 500, 'SHIPMENT_CREATE_FAILED');
    }
    if (!created) {
      throw new ApiException('shipment 생성 결과가 비어 있습니다', 500, 'SHIPMENT_CREATE_FAILED');
    }

    await this.markFulfillmentInProgress(fulfillmentId);
    return {
      idempotent_replayed: false,
      shipment: await this.fetchShipmentById(created.id),
    };
  }

  async packShipment(
    shipmentId: string,
    input: ShipmentTransitionInput,
  ): Promise<any> {
    const normalizedShipmentId = this.requireUuid(
      shipmentId,
      'shipment_id가 올바르지 않습니다',
    );
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);
    const shipment = await this.fetchShipmentById(normalizedShipmentId);

    if (shipment.status === 'PACKING') {
      return {
        idempotent_replayed: true,
        shipment,
      };
    }
    if (shipment.status !== 'READY_TO_PACK') {
      throw new ApiException(
        `READY_TO_PACK 상태 shipment만 PACKING으로 전환할 수 있습니다 (현재: ${shipment.status})`,
        409,
        'SHIPMENT_INVALID_STATE',
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_shipments')
      .update({
        status: 'PACKING' as ShipmentStatus,
        packed_at: now,
        metadata: this.mergeMetadata(shipment.metadata, metadataPatch),
      })
      .eq('id', normalizedShipmentId)
      .eq('status', 'READY_TO_PACK')
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException('shipment 포장 전환 실패', 500, 'SHIPMENT_PACK_FAILED');
    }
    if (!updated) {
      throw new ApiException(
        '동시성 충돌로 shipment 포장 전환에 실패했습니다',
        409,
        'SHIPMENT_PACK_CONFLICT',
      );
    }

    await this.markFulfillmentInProgress(updated.fulfillment_id);
    void this.notifyShipmentDispatchedSafely(updated);

    return {
      idempotent_replayed: false,
      shipment: updated,
    };
  }

  async registerShipmentTracking(
    shipmentId: string,
    input: RegisterShipmentTrackingInput,
  ): Promise<any> {
    const normalizedShipmentId = this.requireUuid(
      shipmentId,
      'shipment_id가 올바르지 않습니다',
    );
    const trackingNo = this.normalizeOptionalText(input.tracking_no);
    if (!trackingNo) {
      throw new ApiException(
        'tracking_no는 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const shipment = await this.fetchShipmentById(normalizedShipmentId);
    if (
      shipment.status === 'DELIVERED' ||
      shipment.status === 'CANCELED' ||
      shipment.status === 'RETURNED'
    ) {
      throw new ApiException(
        `종료 상태 shipment에는 송장 등록이 불가합니다 (현재: ${shipment.status})`,
        409,
        'SHIPMENT_INVALID_STATE',
      );
    }

    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);
    const carrier = this.normalizeOptionalText(input.carrier);
    const serviceLevel = this.normalizeOptionalText(input.service_level);
    const trackingUrl = this.normalizeOptionalText(input.tracking_url);
    const labelRef = this.normalizeOptionalText(input.label_ref);
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await this.supabase
      .from('v2_shipments')
      .update({
        carrier: carrier || shipment.carrier || null,
        service_level: serviceLevel || shipment.service_level || null,
        tracking_no: trackingNo,
        tracking_url: trackingUrl || shipment.tracking_url || null,
        label_ref: labelRef || shipment.label_ref || null,
        status:
          shipment.status === 'READY_TO_PACK'
            ? ('PACKING' as ShipmentStatus)
            : shipment.status,
        packed_at:
          shipment.status === 'READY_TO_PACK' ? now : shipment.packed_at || null,
        metadata: this.mergeMetadata(shipment.metadata, metadataPatch),
      })
      .eq('id', normalizedShipmentId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'shipment 송장 등록 실패',
        500,
        'SHIPMENT_TRACKING_UPDATE_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        'shipment 송장 등록 결과가 비어 있습니다',
        500,
        'SHIPMENT_TRACKING_UPDATE_FAILED',
      );
    }

    await this.markFulfillmentInProgress(updated.fulfillment_id);
    return {
      shipment: updated,
    };
  }

  async dispatchShipment(
    shipmentId: string,
    input: ShipmentTransitionInput,
  ): Promise<any> {
    const normalizedShipmentId = this.requireUuid(
      shipmentId,
      'shipment_id가 올바르지 않습니다',
    );
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);
    const shipment = await this.fetchShipmentById(normalizedShipmentId);

    if (shipment.status === 'SHIPPED' || shipment.status === 'IN_TRANSIT') {
      return {
        idempotent_replayed: true,
        shipment,
      };
    }
    if (shipment.status !== 'READY_TO_PACK' && shipment.status !== 'PACKING') {
      throw new ApiException(
        `READY_TO_PACK/PACKING 상태 shipment만 출고할 수 있습니다 (현재: ${shipment.status})`,
        409,
        'SHIPMENT_INVALID_STATE',
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_shipments')
      .update({
        status: 'SHIPPED' as ShipmentStatus,
        packed_at: shipment.packed_at || now,
        shipped_at: now,
        metadata: this.mergeMetadata(shipment.metadata, metadataPatch),
      })
      .eq('id', normalizedShipmentId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'shipment 출고 전환 실패',
        500,
        'SHIPMENT_DISPATCH_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        'shipment 출고 전환 결과가 비어 있습니다',
        500,
        'SHIPMENT_DISPATCH_FAILED',
      );
    }

    await this.markFulfillmentInProgress(updated.fulfillment_id);
    return {
      idempotent_replayed: false,
      shipment: updated,
    };
  }

  async deliverShipment(
    shipmentId: string,
    input: ShipmentTransitionInput,
  ): Promise<any> {
    const normalizedShipmentId = this.requireUuid(
      shipmentId,
      'shipment_id가 올바르지 않습니다',
    );
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);
    const shipment = await this.fetchShipmentById(normalizedShipmentId);

    if (shipment.status === 'DELIVERED') {
      return {
        idempotent_replayed: true,
        shipment,
      };
    }
    if (shipment.status !== 'SHIPPED' && shipment.status !== 'IN_TRANSIT') {
      throw new ApiException(
        `SHIPPED/IN_TRANSIT 상태 shipment만 배송 완료할 수 있습니다 (현재: ${shipment.status})`,
        409,
        'SHIPMENT_INVALID_STATE',
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_shipments')
      .update({
        status: 'DELIVERED' as ShipmentStatus,
        delivered_at: now,
        metadata: this.mergeMetadata(shipment.metadata, metadataPatch),
      })
      .eq('id', normalizedShipmentId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'shipment 배송 완료 전환 실패',
        500,
        'SHIPMENT_DELIVER_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        'shipment 배송 완료 전환 결과가 비어 있습니다',
        500,
        'SHIPMENT_DELIVER_FAILED',
      );
    }

    await this.markFulfillmentCompleted(updated.fulfillment_id);
    void this.notifyShipmentDeliveredSafely(updated);

    return {
      idempotent_replayed: false,
      shipment: updated,
    };
  }

  async getShipmentById(shipmentId: string): Promise<any> {
    const normalized = this.requireUuid(
      shipmentId,
      'shipment_id가 올바르지 않습니다',
    );
    return this.fetchShipmentById(normalized);
  }

  async grantEntitlement(input: GrantEntitlementInput): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
    const order = await this.fetchOrderForCutover(orderId);
    const orderItemId = this.requireUuid(
      input.order_item_id,
      'order_item_id는 필수입니다',
    );
    const digitalAssetId = this.normalizeOptionalUuid(input.digital_asset_id);
    const fulfillmentId = this.normalizeOptionalUuid(input.fulfillment_id);
    const accessType = this.normalizeAccessType(input.access_type);
    const tokenHash = this.normalizeOptionalText(input.token_hash);
    const tokenReference = this.normalizeOptionalText(input.token_reference);
    const expiresAt = this.normalizeOptionalIsoDateTime(input.expires_at);
    const maxDownloads = this.normalizeOptionalPositiveInteger(
      input.max_downloads,
      'max_downloads',
    );
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const orderItem = await this.getOrderItemOrThrow(orderItemId, orderId);
    if (!this.isOrderItemDigital(orderItem)) {
      throw new ApiException(
        'digital entitlement는 DIGITAL order_item에 대해서만 발급할 수 있습니다',
        409,
        'ENTITLEMENT_ORDER_ITEM_KIND_INVALID',
      );
    }
    if (fulfillmentId) {
      const fulfillment = await this.getFulfillmentByIdOrThrow(fulfillmentId);
      if (fulfillment.kind !== 'DIGITAL') {
        throw new ApiException(
          'digital entitlement는 DIGITAL fulfillment에만 연결할 수 있습니다',
          409,
          'ENTITLEMENT_FULFILLMENT_KIND_INVALID',
        );
      }
    }
    this.assertCutoverPolicyOrThrow({
      order,
      orderItems: [orderItem],
      reserveInventory: false,
      grantEntitlement: true,
    });

    if (tokenHash) {
      const existing = await this.findEntitlementByTokenHash(tokenHash);
      if (existing) {
        return {
          idempotent_replayed: true,
          entitlement: existing,
        };
      }
    }

    const now = new Date().toISOString();
    const { data: created, error: insertError } = await this.supabase
      .from('v2_digital_entitlements')
      .insert({
        order_id: orderId,
        order_item_id: orderItemId,
        digital_asset_id: digitalAssetId,
        fulfillment_id: fulfillmentId,
        status: 'GRANTED' as DigitalEntitlementStatus,
        access_type: accessType,
        token_hash: tokenHash,
        token_reference: tokenReference,
        granted_at: now,
        expires_at: expiresAt,
        max_downloads: maxDownloads,
        metadata,
      })
      .select('*')
      .maybeSingle();

    if (insertError) {
      if (
        tokenHash &&
        insertError.code === '23505' &&
        insertError.message?.includes('uq_v2_digital_entitlements_token_hash')
      ) {
        const existing = await this.findEntitlementByTokenHash(tokenHash);
        if (existing) {
          return {
            idempotent_replayed: true,
            entitlement: existing,
          };
        }
      }
      throw new ApiException(
        'entitlement 발급 실패',
        500,
        'ENTITLEMENT_GRANT_FAILED',
      );
    }
    if (!created) {
      throw new ApiException(
        'entitlement 발급 결과가 비어 있습니다',
        500,
        'ENTITLEMENT_GRANT_FAILED',
      );
    }

    await this.insertEntitlementEvent(created.id, 'GRANTED', metadata);
    return {
      idempotent_replayed: false,
      entitlement: await this.fetchEntitlementById(created.id),
    };
  }

  async reissueEntitlement(
    entitlementId: string,
    input: ReissueEntitlementInput,
  ): Promise<any> {
    const normalizedEntitlementId = this.requireUuid(
      entitlementId,
      'entitlement_id가 올바르지 않습니다',
    );
    const entitlement = await this.fetchEntitlementById(normalizedEntitlementId);

    if (entitlement.status === 'REVOKED') {
      throw new ApiException(
        'REVOKED entitlement는 재발급할 수 없습니다',
        409,
        'ENTITLEMENT_INVALID_STATE',
      );
    }
    if (entitlement.status === 'FAILED') {
      throw new ApiException(
        'FAILED entitlement는 재발급할 수 없습니다',
        409,
        'ENTITLEMENT_INVALID_STATE',
      );
    }

    const tokenHash = this.normalizeOptionalText(input.token_hash);
    const tokenReference = this.normalizeOptionalText(input.token_reference);
    const expiresAt = this.normalizeOptionalIsoDateTime(input.expires_at);
    const maxDownloads = this.normalizeOptionalPositiveInteger(
      input.max_downloads,
      'max_downloads',
    );
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);

    if (tokenHash) {
      const existingByToken = await this.findEntitlementByTokenHash(tokenHash);
      if (existingByToken && existingByToken.id !== normalizedEntitlementId) {
        throw new ApiException(
          '이미 사용 중인 token_hash입니다',
          409,
          'ENTITLEMENT_TOKEN_HASH_CONFLICT',
        );
      }
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_digital_entitlements')
      .update({
        status: 'GRANTED' as DigitalEntitlementStatus,
        token_hash: tokenHash || entitlement.token_hash || null,
        token_reference: tokenReference || entitlement.token_reference || null,
        granted_at: now,
        expires_at:
          expiresAt !== null
            ? expiresAt
            : (entitlement.expires_at as string | null),
        max_downloads:
          maxDownloads !== null
            ? maxDownloads
            : (entitlement.max_downloads as number | null),
        revoked_at: null,
        revoke_reason: null,
        failed_at: null,
        metadata: this.mergeMetadata(entitlement.metadata, metadataPatch),
      })
      .eq('id', normalizedEntitlementId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'entitlement 재발급 실패',
        500,
        'ENTITLEMENT_REISSUE_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        'entitlement 재발급 결과가 비어 있습니다',
        500,
        'ENTITLEMENT_REISSUE_FAILED',
      );
    }

    await this.insertEntitlementEvent(
      updated.id,
      'REISSUED',
      this.mergeMetadata(metadataPatch, {
        status_before: entitlement.status,
      }),
    );
    return {
      entitlement: updated,
    };
  }

  async revokeEntitlement(
    entitlementId: string,
    input: RevokeEntitlementInput,
  ): Promise<any> {
    const normalizedEntitlementId = this.requireUuid(
      entitlementId,
      'entitlement_id가 올바르지 않습니다',
    );
    const reason = this.normalizeOptionalText(input.reason);
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);

    const entitlement = await this.fetchEntitlementById(normalizedEntitlementId);
    if (entitlement.status === 'REVOKED') {
      return {
        idempotent_replayed: true,
        entitlement,
      };
    }
    if (entitlement.status === 'FAILED') {
      throw new ApiException(
        'FAILED entitlement는 revoke할 수 없습니다',
        409,
        'ENTITLEMENT_INVALID_STATE',
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_digital_entitlements')
      .update({
        status: 'REVOKED' as DigitalEntitlementStatus,
        revoked_at: now,
        revoke_reason: reason || entitlement.revoke_reason || null,
        metadata: this.mergeMetadata(entitlement.metadata, metadataPatch),
      })
      .eq('id', normalizedEntitlementId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'entitlement 회수 실패',
        500,
        'ENTITLEMENT_REVOKE_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        'entitlement 회수 결과가 비어 있습니다',
        500,
        'ENTITLEMENT_REVOKE_FAILED',
      );
    }

    await this.insertEntitlementEvent(
      updated.id,
      'REVOKED',
      this.mergeMetadata(metadataPatch, {
        revoke_reason: reason || null,
      }),
    );
    return {
      idempotent_replayed: false,
      entitlement: updated,
    };
  }

  async logEntitlementDownload(
    entitlementId: string,
    input: LogEntitlementDownloadInput,
  ): Promise<any> {
    const normalizedEntitlementId = this.requireUuid(
      entitlementId,
      'entitlement_id가 올바르지 않습니다',
    );
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);
    const entitlement = await this.fetchEntitlementById(normalizedEntitlementId);

    if (entitlement.status === 'REVOKED') {
      throw new ApiException(
        '회수된 entitlement는 다운로드할 수 없습니다',
        409,
        'ENTITLEMENT_REVOKED',
      );
    }
    if (entitlement.status === 'FAILED') {
      throw new ApiException(
        '실패 상태 entitlement는 다운로드할 수 없습니다',
        409,
        'ENTITLEMENT_FAILED',
      );
    }

    const now = new Date();
    const expiresAt = entitlement.expires_at
      ? new Date(entitlement.expires_at as string)
      : null;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      if (entitlement.status !== 'EXPIRED') {
        const { error: expireError } = await this.supabase
          .from('v2_digital_entitlements')
          .update({
            status: 'EXPIRED' as DigitalEntitlementStatus,
            metadata: this.mergeMetadata(entitlement.metadata, metadataPatch),
          })
          .eq('id', normalizedEntitlementId);

        if (expireError) {
          throw new ApiException(
            'entitlement 만료 처리 실패',
            500,
            'ENTITLEMENT_EXPIRE_FAILED',
          );
        }

        await this.insertEntitlementEvent(
          normalizedEntitlementId,
          'EXPIRED',
          this.mergeMetadata(metadataPatch, {
            expired_at: now.toISOString(),
          }),
        );
      }

      throw new ApiException(
        '만료된 entitlement입니다',
        410,
        'ENTITLEMENT_EXPIRED',
      );
    }

    if (entitlement.status !== 'GRANTED') {
      throw new ApiException(
        `GRANTED 상태 entitlement만 다운로드 기록할 수 있습니다 (현재: ${entitlement.status})`,
        409,
        'ENTITLEMENT_INVALID_STATE',
      );
    }

    const currentCount = this.normalizeNonNegativeInteger(
      entitlement.download_count,
      'download_count',
    );
    const maxDownloads =
      typeof entitlement.max_downloads === 'number'
        ? (entitlement.max_downloads as number)
        : null;

    if (maxDownloads !== null && currentCount >= maxDownloads) {
      throw new ApiException(
        `다운로드 가능 횟수를 초과했습니다 (max=${maxDownloads})`,
        409,
        'ENTITLEMENT_DOWNLOAD_LIMIT_EXCEEDED',
      );
    }

    const nextCount = currentCount + 1;
    const { data: updated, error: updateError } = await this.supabase
      .from('v2_digital_entitlements')
      .update({
        download_count: nextCount,
        metadata: this.mergeMetadata(entitlement.metadata, metadataPatch),
      })
      .eq('id', normalizedEntitlementId)
      .eq('download_count', currentCount)
      .select('*')
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        'entitlement 다운로드 카운트 반영 실패',
        500,
        'ENTITLEMENT_DOWNLOAD_LOG_FAILED',
      );
    }
    if (!updated) {
      throw new ApiException(
        '동시성 충돌로 다운로드 카운트 반영에 실패했습니다',
        409,
        'ENTITLEMENT_DOWNLOAD_CONFLICT',
      );
    }

    await this.insertEntitlementEvent(
      normalizedEntitlementId,
      'DOWNLOADED',
      this.mergeMetadata(metadataPatch, {
        download_count: nextCount,
      }),
    );

    return {
      entitlement: updated,
      remaining_downloads:
        maxDownloads !== null ? Math.max(maxDownloads - nextCount, 0) : null,
    };
  }

  async getEntitlementById(entitlementId: string): Promise<any> {
    const normalized = this.requireUuid(
      entitlementId,
      'entitlement_id가 올바르지 않습니다',
    );
    return this.fetchEntitlementById(normalized);
  }

  private async transitionReservation(
    reservationId: string,
    targetStatus: 'RELEASED' | 'CONSUMED',
    input: TransitionReservationInput,
  ): Promise<any> {
    const normalizedReservationId = this.requireUuid(
      reservationId,
      'reservation_id가 올바르지 않습니다',
    );
    const reason = this.normalizeOptionalText(input.reason);
    const idempotencyKey = this.normalizeOptionalText(input.idempotency_key);
    const metadataPatch = this.normalizeOptionalJsonObject(input.metadata);

    if (idempotencyKey) {
      const existingByIdempotency =
        await this.findReservationByIdempotencyKey(idempotencyKey);
      if (
        existingByIdempotency &&
        existingByIdempotency.id === normalizedReservationId &&
        existingByIdempotency.status === targetStatus
      ) {
        return {
          idempotent_replayed: true,
          reservation: existingByIdempotency,
        };
      }
    }

    const reservation = await this.fetchReservationById(normalizedReservationId);

    if (reservation.status === targetStatus) {
      return {
        idempotent_replayed: true,
        reservation,
      };
    }
    if (reservation.status !== 'ACTIVE') {
      throw new ApiException(
        `ACTIVE 상태 예약만 ${targetStatus} 처리할 수 있습니다 (현재: ${reservation.status})`,
        409,
        'RESERVATION_INVALID_STATE',
      );
    }

    const quantity = this.normalizePositiveInteger(reservation.quantity, 'quantity');
    const inventoryLevel = await this.getInventoryLevelOrThrow(
      reservation.variant_id,
      reservation.location_id,
    );

    const now = new Date().toISOString();
    const nextReserved = inventoryLevel.reserved_quantity - quantity;
    const nextOnHand =
      targetStatus === 'CONSUMED'
        ? inventoryLevel.on_hand_quantity - quantity
        : inventoryLevel.on_hand_quantity;

    if (nextReserved < 0) {
      throw new ApiException(
        '예약 수량이 현재 reserved_quantity보다 큽니다',
        409,
        'RESERVATION_QUANTITY_CONFLICT',
      );
    }
    if (nextOnHand < 0) {
      throw new ApiException(
        '소비 처리할 수 있는 on_hand 재고가 부족합니다',
        409,
        'INVENTORY_ON_HAND_NOT_ENOUGH',
      );
    }

    await this.updateInventoryLevelWithOptimisticLock(inventoryLevel, {
      on_hand_quantity: nextOnHand,
      reserved_quantity: nextReserved,
      updated_reason: targetStatus === 'CONSUMED' ? 'CONSUME' : 'RELEASE',
    });

    const nextMetadata =
      metadataPatch && typeof reservation.metadata === 'object'
        ? { ...(reservation.metadata || {}), ...metadataPatch }
        : reservation.metadata || metadataPatch || {};

    const updatePayload: Record<string, unknown> = {
      status: targetStatus,
      reason: reason || reservation.reason || null,
      idempotency_key: idempotencyKey || reservation.idempotency_key || null,
      metadata: nextMetadata,
    };

    if (targetStatus === 'RELEASED') {
      updatePayload.released_at = now;
    } else {
      updatePayload.consumed_at = now;
    }

    const { error: updateError } = await this.supabase
      .from('v2_inventory_reservations')
      .update(updatePayload)
      .eq('id', normalizedReservationId)
      .eq('status', 'ACTIVE');

    if (updateError) {
      throw new ApiException(
        `${targetStatus} 상태 전환 실패`,
        500,
        'RESERVATION_TRANSITION_FAILED',
      );
    }

    const updated = await this.fetchReservationById(normalizedReservationId);
    return {
      idempotent_replayed: false,
      reservation: updated,
    };
  }

  private async fetchShipmentById(shipmentId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_shipments')
      .select('*')
      .eq('id', shipmentId)
      .maybeSingle();

    if (error) {
      throw new ApiException('shipment 조회 실패', 500, 'SHIPMENT_FETCH_FAILED');
    }
    if (!data) {
      throw new ApiException(
        'shipment를 찾을 수 없습니다',
        404,
        'SHIPMENT_NOT_FOUND',
      );
    }
    return data;
  }

  private async findShipmentByFulfillmentId(
    fulfillmentId: string,
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('v2_shipments')
      .select('*')
      .eq('fulfillment_id', fulfillmentId)
      .maybeSingle();

    if (error) {
      throw new ApiException('shipment 조회 실패', 500, 'SHIPMENT_FETCH_FAILED');
    }
    return data || null;
  }

  private async getFulfillmentByIdOrThrow(fulfillmentId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_fulfillments')
      .select('*')
      .eq('id', fulfillmentId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'fulfillment 조회 실패',
        500,
        'FULFILLMENT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'fulfillment를 찾을 수 없습니다',
        404,
        'FULFILLMENT_NOT_FOUND',
      );
    }
    return data;
  }

  private async markFulfillmentInProgress(fulfillmentId: string): Promise<void> {
    const fulfillment = await this.getFulfillmentByIdOrThrow(fulfillmentId);
    if (
      fulfillment.status !== 'REQUESTED' &&
      fulfillment.status !== 'IN_PROGRESS'
    ) {
      return;
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('v2_fulfillments')
      .update({
        status: 'IN_PROGRESS' as FulfillmentExecutionStatus,
        started_at: fulfillment.started_at || now,
      })
      .eq('id', fulfillmentId)
      .in('status', ['REQUESTED', 'IN_PROGRESS']);

    if (error) {
      throw new ApiException(
        'fulfillment 상태 갱신 실패',
        500,
        'FULFILLMENT_STATUS_UPDATE_FAILED',
      );
    }
  }

  private async markFulfillmentCompleted(fulfillmentId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('v2_fulfillments')
      .update({
        status: 'COMPLETED' as FulfillmentExecutionStatus,
        completed_at: now,
      })
      .eq('id', fulfillmentId)
      .in('status', ['REQUESTED', 'IN_PROGRESS', 'COMPLETED']);

    if (error) {
      throw new ApiException(
        'fulfillment 완료 처리 실패',
        500,
        'FULFILLMENT_STATUS_UPDATE_FAILED',
      );
    }
  }

  private async fetchEntitlementById(entitlementId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select('*')
      .eq('id', entitlementId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'entitlement 조회 실패',
        500,
        'ENTITLEMENT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'entitlement를 찾을 수 없습니다',
        404,
        'ENTITLEMENT_NOT_FOUND',
      );
    }
    return data;
  }

  private async findEntitlementByTokenHash(
    tokenHash: string,
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'entitlement token_hash 조회 실패',
        500,
        'ENTITLEMENT_TOKEN_FETCH_FAILED',
      );
    }
    return data || null;
  }

  private async insertEntitlementEvent(
    entitlementId: string,
    eventType: DigitalEntitlementEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('v2_digital_entitlement_events')
      .insert({
        entitlement_id: entitlementId,
        event_type: eventType,
        actor_type: 'SYSTEM',
        payload: payload || {},
      });

    if (error) {
      throw new ApiException(
        'entitlement 이벤트 기록 실패',
        500,
        'ENTITLEMENT_EVENT_CREATE_FAILED',
      );
    }
  }

  private async fetchFulfillmentGroupsByOrderId(orderId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v2_fulfillment_groups')
      .select(
        '*, v2_fulfillment_group_items(*)',
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'fulfillment group 조회 실패',
        500,
        'FULFILLMENT_GROUP_FETCH_FAILED',
      );
    }
    return data || [];
  }

  private async fetchFulfillmentGroupItemsByGroupId(groupId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v2_fulfillment_group_items')
      .select('*')
      .eq('fulfillment_group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'fulfillment group item 조회 실패',
        500,
        'FULFILLMENT_GROUP_ITEM_FETCH_FAILED',
      );
    }
    return data || [];
  }

  private async findOrCreateFulfillmentForGroup(
    groupId: string,
    kind: 'DIGITAL' | 'SHIPMENT' | 'PICKUP',
    providerType: string,
  ): Promise<{ record: any; created_now: boolean }> {
    const { data: existingList, error: existingError } = await this.supabase
      .from('v2_fulfillments')
      .select('*')
      .eq('fulfillment_group_id', groupId)
      .order('requested_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw new ApiException(
        'fulfillment 조회 실패',
        500,
        'FULFILLMENT_FETCH_FAILED',
      );
    }
    const existing = Array.isArray(existingList) ? existingList[0] : null;
    if (existing && existing.status !== 'CANCELED') {
      return { record: existing, created_now: false };
    }

    const { data: created, error: createError } = await this.supabase
      .from('v2_fulfillments')
      .insert({
        fulfillment_group_id: groupId,
        kind,
        status: 'REQUESTED' as FulfillmentExecutionStatus,
        provider_type: providerType,
      })
      .select('*')
      .maybeSingle();

    if (createError) {
      throw new ApiException(
        'fulfillment 생성 실패',
        500,
        'FULFILLMENT_CREATE_FAILED',
      );
    }
    if (!created) {
      throw new ApiException(
        'fulfillment 생성 결과가 비어 있습니다',
        500,
        'FULFILLMENT_CREATE_FAILED',
      );
    }
    return { record: created, created_now: true };
  }

  private async findActiveEntitlementByOrderItem(
    orderItemId: string,
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select('*')
      .eq('order_item_id', orderItemId)
      .in('status', ['PENDING', 'GRANTED', 'EXPIRED'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new ApiException(
        'entitlement 중복 조회 실패',
        500,
        'ENTITLEMENT_FETCH_FAILED',
      );
    }
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    return data[0];
  }

  private async notifyShipmentDispatchedSafely(shipment: any): Promise<void> {
    try {
      const order = await this.fetchOrderForNotificationByFulfillment(
        shipment.fulfillment_id,
      );
      await this.commerceNotificationsService.notifyShipmentDispatched(
        order,
        shipment,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch shipment notification (shipment=${shipment?.id ?? '-'}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async notifyShipmentDeliveredSafely(shipment: any): Promise<void> {
    try {
      const order = await this.fetchOrderForNotificationByFulfillment(
        shipment.fulfillment_id,
      );
      await this.commerceNotificationsService.notifyShipmentDelivered(
        order,
        shipment,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to deliver shipment notification (shipment=${shipment?.id ?? '-'}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async fetchOrderForNotificationByFulfillment(
    fulfillmentId: string,
  ): Promise<any> {
    const fulfillment = await this.getFulfillmentByIdOrThrow(fulfillmentId);
    const group = await this.getFulfillmentGroupByIdOrThrow(
      fulfillment.fulfillment_group_id,
    );

    const { data: order, error: orderError } = await this.supabase
      .from('v2_orders')
      .select(
        'id, order_no, order_status, payment_status, fulfillment_status, grand_total, customer_snapshot, shipping_address_snapshot, placed_at, confirmed_at',
      )
      .eq('id', group.order_id)
      .maybeSingle();

    if (orderError) {
      throw new ApiException(
        '알림용 order 조회 실패',
        500,
        'V2_ORDER_FETCH_FAILED',
      );
    }
    if (!order) {
      throw new ApiException(
        '알림용 order를 찾을 수 없습니다',
        404,
        'V2_ORDER_NOT_FOUND',
      );
    }

    return order;
  }

  private async fetchOrderForCutover(orderId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select('id, order_no, sales_channel_id, order_status, payment_status, fulfillment_status')
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

  private async fetchOrderItemsForCutover(orderId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select(
        'id, variant_id, line_type, line_status, fulfillment_type_snapshot, requires_shipping_snapshot',
      )
      .eq('order_id', orderId);

    if (error) {
      throw new ApiException(
        'order_item 조회 실패',
        500,
        'ORDER_ITEM_FETCH_FAILED',
      );
    }
    return (data || []).filter((item: any) =>
      this.isFulfillmentActionableOrderItem(item),
    );
  }

  private buildCutoverPolicy(): {
    write_enabled: boolean;
    shipment_write_enabled: boolean;
    digital_write_enabled: boolean;
    allowed_channels: string[];
    allowed_variant_ids: string[];
    default_write_enabled: boolean;
  } {
    const defaultWriteEnabled =
      (process.env.NODE_ENV || '').toLowerCase() !== 'production';
    const allowedChannels = this.readCsvEnv('V2_FULFILLMENT_ALLOWED_CHANNELS').map(
      (channel) => channel.toUpperCase(),
    );
    const allowedVariantIds = this.readCsvEnv(
      'V2_FULFILLMENT_ALLOWED_VARIANT_IDS',
    ).filter((value) => this.isUuid(value));

    return {
      write_enabled: this.readBooleanEnv(
        'V2_FULFILLMENT_WRITE_ENABLED',
        defaultWriteEnabled,
      ),
      shipment_write_enabled: this.readBooleanEnv(
        'V2_FULFILLMENT_ENABLE_SHIPMENT_WRITE',
        true,
      ),
      digital_write_enabled: this.readBooleanEnv(
        'V2_FULFILLMENT_ENABLE_DIGITAL_WRITE',
        true,
      ),
      allowed_channels: allowedChannels,
      allowed_variant_ids: allowedVariantIds,
      default_write_enabled: defaultWriteEnabled,
    };
  }

  private evaluateCutoverPolicy(input: {
    order: any;
    orderItems: any[];
    reserveInventory: boolean;
    grantEntitlement: boolean;
  }): { reasons: string[] } {
    const policy = this.buildCutoverPolicy();
    const reasons: string[] = [];

    if (!policy.write_enabled) {
      reasons.push('V2_FULFILLMENT_WRITE_ENABLED=false');
    }

    if (input.reserveInventory && !policy.shipment_write_enabled) {
      reasons.push('V2_FULFILLMENT_ENABLE_SHIPMENT_WRITE=false');
    }
    if (input.grantEntitlement && !policy.digital_write_enabled) {
      reasons.push('V2_FULFILLMENT_ENABLE_DIGITAL_WRITE=false');
    }

    if (policy.allowed_channels.length > 0) {
      const orderChannel = this.normalizeOptionalText(input.order.sales_channel_id);
      const normalizedOrderChannel = (orderChannel || '').toUpperCase();
      if (!policy.allowed_channels.includes(normalizedOrderChannel)) {
        reasons.push(
          `sales_channel_id(${input.order.sales_channel_id || '-'}) not in allowed_channels`,
        );
      }
    }

    if (policy.allowed_variant_ids.length > 0) {
      const variantIds = Array.from(
        new Set(
          (input.orderItems || [])
            .map((item) => this.normalizeOptionalText(item.variant_id))
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const blocked = variantIds.filter(
        (variantId) => !policy.allowed_variant_ids.includes(variantId),
      );
      if (blocked.length > 0) {
        reasons.push(`variant_id not allowed: ${blocked.join(',')}`);
      }
    }

    return { reasons };
  }

  private assertCutoverPolicyOrThrow(input: {
    order: any;
    orderItems: any[];
    reserveInventory: boolean;
    grantEntitlement: boolean;
  }): void {
    const evaluation = this.evaluateCutoverPolicy(input);
    if (evaluation.reasons.length > 0) {
      throw new ApiException(
        `fulfillment write cutover 정책에 의해 차단되었습니다: ${evaluation.reasons.join(
          '; ',
        )}`,
        409,
        'V2_FULFILLMENT_CUTOVER_BLOCKED',
      );
    }
  }

  private async getFulfillmentGroupByIdOrThrow(groupId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_fulfillment_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'fulfillment group 조회 실패',
        500,
        'FULFILLMENT_GROUP_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'fulfillment group를 찾을 수 없습니다',
        404,
        'FULFILLMENT_GROUP_NOT_FOUND',
      );
    }
    return data;
  }

  private isOrderItemDigital(orderItem: any): boolean {
    if (!this.isFulfillmentActionableOrderItem(orderItem)) {
      return false;
    }

    if (orderItem.fulfillment_type_snapshot === 'DIGITAL') {
      return true;
    }
    if (orderItem.requires_shipping_snapshot === false) {
      return true;
    }
    return false;
  }

  private isFulfillmentActionableOrderItem(orderItem: any): boolean {
    const lineType = this.normalizeOptionalText(orderItem?.line_type);
    if (lineType === 'BUNDLE_PARENT') {
      return false;
    }

    const lineStatus = this.normalizeOptionalText(orderItem?.line_status);
    if (lineStatus === 'CANCELED' || lineStatus === 'REFUNDED') {
      return false;
    }

    return true;
  }

  private isShippingRuleConditionMatched(
    rule: any,
    metrics: {
      orderAmount: number;
      totalWeight: number;
      itemCount: number;
    },
  ): boolean {
    const conditionType = rule.condition_type as string | null;
    const minValue =
      typeof rule.min_value === 'number' ? (rule.min_value as number) : null;
    const maxValue =
      typeof rule.max_value === 'number' ? (rule.max_value as number) : null;

    if (conditionType === 'FLAT' || !conditionType) {
      return true;
    }

    let targetValue = 0;
    if (conditionType === 'ORDER_AMOUNT') {
      targetValue = metrics.orderAmount;
    } else if (conditionType === 'WEIGHT') {
      targetValue = metrics.totalWeight;
    } else if (conditionType === 'ITEM_COUNT') {
      targetValue = metrics.itemCount;
    } else {
      return false;
    }

    if (minValue !== null && targetValue < minValue) {
      return false;
    }
    if (maxValue !== null && targetValue > maxValue) {
      return false;
    }
    return true;
  }

  private async getOrderItemOrThrow(
    orderItemId: string,
    orderId: string,
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select(
        'id, order_id, variant_id, quantity, line_type, line_status, fulfillment_type_snapshot, requires_shipping_snapshot',
      )
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '주문 라인 조회 실패',
        500,
        'ORDER_ITEM_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'order_item을 찾을 수 없습니다',
        404,
        'ORDER_ITEM_NOT_FOUND',
      );
    }

    const lineType = this.normalizeOptionalText(data.line_type);
    if (lineType === 'BUNDLE_PARENT') {
      throw new ApiException(
        'BUNDLE_PARENT line은 fulfillment 액션 대상이 아닙니다',
        409,
        'ORDER_ITEM_LINE_TYPE_INVALID',
      );
    }

    const lineStatus = this.normalizeOptionalText(data.line_status);
    if (lineStatus === 'CANCELED' || lineStatus === 'REFUNDED') {
      throw new ApiException(
        `종료 상태 order_item은 fulfillment 액션 대상이 아닙니다 (현재: ${lineStatus})`,
        409,
        'ORDER_ITEM_INVALID_STATE',
      );
    }

    return data;
  }

  private async getInventoryLevelOrThrow(
    variantId: string,
    locationId: string,
  ): Promise<InventoryLevelRow> {
    const { data, error } = await this.supabase
      .from('v2_inventory_levels')
      .select('id, on_hand_quantity, reserved_quantity, available_quantity')
      .eq('variant_id', variantId)
      .eq('location_id', locationId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '재고 레벨 조회 실패',
        500,
        'INVENTORY_LEVEL_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '재고 레벨이 없습니다. location/variant 세팅을 먼저 구성해주세요',
        404,
        'INVENTORY_LEVEL_NOT_FOUND',
      );
    }
    return data as InventoryLevelRow;
  }

  private async updateInventoryLevelWithOptimisticLock(
    current: InventoryLevelRow,
    next: {
      on_hand_quantity: number;
      reserved_quantity: number;
      updated_reason: string;
    },
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('v2_inventory_levels')
      .update({
        on_hand_quantity: next.on_hand_quantity,
        reserved_quantity: next.reserved_quantity,
        updated_reason: next.updated_reason,
      })
      .eq('id', current.id)
      .eq('on_hand_quantity', current.on_hand_quantity)
      .eq('reserved_quantity', current.reserved_quantity)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '재고 레벨 업데이트 실패',
        500,
        'INVENTORY_LEVEL_UPDATE_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '동시성 충돌로 재고 반영에 실패했습니다. 다시 시도해주세요.',
        409,
        'INVENTORY_LEVEL_CONFLICT',
      );
    }
  }

  private async findReservationByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('v2_inventory_reservations')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'idempotency key 조회 실패',
        500,
        'RESERVATION_IDEMPOTENCY_FETCH_FAILED',
      );
    }
    return data || null;
  }

  private async fetchReservationById(reservationId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_inventory_reservations')
      .select('*')
      .eq('id', reservationId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '재고 예약 조회 실패',
        500,
        'INVENTORY_RESERVATION_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '재고 예약을 찾을 수 없습니다',
        404,
        'INVENTORY_RESERVATION_NOT_FOUND',
      );
    }
    return data;
  }

  private countByCompositeKey(
    rows: any[],
    keySelector: (row: any) => string,
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const key = keySelector(row);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  private normalizeOpsLimit(value?: string | number | null): number {
    if (typeof value === 'number') {
      return Math.max(1, Math.min(100, Math.floor(value)));
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return Math.max(1, Math.min(100, parsed));
      }
    }
    return 20;
  }

  private readBooleanEnv(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private readCsvEnv(key: string): string[] {
    const raw = process.env[key];
    if (!raw) {
      return [];
    }
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private requireUuid(value: string | undefined, message: string): string {
    const text = this.normalizeOptionalText(value);
    if (!text || !this.isUuid(text)) {
      throw new ApiException(message, 400, 'VALIDATION_ERROR');
    }
    return text;
  }

  private normalizeOptionalUuid(value?: string | null): string | null {
    const text = this.normalizeOptionalText(value);
    if (!text) {
      return null;
    }
    if (!this.isUuid(text)) {
      throw new ApiException('UUID 형식이 올바르지 않습니다', 400, 'VALIDATION_ERROR');
    }
    return text;
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fieldName: string,
  ): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new ApiException(
        `${fieldName}는 1 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeOptionalPositiveInteger(
    value: number | null | undefined,
    fieldName: string,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Number.isInteger(value) || value <= 0) {
      throw new ApiException(
        `${fieldName}는 1 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeOptionalNonNegativeInteger(
    value: number | null | undefined,
    fieldName: string,
  ): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiException(
        `${fieldName}는 0 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeCurrencyCode(value?: string | null): string {
    const code = this.normalizeOptionalText(value);
    if (!code) {
      return 'KRW';
    }
    const normalized = code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new ApiException(
        'currency_code는 ISO-4217 3자리 코드여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return normalized;
  }

  private normalizeNonNegativeInteger(
    value: number | null | undefined,
    fieldName: string,
  ): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new ApiException(
        `${fieldName}는 0 이상의 정수여야 합니다`,
        500,
        'INTERNAL_STATE_ERROR',
      );
    }
    return value;
  }

  private normalizeAccessType(value?: DigitalAccessType): DigitalAccessType {
    if (!value || (value !== 'DOWNLOAD' && value !== 'STREAM' && value !== 'LICENSE')) {
      throw new ApiException(
        'access_type은 DOWNLOAD/STREAM/LICENSE 중 하나여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private mergeMetadata(
    base?: unknown,
    patch?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const safeBase =
      base && typeof base === 'object' && !Array.isArray(base)
        ? (base as Record<string, unknown>)
        : {};
    if (!patch) {
      return { ...safeBase };
    }
    return { ...safeBase, ...patch };
  }

  private normalizeOptionalIsoDateTime(value?: string | null): string | null {
    const text = this.normalizeOptionalText(value);
    if (!text) {
      return null;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiException(
        'expires_at은 유효한 ISO datetime이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed.toISOString();
  }

  private normalizeOptionalJsonObject(
    value?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!value) {
      return null;
    }
    if (Array.isArray(value) || typeof value !== 'object') {
      throw new ApiException(
        'metadata는 object 타입이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
