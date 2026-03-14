import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
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

    await this.getFulfillmentByIdOrThrow(fulfillmentId);

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

    await this.getOrderItemOrThrow(orderItemId, orderId);

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
