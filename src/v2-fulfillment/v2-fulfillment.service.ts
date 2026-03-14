import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'CANCELED';

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

@Injectable()
export class V2FulfillmentService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async reserveInventory(input: ReserveInventoryInput): Promise<any> {
    const orderId = this.requireUuid(input.order_id, 'order_id는 필수입니다');
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

  private async getOrderItemOrThrow(
    orderItemId: string,
    orderId: string,
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select('id, order_id, variant_id, quantity')
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
