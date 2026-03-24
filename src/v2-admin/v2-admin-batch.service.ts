import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import {
  V2AdminActionActor,
} from './v2-admin-action-executor.service';
import { V2AdminOrderTransitionService } from './v2-admin-order-transition.service';

type QueueLinearStage =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'PRODUCTION'
  | 'READY_TO_SHIP'
  | 'IN_TRANSIT'
  | 'DELIVERED';

type ProductionBatchStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
type ShippingBatchStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DISPATCHED'
  | 'COMPLETED'
  | 'CANCELED';

interface QueueRow {
  order_id: string;
  order_no: string;
  order_status: string;
  payment_status: string;
  fulfillment_status: string;
  grand_total: number;
  placed_at: string | null;
  created_at: string;
  waiting_shipment_count: number;
  in_transit_shipment_count: number;
  delivered_shipment_count: number;
  has_bundle: boolean;
  has_physical: boolean;
  has_digital: boolean;
  depositor_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  project_ids?: string[];
  campaign_ids?: string[];
}

interface OrderScopeContext {
  project_id: string | null;
  project_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  project_ids: string[];
  campaign_ids: string[];
}

interface BatchTransitionOrderStatus {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
}

@Injectable()
export class V2AdminBatchService {
  constructor(
    private readonly v2AdminOrderTransitionService: V2AdminOrderTransitionService,
  ) {}

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async listProductionCandidates(params: {
    limit?: string | number;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    projectId?: string;
    campaignId?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit, 200, 1000);
    const keyword = this.normalizeOptionalText(params.keyword)?.toLowerCase() || null;
    const dateFrom = this.normalizeOptionalDate(params.dateFrom, 'date_from');
    const dateTo = this.normalizeOptionalDate(params.dateTo, 'date_to');
    const projectId = this.normalizeOptionalUuid(params.projectId);
    const campaignId = this.normalizeOptionalUuid(params.campaignId);

    const rows = await this.fetchQueueRows(limit);
    const orderScopeByOrderId = await this.fetchOrderScopeByOrderIds(
      rows
        .map((row) => this.normalizeOptionalUuid(row.order_id))
        .filter((orderId: string | null): orderId is string => Boolean(orderId)),
    );

    const items = rows
      .filter((row) => this.resolveStageFromQueueRow(row) === 'PAYMENT_CONFIRMED')
      .filter((row) => this.matchesDateRange(row.placed_at || row.created_at, dateFrom, dateTo))
      .map((row) => {
        const normalizedOrderId = this.normalizeOptionalUuid(row.order_id);
        const scope = normalizedOrderId
          ? orderScopeByOrderId.get(normalizedOrderId)
          : null;
        const projectIds = scope?.project_ids || [];
        const campaignIds = scope?.campaign_ids || [];
        return {
          ...row,
          project_id: scope?.project_id || null,
          project_name: scope?.project_name || null,
          campaign_id: scope?.campaign_id || null,
          campaign_name: scope?.campaign_name || null,
          project_ids: projectIds,
          campaign_ids: campaignIds,
        };
      })
      .filter((row) => {
        if (projectId && !row.project_ids.includes(projectId)) {
          return false;
        }
        if (campaignId && !row.campaign_ids.includes(campaignId)) {
          return false;
        }
        return true;
      })
      .filter((row) => {
        if (!keyword) {
          return true;
        }
        return (
          row.order_no.toLowerCase().includes(keyword) ||
          String(row.depositor_name || '').toLowerCase().includes(keyword) ||
          row.order_id.toLowerCase().includes(keyword) ||
          String(row.project_name || '').toLowerCase().includes(keyword) ||
          String(row.campaign_name || '').toLowerCase().includes(keyword)
        );
      })
      .map((row) => ({
        ...row,
        linear_stage: 'PAYMENT_CONFIRMED',
      }));

    return {
      items,
      limit,
    };
  }

  async listProductionSavedViews(input: {
    ownerAdminId?: string;
  }): Promise<any> {
    const ownerAdminId = this.normalizeRequiredUuid(
      input.ownerAdminId,
      'owner_admin_id가 필요합니다.',
    );

    const { data, error } = await this.supabase
      .from('v2_admin_production_saved_views')
      .select('*')
      .eq('owner_admin_id', ownerAdminId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      throw new ApiException(
        '제작 뷰 목록 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_VIEW_LIST_FAILED',
      );
    }

    return {
      items: (data || []).map((row: any) => this.toProductionSavedViewRow(row)),
    };
  }

  async createProductionSavedView(input: {
    ownerAdminId?: string;
    name?: string;
    filter?: unknown;
    isDefault?: boolean;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const ownerAdminId = this.normalizeRequiredUuid(
      input.ownerAdminId,
      'owner_admin_id가 필요합니다.',
    );
    const name = this.normalizeRequiredText(input.name, '뷰 이름이 필요합니다.');
    const filter = this.normalizeProductionViewFilter(input.filter);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const isDefault = Boolean(input.isDefault);

    if (isDefault) {
      const { error: resetDefaultError } = await this.supabase
        .from('v2_admin_production_saved_views')
        .update({ is_default: false })
        .eq('owner_admin_id', ownerAdminId)
        .eq('is_default', true);
      if (resetDefaultError) {
        throw new ApiException(
          '기존 기본 뷰 초기화 실패',
          500,
          'V2_ADMIN_PRODUCTION_VIEW_DEFAULT_RESET_FAILED',
        );
      }
    }

    const { data, error } = await this.supabase
      .from('v2_admin_production_saved_views')
      .insert({
        owner_admin_id: ownerAdminId,
        name,
        filter_json: filter,
        is_default: isDefault,
        metadata,
      })
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '제작 뷰 생성 실패',
        500,
        'V2_ADMIN_PRODUCTION_VIEW_CREATE_FAILED',
      );
    }

    return this.toProductionSavedViewRow(data);
  }

  async updateProductionSavedView(input: {
    ownerAdminId?: string;
    viewId?: string;
    name?: string;
    filter?: unknown;
    isDefault?: boolean;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const ownerAdminId = this.normalizeRequiredUuid(
      input.ownerAdminId,
      'owner_admin_id가 필요합니다.',
    );
    const viewId = this.normalizeRequiredUuid(input.viewId, 'view_id가 필요합니다.');
    const current = await this.requireProductionSavedView(viewId, ownerAdminId);

    const nextName =
      input.name !== undefined
        ? this.normalizeRequiredText(input.name, '뷰 이름이 필요합니다.')
        : current.name;
    const nextFilter =
      input.filter !== undefined
        ? this.normalizeProductionViewFilter(input.filter)
        : this.normalizeProductionViewFilter(current.filter_json);
    const nextIsDefault =
      input.isDefault !== undefined ? Boolean(input.isDefault) : Boolean(current.is_default);
    const nextMetadata =
      input.metadata !== undefined
        ? this.normalizeOptionalJsonObject(input.metadata) || {}
        : this.normalizeOptionalJsonObject(current.metadata) || {};

    if (nextIsDefault) {
      const { error: resetDefaultError } = await this.supabase
        .from('v2_admin_production_saved_views')
        .update({ is_default: false })
        .eq('owner_admin_id', ownerAdminId)
        .eq('is_default', true)
        .neq('id', viewId);
      if (resetDefaultError) {
        throw new ApiException(
          '기존 기본 뷰 초기화 실패',
          500,
          'V2_ADMIN_PRODUCTION_VIEW_DEFAULT_RESET_FAILED',
        );
      }
    }

    const { data, error } = await this.supabase
      .from('v2_admin_production_saved_views')
      .update({
        name: nextName,
        filter_json: nextFilter,
        is_default: nextIsDefault,
        metadata: nextMetadata,
      })
      .eq('id', viewId)
      .eq('owner_admin_id', ownerAdminId)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '제작 뷰 수정 실패',
        500,
        'V2_ADMIN_PRODUCTION_VIEW_UPDATE_FAILED',
      );
    }

    return this.toProductionSavedViewRow(data);
  }

  async deleteProductionSavedView(input: {
    ownerAdminId?: string;
    viewId?: string;
  }): Promise<any> {
    const ownerAdminId = this.normalizeRequiredUuid(
      input.ownerAdminId,
      'owner_admin_id가 필요합니다.',
    );
    const viewId = this.normalizeRequiredUuid(input.viewId, 'view_id가 필요합니다.');

    await this.requireProductionSavedView(viewId, ownerAdminId);

    const { error } = await this.supabase
      .from('v2_admin_production_saved_views')
      .delete()
      .eq('id', viewId)
      .eq('owner_admin_id', ownerAdminId);

    if (error) {
      throw new ApiException(
        '제작 뷰 삭제 실패',
        500,
        'V2_ADMIN_PRODUCTION_VIEW_DELETE_FAILED',
      );
    }

    return {
      id: viewId,
      deleted: true,
    };
  }

  async previewProductionBatch(input: {
    orderIds?: string[];
  }): Promise<any> {
    const orderIds = this.normalizeOrderIds(input.orderIds);
    const queueMap = await this.fetchQueueMapByOrderIds(orderIds);

    const blockedRows: Array<{
      order_id: string;
      order_no: string | null;
      reason: string;
    }> = [];
    const validOrderIds: string[] = [];

    for (const orderId of orderIds) {
      const row = queueMap.get(orderId) || null;
      if (!row) {
        blockedRows.push({
          order_id: orderId,
          order_no: null,
          reason: '주문이 존재하지 않습니다.',
        });
        continue;
      }

      const stage = this.resolveStageFromQueueRow(row);
      if (stage !== 'PAYMENT_CONFIRMED') {
        blockedRows.push({
          order_id: orderId,
          order_no: row.order_no,
          reason: `현재 단계(${stage})에서는 제작 배치를 생성할 수 없습니다.`,
        });
        continue;
      }

      validOrderIds.push(orderId);
    }

    const aggregates = await this.buildProductionAggregates(validOrderIds);

    return {
      requested_order_count: orderIds.length,
      valid_order_count: validOrderIds.length,
      blocked_order_count: blockedRows.length,
      blocked_rows: blockedRows,
      valid_order_ids: validOrderIds,
      aggregates,
    };
  }

  async createProductionBatch(input: {
    title?: string;
    orderIds?: string[];
    notes?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const requestedTitle = this.normalizeOptionalText(input.title);
    const notes = this.normalizeOptionalText(input.notes);
    const idempotencyKey = this.normalizeOptionalText(input.idempotencyKey);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const actor = this.normalizeActor(input.actor);

    const preview = await this.previewProductionBatch({
      orderIds: input.orderIds,
    });

    const validOrderIds: string[] = preview.valid_order_ids || [];
    if (validOrderIds.length === 0) {
      throw new ApiException(
        '유효한 주문이 없어 제작 배치를 생성할 수 없습니다.',
        400,
        'V2_ADMIN_PRODUCTION_BATCH_EMPTY',
      );
    }

    const title = requestedTitle || (await this.generateProductionSnapshotTitle());
    const projectSummary = await this.buildProductionProjectSummary(validOrderIds);

    const batchNo = this.generateBatchNo('PB');
    const snapshot = {
      notes,
      idempotency_key: idempotencyKey,
      project_summary: projectSummary,
      preview,
    };

    const { data: batch, error: batchError } = await this.supabase
      .from('v2_admin_production_batches')
      .insert({
        batch_no: batchNo,
        status: 'DRAFT',
        title,
        order_count: validOrderIds.length,
        item_quantity_total: (preview.aggregates || []).reduce(
          (sum: number, row: any) => sum + Number(row.quantity_total || 0),
          0,
        ),
        snapshot_json: snapshot,
        created_by: actor.id,
        metadata: {
          ...metadata,
          project_summary: projectSummary,
          auto_title: requestedTitle ? false : true,
        },
      })
      .select('*')
      .maybeSingle();

    if (batchError || !batch) {
      throw new ApiException(
        '제작 배치 생성 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_CREATE_FAILED',
      );
    }

    const ordersSnapshot = await this.fetchOrdersSnapshot(validOrderIds);

    const orderInsertRows = validOrderIds.map((orderId) => {
      const queue = ordersSnapshot.queueMap.get(orderId);
      const order = ordersSnapshot.orderMap.get(orderId);
      const items = ordersSnapshot.itemsMap.get(orderId) || [];
      return {
        batch_id: batch.id,
        order_id: orderId,
        order_no: queue?.order_no || order?.order_no || orderId,
        stage_at_snapshot: this.resolveStageFromQueueRow(queue || {}),
        customer_snapshot: order?.customer_snapshot || null,
        pricing_snapshot: order?.pricing_snapshot || null,
        line_items_snapshot: items,
        metadata: {},
      };
    });

    const { error: orderInsertError } = await this.supabase
      .from('v2_admin_production_batch_orders')
      .insert(orderInsertRows);

    if (orderInsertError) {
      throw new ApiException(
        '제작 배치 주문 스냅샷 저장 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_ORDER_INSERT_FAILED',
      );
    }

    const aggInsertRows = (preview.aggregates || []).map((row: any) => ({
      batch_id: batch.id,
      product_id: row.product_id,
      variant_id: row.variant_id,
      product_name: row.product_name,
      variant_name: row.variant_name,
      quantity_total: row.quantity_total,
      order_count: row.order_count,
      metadata: {},
    }));

    if (aggInsertRows.length > 0) {
      const { error: aggInsertError } = await this.supabase
        .from('v2_admin_production_batch_item_aggregates')
        .insert(aggInsertRows);

      if (aggInsertError) {
        throw new ApiException(
          '제작 배치 집계 저장 실패',
          500,
          'V2_ADMIN_PRODUCTION_BATCH_AGG_INSERT_FAILED',
        );
      }
    }

    return this.getProductionBatchDetail(batch.id);
  }

  async listProductionBatches(params: {
    limit?: string | number;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit, 50, 500);
    const status = this.normalizeOptionalText(params.status);

    let query = this.supabase
      .from('v2_admin_production_batch_queue_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        '제작 배치 목록 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_LIST_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async getProductionBatchDetail(batchId: string): Promise<any> {
    const normalizedBatchId = this.normalizeRequiredUuid(
      batchId,
      'batch_id가 필요합니다.',
    );

    const { data: batch, error: batchError } = await this.supabase
      .from('v2_admin_production_batches')
      .select('*')
      .eq('id', normalizedBatchId)
      .maybeSingle();

    if (batchError || !batch) {
      throw new ApiException(
        '제작 배치를 찾을 수 없습니다.',
        404,
        'V2_ADMIN_PRODUCTION_BATCH_NOT_FOUND',
      );
    }

    const [ordersResult, aggResult] = await Promise.all([
      this.supabase
        .from('v2_admin_production_batch_orders')
        .select('*')
        .eq('batch_id', normalizedBatchId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('v2_admin_production_batch_item_aggregates')
        .select('*')
        .eq('batch_id', normalizedBatchId)
        .order('quantity_total', { ascending: false }),
    ]);

    if (ordersResult.error || aggResult.error) {
      throw new ApiException(
        '제작 배치 상세 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_DETAIL_FAILED',
      );
    }

    return {
      batch,
      orders: ordersResult.data || [],
      aggregates: aggResult.data || [],
    };
  }

  async activateProductionBatch(input: {
    batchId: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const batch = await this.requireProductionBatch(input.batchId);

    if (batch.status === 'ACTIVE' || batch.status === 'COMPLETED') {
      return this.getProductionBatchDetail(batch.id);
    }
    if (batch.status === 'CANCELED') {
      throw new ApiException(
        '취소된 제작 배치는 활성화할 수 없습니다.',
        400,
        'V2_ADMIN_PRODUCTION_BATCH_CANCELED',
      );
    }

    const actor = this.normalizeActor(input.actor);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId =
      this.normalizeOptionalText(input.requestId) || this.generateRequestId('prod-activate');
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const orderIds = await this.fetchProductionBatchOrderIds(batch.id);
    const transitionResult = await this.v2AdminOrderTransitionService.execute({
      orderIds,
      targetStage: 'PRODUCTION',
      reason,
      requestId,
      metadata,
      actor,
    });

    const orderStatusMap = this.buildOrderTransitionStatusMap(transitionResult);
    await this.updateProductionBatchOrderTransitionStatus(
      batch.id,
      'activate',
      orderStatusMap,
    );

    const { error: updateError } = await this.supabase
      .from('v2_admin_production_batches')
      .update({
        status: 'ACTIVE',
        activate_request_id: requestId,
        activated_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    if (updateError) {
      throw new ApiException(
        '제작 배치 활성화 상태 업데이트 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_ACTIVATE_UPDATE_FAILED',
      );
    }

    return this.getProductionBatchDetail(batch.id);
  }

  async completeProductionBatch(input: {
    batchId: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const batch = await this.requireProductionBatch(input.batchId);

    if (batch.status === 'COMPLETED') {
      return this.getProductionBatchDetail(batch.id);
    }
    if (batch.status !== 'ACTIVE') {
      throw new ApiException(
        'ACTIVE 상태의 제작 배치만 완료 처리할 수 있습니다.',
        400,
        'V2_ADMIN_PRODUCTION_BATCH_NOT_ACTIVE',
      );
    }

    const actor = this.normalizeActor(input.actor);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId =
      this.normalizeOptionalText(input.requestId) || this.generateRequestId('prod-complete');
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const orderIds = await this.fetchProductionBatchOrderIds(batch.id);
    const transitionResult = await this.v2AdminOrderTransitionService.execute({
      orderIds,
      targetStage: 'READY_TO_SHIP',
      reason,
      requestId,
      metadata,
      actor,
    });

    const orderStatusMap = this.buildOrderTransitionStatusMap(transitionResult);
    await this.updateProductionBatchOrderTransitionStatus(
      batch.id,
      'complete',
      orderStatusMap,
    );

    if (this.hasFailedOrderTransition(orderStatusMap)) {
      const { error: attemptUpdateError } = await this.supabase
        .from('v2_admin_production_batches')
        .update({
          complete_request_id: requestId,
        })
        .eq('id', batch.id);

      if (attemptUpdateError) {
        throw new ApiException(
          '제작 배치 완료 시도 이력 업데이트 실패',
          500,
          'V2_ADMIN_PRODUCTION_BATCH_COMPLETE_ATTEMPT_UPDATE_FAILED',
        );
      }

      return this.getProductionBatchDetail(batch.id);
    }

    const { error: updateError } = await this.supabase
      .from('v2_admin_production_batches')
      .update({
        status: 'COMPLETED',
        complete_request_id: requestId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    if (updateError) {
      throw new ApiException(
        '제작 배치 완료 상태 업데이트 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_COMPLETE_UPDATE_FAILED',
      );
    }

    return this.getProductionBatchDetail(batch.id);
  }

  async cancelProductionBatch(input: {
    batchId: string;
    reason?: string | null;
  }): Promise<any> {
    const batch = await this.requireProductionBatch(input.batchId);

    if (batch.status === 'COMPLETED') {
      throw new ApiException(
        '완료된 제작 배치는 취소할 수 없습니다.',
        400,
        'V2_ADMIN_PRODUCTION_BATCH_COMPLETED',
      );
    }

    const { error } = await this.supabase
      .from('v2_admin_production_batches')
      .update({
        status: 'CANCELED',
        canceled_at: new Date().toISOString(),
        cancel_reason: this.normalizeOptionalText(input.reason),
      })
      .eq('id', batch.id);

    if (error) {
      throw new ApiException(
        '제작 배치 취소 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_CANCEL_FAILED',
      );
    }

    return this.getProductionBatchDetail(batch.id);
  }

  async listShippingCandidates(params: {
    limit?: string | number;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    projectId?: string;
    campaignId?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit, 200, 1000);
    const keyword = this.normalizeOptionalText(params.keyword)?.toLowerCase() || null;
    const dateFrom = this.normalizeOptionalDate(params.dateFrom, 'date_from');
    const dateTo = this.normalizeOptionalDate(params.dateTo, 'date_to');
    const projectId = this.normalizeOptionalUuid(params.projectId);
    const campaignId = this.normalizeOptionalUuid(params.campaignId);

    const rows = await this.fetchQueueRows(limit);
    const orderScopeByOrderId = await this.fetchOrderScopeByOrderIds(
      rows
        .map((row) => this.normalizeOptionalUuid(row.order_id))
        .filter((orderId: string | null): orderId is string => Boolean(orderId)),
    );

    const items = rows
      .filter((row) => this.resolveStageFromQueueRow(row) === 'READY_TO_SHIP')
      .filter((row) => this.matchesDateRange(row.placed_at || row.created_at, dateFrom, dateTo))
      .map((row) => {
        const normalizedOrderId = this.normalizeOptionalUuid(row.order_id);
        const scope = normalizedOrderId
          ? orderScopeByOrderId.get(normalizedOrderId)
          : null;
        const projectIds = scope?.project_ids || [];
        const campaignIds = scope?.campaign_ids || [];
        return {
          ...row,
          project_id: scope?.project_id || null,
          project_name: scope?.project_name || null,
          campaign_id: scope?.campaign_id || null,
          campaign_name: scope?.campaign_name || null,
          project_ids: projectIds,
          campaign_ids: campaignIds,
        };
      })
      .filter((row) => {
        if (projectId && !row.project_ids.includes(projectId)) {
          return false;
        }
        if (campaignId && !row.campaign_ids.includes(campaignId)) {
          return false;
        }
        return true;
      })
      .filter((row) => {
        if (!keyword) {
          return true;
        }
        return (
          row.order_no.toLowerCase().includes(keyword) ||
          String(row.depositor_name || '').toLowerCase().includes(keyword) ||
          row.order_id.toLowerCase().includes(keyword) ||
          String(row.project_name || '').toLowerCase().includes(keyword) ||
          String(row.campaign_name || '').toLowerCase().includes(keyword)
        );
      })
      .map((row) => ({
        ...row,
        linear_stage: 'READY_TO_SHIP',
      }));

    return {
      items,
      limit,
    };
  }

  async previewShippingBatch(input: {
    orderIds?: string[];
  }): Promise<any> {
    const orderIds = this.normalizeOrderIds(input.orderIds);
    const queueMap = await this.fetchQueueMapByOrderIds(orderIds);
    const ordersMap = await this.fetchOrdersMapByIds(orderIds);
    const itemsMap = await this.fetchOrderItemsMapByOrderIds(orderIds);

    const blockedRows: Array<{
      order_id: string;
      order_no: string | null;
      reason: string;
    }> = [];
    const packingRows: any[] = [];
    const validOrderIds: string[] = [];

    for (const orderId of orderIds) {
      const row = queueMap.get(orderId) || null;
      if (!row) {
        blockedRows.push({
          order_id: orderId,
          order_no: null,
          reason: '주문이 존재하지 않습니다.',
        });
        continue;
      }

      const stage = this.resolveStageFromQueueRow(row);
      if (stage !== 'READY_TO_SHIP') {
        blockedRows.push({
          order_id: orderId,
          order_no: row.order_no,
          reason: `현재 단계(${stage})에서는 배송 배치를 생성할 수 없습니다.`,
        });
        continue;
      }

      const order = ordersMap.get(orderId) || null;
      const shippingSnapshot = this.normalizeOptionalJsonObject(
        order?.shipping_address_snapshot,
      );
      const items = itemsMap.get(orderId) || [];

      validOrderIds.push(orderId);
      packingRows.push({
        order_id: orderId,
        order_no: row.order_no,
        recipient_name:
          this.readSnapshotText(shippingSnapshot, 'name') ||
          this.readSnapshotText(shippingSnapshot, 'receiver_name') ||
          this.readSnapshotText(
            this.normalizeOptionalJsonObject(order?.customer_snapshot),
            'name',
          ),
        recipient_phone:
          this.readSnapshotText(shippingSnapshot, 'phone') ||
          this.readSnapshotText(shippingSnapshot, 'receiver_phone') ||
          this.readSnapshotText(
            this.normalizeOptionalJsonObject(order?.customer_snapshot),
            'phone',
          ),
        address_summary: this.buildAddressSummary(shippingSnapshot),
        item_count: items.reduce(
          (sum: number, item: any) => sum + Number(item.quantity || 0),
          0,
        ),
      });
    }

    return {
      requested_order_count: orderIds.length,
      valid_order_count: validOrderIds.length,
      blocked_order_count: blockedRows.length,
      blocked_rows: blockedRows,
      valid_order_ids: validOrderIds,
      packing_rows: packingRows,
    };
  }

  async createShippingBatch(input: {
    title?: string;
    orderIds?: string[];
    notes?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const title = this.normalizeRequiredText(input.title, 'title이 필요합니다.');
    const notes = this.normalizeOptionalText(input.notes);
    const idempotencyKey = this.normalizeOptionalText(input.idempotencyKey);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const actor = this.normalizeActor(input.actor);

    const preview = await this.previewShippingBatch({
      orderIds: input.orderIds,
    });

    const validOrderIds: string[] = preview.valid_order_ids || [];
    if (validOrderIds.length === 0) {
      throw new ApiException(
        '유효한 주문이 없어 배송 배치를 생성할 수 없습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_EMPTY',
      );
    }

    const batchNo = this.generateBatchNo('SB');

    const { data: batch, error: batchError } = await this.supabase
      .from('v2_admin_shipping_batches')
      .insert({
        batch_no: batchNo,
        status: 'DRAFT',
        title,
        order_count: validOrderIds.length,
        package_count: 0,
        snapshot_json: {
          notes,
          idempotency_key: idempotencyKey,
          preview,
        },
        created_by: actor.id,
        metadata,
      })
      .select('*')
      .maybeSingle();

    if (batchError || !batch) {
      throw new ApiException(
        '배송 배치 생성 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_CREATE_FAILED',
      );
    }

    const ordersSnapshot = await this.fetchOrdersSnapshot(validOrderIds);

    const orderInsertRows = validOrderIds.map((orderId) => {
      const queue = ordersSnapshot.queueMap.get(orderId);
      const order = ordersSnapshot.orderMap.get(orderId);
      const shippingSnapshot = this.normalizeOptionalJsonObject(
        order?.shipping_address_snapshot,
      );
      const items = ordersSnapshot.itemsMap.get(orderId) || [];

      return {
        batch_id: batch.id,
        order_id: orderId,
        order_no: queue?.order_no || order?.order_no || orderId,
        stage_at_snapshot: this.resolveStageFromQueueRow(queue || {}),
        recipient_name:
          this.readSnapshotText(shippingSnapshot, 'name') ||
          this.readSnapshotText(shippingSnapshot, 'receiver_name') || null,
        recipient_phone:
          this.readSnapshotText(shippingSnapshot, 'phone') ||
          this.readSnapshotText(shippingSnapshot, 'receiver_phone') || null,
        shipping_address_snapshot: shippingSnapshot || null,
        line_items_snapshot: items,
        metadata: {},
      };
    });

    const { error: orderInsertError } = await this.supabase
      .from('v2_admin_shipping_batch_orders')
      .insert(orderInsertRows);

    if (orderInsertError) {
      throw new ApiException(
        '배송 배치 주문 스냅샷 저장 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_ORDER_INSERT_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  async listShippingBatches(params: {
    limit?: string | number;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit, 50, 500);
    const status = this.normalizeOptionalText(params.status);

    let query = this.supabase
      .from('v2_admin_shipping_batch_queue_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        '배송 배치 목록 조회 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_LIST_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async getShippingBatchDetail(batchId: string): Promise<any> {
    const normalizedBatchId = this.normalizeRequiredUuid(
      batchId,
      'batch_id가 필요합니다.',
    );

    const { data: batch, error: batchError } = await this.supabase
      .from('v2_admin_shipping_batches')
      .select('*')
      .eq('id', normalizedBatchId)
      .maybeSingle();

    if (batchError || !batch) {
      throw new ApiException(
        '배송 배치를 찾을 수 없습니다.',
        404,
        'V2_ADMIN_SHIPPING_BATCH_NOT_FOUND',
      );
    }

    const [ordersResult, packagesResult] = await Promise.all([
      this.supabase
        .from('v2_admin_shipping_batch_orders')
        .select('*')
        .eq('batch_id', normalizedBatchId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('v2_admin_shipping_batch_packages')
        .select('*')
        .eq('batch_id', normalizedBatchId)
        .order('created_at', { ascending: true }),
    ]);

    if (ordersResult.error || packagesResult.error) {
      throw new ApiException(
        '배송 배치 상세 조회 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_DETAIL_FAILED',
      );
    }

    return {
      batch,
      orders: ordersResult.data || [],
      packages: packagesResult.data || [],
    };
  }

  async saveShippingBatchPackages(input: {
    batchId: string;
    packages?: Array<{
      batchOrderId?: string;
      shipmentId?: string | null;
      carrierCode?: string | null;
      trackingNo?: string | null;
      notes?: string | null;
    }>;
  }): Promise<any> {
    const batch = await this.requireShippingBatch(input.batchId);
    if (batch.status === 'DRAFT') {
      throw new ApiException(
        '운송장 등록 전 배치를 ACTIVE로 전환해 주세요.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_NOT_ACTIVE',
      );
    }
    if (batch.status === 'CANCELED' || batch.status === 'COMPLETED') {
      throw new ApiException(
        '완료/취소된 배송 배치는 운송장 수정이 불가능합니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_PACKAGE_LOCKED',
      );
    }

    const packages = (input.packages || [])
      .map((item) => ({
        batch_order_id: this.normalizeRequiredUuid(
          item.batchOrderId,
          'batch_order_id가 필요합니다.',
        ),
        shipment_id: this.normalizeOptionalUuid(item.shipmentId),
        carrier_code: this.normalizeOptionalText(item.carrierCode),
        tracking_no: this.normalizeOptionalText(item.trackingNo),
        notes: this.normalizeOptionalText(item.notes),
      }))
      .filter((item) => item.tracking_no);

    if (packages.length === 0) {
      throw new ApiException(
        '저장할 운송장 데이터가 없습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_PACKAGE_EMPTY',
      );
    }

    const batchOrderIds = packages.map((item) => item.batch_order_id);

    const { error: deleteError } = await this.supabase
      .from('v2_admin_shipping_batch_packages')
      .delete()
      .eq('batch_id', batch.id)
      .in('batch_order_id', batchOrderIds);

    if (deleteError) {
      throw new ApiException(
        '기존 운송장 데이터 정리 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_PACKAGE_DELETE_FAILED',
      );
    }

    const insertRows = packages.map((item) => ({
      batch_id: batch.id,
      batch_order_id: item.batch_order_id,
      shipment_id: item.shipment_id,
      carrier_code: item.carrier_code,
      tracking_no: item.tracking_no,
      notes: item.notes,
      label_printed_at: new Date().toISOString(),
      metadata: {},
    }));

    const { error: insertError } = await this.supabase
      .from('v2_admin_shipping_batch_packages')
      .insert(insertRows);

    if (insertError) {
      throw new ApiException(
        '운송장 저장 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_PACKAGE_INSERT_FAILED',
      );
    }

    const { error: batchUpdateError } = await this.supabase
      .from('v2_admin_shipping_batches')
      .update({
        package_count: insertRows.length,
      })
      .eq('id', batch.id);

    if (batchUpdateError) {
      throw new ApiException(
        '배송 배치 패키지 수 업데이트 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_PACKAGE_COUNT_UPDATE_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  async activateShippingBatch(input: {
    batchId: string;
  }): Promise<any> {
    const batch = await this.requireShippingBatch(input.batchId);

    if (
      batch.status === 'ACTIVE' ||
      batch.status === 'DISPATCHED' ||
      batch.status === 'COMPLETED'
    ) {
      return this.getShippingBatchDetail(batch.id);
    }
    if (batch.status === 'CANCELED') {
      throw new ApiException(
        '취소된 배송 배치는 활성화할 수 없습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_CANCELED',
      );
    }

    const { error } = await this.supabase
      .from('v2_admin_shipping_batches')
      .update({ status: 'ACTIVE' })
      .eq('id', batch.id);

    if (error) {
      throw new ApiException(
        '배송 배치 활성화 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_ACTIVATE_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  async dispatchShippingBatch(input: {
    batchId: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const batch = await this.requireShippingBatch(input.batchId);

    if (batch.status === 'DISPATCHED' || batch.status === 'COMPLETED') {
      return this.getShippingBatchDetail(batch.id);
    }
    if (batch.status === 'CANCELED') {
      throw new ApiException(
        '취소된 배송 배치는 출고할 수 없습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_CANCELED',
      );
    }
    if (batch.status !== 'ACTIVE') {
      throw new ApiException(
        'ACTIVE 상태의 배송 배치만 출고할 수 있습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_NOT_ACTIVE',
      );
    }

    const actor = this.normalizeActor(input.actor);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId =
      this.normalizeOptionalText(input.requestId) || this.generateRequestId('ship-dispatch');
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const orderIds = await this.fetchShippingBatchOrderIds(batch.id);
    const transitionResult = await this.v2AdminOrderTransitionService.execute({
      orderIds,
      targetStage: 'IN_TRANSIT',
      reason,
      requestId,
      metadata,
      actor,
    });

    const orderStatusMap = this.buildOrderTransitionStatusMap(transitionResult);
    await this.updateShippingBatchOrderTransitionStatus(
      batch.id,
      'dispatch',
      orderStatusMap,
    );

    if (this.hasFailedOrderTransition(orderStatusMap)) {
      const { error: attemptUpdateError } = await this.supabase
        .from('v2_admin_shipping_batches')
        .update({
          dispatch_request_id: requestId,
        })
        .eq('id', batch.id);

      if (attemptUpdateError) {
        throw new ApiException(
          '배송 배치 출고 시도 이력 업데이트 실패',
          500,
          'V2_ADMIN_SHIPPING_BATCH_DISPATCH_ATTEMPT_UPDATE_FAILED',
        );
      }

      return this.getShippingBatchDetail(batch.id);
    }

    const { error: updateError } = await this.supabase
      .from('v2_admin_shipping_batches')
      .update({
        status: 'DISPATCHED',
        dispatch_request_id: requestId,
        dispatched_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    if (updateError) {
      throw new ApiException(
        '배송 배치 출고 상태 업데이트 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_DISPATCH_UPDATE_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  async completeShippingBatch(input: {
    batchId: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const batch = await this.requireShippingBatch(input.batchId);

    if (batch.status === 'COMPLETED') {
      return this.getShippingBatchDetail(batch.id);
    }
    if (batch.status !== 'DISPATCHED') {
      throw new ApiException(
        'DISPATCHED 상태의 배송 배치만 완료 처리할 수 있습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_NOT_DISPATCHED',
      );
    }

    const actor = this.normalizeActor(input.actor);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId =
      this.normalizeOptionalText(input.requestId) || this.generateRequestId('ship-complete');
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};

    const orderIds = await this.fetchShippingBatchOrderIds(batch.id);
    const transitionResult = await this.v2AdminOrderTransitionService.execute({
      orderIds,
      targetStage: 'DELIVERED',
      reason,
      requestId,
      metadata,
      actor,
    });

    const orderStatusMap = this.buildOrderTransitionStatusMap(transitionResult);
    await this.updateShippingBatchOrderTransitionStatus(
      batch.id,
      'complete',
      orderStatusMap,
    );

    if (this.hasFailedOrderTransition(orderStatusMap)) {
      const { error: attemptUpdateError } = await this.supabase
        .from('v2_admin_shipping_batches')
        .update({
          complete_request_id: requestId,
        })
        .eq('id', batch.id);

      if (attemptUpdateError) {
        throw new ApiException(
          '배송 배치 완료 시도 이력 업데이트 실패',
          500,
          'V2_ADMIN_SHIPPING_BATCH_COMPLETE_ATTEMPT_UPDATE_FAILED',
        );
      }

      return this.getShippingBatchDetail(batch.id);
    }

    const { error: updateError } = await this.supabase
      .from('v2_admin_shipping_batches')
      .update({
        status: 'COMPLETED',
        complete_request_id: requestId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    if (updateError) {
      throw new ApiException(
        '배송 배치 완료 상태 업데이트 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_COMPLETE_UPDATE_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  async cancelShippingBatch(input: {
    batchId: string;
    reason?: string | null;
  }): Promise<any> {
    const batch = await this.requireShippingBatch(input.batchId);

    if (batch.status === 'COMPLETED') {
      throw new ApiException(
        '완료된 배송 배치는 취소할 수 없습니다.',
        400,
        'V2_ADMIN_SHIPPING_BATCH_COMPLETED',
      );
    }

    const { error } = await this.supabase
      .from('v2_admin_shipping_batches')
      .update({
        status: 'CANCELED',
        canceled_at: new Date().toISOString(),
        cancel_reason: this.normalizeOptionalText(input.reason),
      })
      .eq('id', batch.id);

    if (error) {
      throw new ApiException(
        '배송 배치 취소 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_CANCEL_FAILED',
      );
    }

    return this.getShippingBatchDetail(batch.id);
  }

  private async requireProductionSavedView(
    viewId: string,
    ownerAdminId: string,
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_admin_production_saved_views')
      .select('*')
      .eq('id', viewId)
      .eq('owner_admin_id', ownerAdminId)
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '제작 뷰를 찾을 수 없습니다.',
        404,
        'V2_ADMIN_PRODUCTION_VIEW_NOT_FOUND',
      );
    }

    return data;
  }

  private normalizeProductionViewFilter(
    raw: unknown,
  ): {
    project_id: string | null;
    campaign_id: string | null;
  } {
    const filter = this.normalizeOptionalJsonObject(raw) || {};
    return {
      project_id: this.normalizeOptionalUuid(filter.project_id),
      campaign_id: this.normalizeOptionalUuid(filter.campaign_id),
    };
  }

  private toProductionSavedViewRow(row: any): {
    id: string;
    name: string;
    filter: {
      project_id: string | null;
      campaign_id: string | null;
    };
    is_default: boolean;
    created_at: string;
    updated_at: string;
  } {
    const filter = this.normalizeProductionViewFilter(row?.filter_json);
    return {
      id: this.normalizeRequiredUuid(row?.id, 'view id가 필요합니다.'),
      name: this.normalizeRequiredText(row?.name, 'view name이 필요합니다.'),
      filter,
      is_default: Boolean(row?.is_default),
      created_at: this.normalizeRequiredText(
        row?.created_at,
        'view created_at이 필요합니다.',
      ),
      updated_at: this.normalizeRequiredText(
        row?.updated_at,
        'view updated_at이 필요합니다.',
      ),
    };
  }

  private async requireProductionBatch(batchId: string): Promise<any> {
    const normalizedBatchId = this.normalizeRequiredUuid(
      batchId,
      'batch_id가 필요합니다.',
    );
    const { data, error } = await this.supabase
      .from('v2_admin_production_batches')
      .select('*')
      .eq('id', normalizedBatchId)
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '제작 배치를 찾을 수 없습니다.',
        404,
        'V2_ADMIN_PRODUCTION_BATCH_NOT_FOUND',
      );
    }

    return data;
  }

  private async requireShippingBatch(batchId: string): Promise<any> {
    const normalizedBatchId = this.normalizeRequiredUuid(
      batchId,
      'batch_id가 필요합니다.',
    );
    const { data, error } = await this.supabase
      .from('v2_admin_shipping_batches')
      .select('*')
      .eq('id', normalizedBatchId)
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '배송 배치를 찾을 수 없습니다.',
        404,
        'V2_ADMIN_SHIPPING_BATCH_NOT_FOUND',
      );
    }

    return data;
  }

  private async fetchProductionBatchOrderIds(batchId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('v2_admin_production_batch_orders')
      .select('order_id')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        '제작 배치 주문 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_ORDERS_FETCH_FAILED',
      );
    }

    return (data || [])
      .map((row: any) => this.normalizeOptionalUuid(row.order_id))
      .filter((orderId: string | null): orderId is string => Boolean(orderId));
  }

  private async fetchShippingBatchOrderIds(batchId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('v2_admin_shipping_batch_orders')
      .select('order_id')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        '배송 배치 주문 조회 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_ORDERS_FETCH_FAILED',
      );
    }

    return (data || [])
      .map((row: any) => this.normalizeOptionalUuid(row.order_id))
      .filter((orderId: string | null): orderId is string => Boolean(orderId));
  }

  private async updateProductionBatchOrderTransitionStatus(
    batchId: string,
    mode: 'activate' | 'complete',
    statusMap: Map<string, BatchTransitionOrderStatus>,
  ): Promise<void> {
    const fieldName =
      mode === 'activate' ? 'transition_activate_status' : 'transition_complete_status';

    const { data, error } = await this.supabase
      .from('v2_admin_production_batch_orders')
      .select('id, order_id')
      .eq('batch_id', batchId);

    if (error) {
      throw new ApiException(
        '제작 배치 주문 상태 업데이트 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_ORDER_STATUS_FETCH_FAILED',
      );
    }

    for (const row of data || []) {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      const status = orderId ? statusMap.get(orderId) : null;
      const updatePayload: Record<string, unknown> = {
        [fieldName]: status?.status || 'SKIPPED',
        error_message: status?.errorMessage || null,
      };

      const { error: updateError } = await this.supabase
        .from('v2_admin_production_batch_orders')
        .update(updatePayload)
        .eq('id', row.id);

      if (updateError) {
        throw new ApiException(
          '제작 배치 주문 상태 업데이트 실패',
          500,
          'V2_ADMIN_PRODUCTION_BATCH_ORDER_STATUS_UPDATE_FAILED',
        );
      }
    }
  }

  private async updateShippingBatchOrderTransitionStatus(
    batchId: string,
    mode: 'dispatch' | 'complete',
    statusMap: Map<string, BatchTransitionOrderStatus>,
  ): Promise<void> {
    const fieldName =
      mode === 'dispatch'
        ? 'dispatch_transition_status'
        : 'delivery_transition_status';

    const { data, error } = await this.supabase
      .from('v2_admin_shipping_batch_orders')
      .select('id, order_id')
      .eq('batch_id', batchId);

    if (error) {
      throw new ApiException(
        '배송 배치 주문 상태 업데이트 조회 실패',
        500,
        'V2_ADMIN_SHIPPING_BATCH_ORDER_STATUS_FETCH_FAILED',
      );
    }

    for (const row of data || []) {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      const status = orderId ? statusMap.get(orderId) : null;
      const updatePayload: Record<string, unknown> = {
        [fieldName]: status?.status || 'SKIPPED',
        error_message: status?.errorMessage || null,
      };

      const { error: updateError } = await this.supabase
        .from('v2_admin_shipping_batch_orders')
        .update(updatePayload)
        .eq('id', row.id);

      if (updateError) {
        throw new ApiException(
          '배송 배치 주문 상태 업데이트 실패',
          500,
          'V2_ADMIN_SHIPPING_BATCH_ORDER_STATUS_UPDATE_FAILED',
        );
      }
    }
  }

  private buildOrderTransitionStatusMap(result: any): Map<string, BatchTransitionOrderStatus> {
    const map = new Map<string, BatchTransitionOrderStatus>();
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const logs = Array.isArray(result?.execute?.logs) ? result.execute.logs : [];

    for (const row of rows) {
      const orderId = this.normalizeOptionalUuid(row?.order_id);
      if (!orderId) {
        continue;
      }

      const blockedReasons = Array.isArray(row?.blocked_reasons)
        ? row.blocked_reasons
        : [];
      if (blockedReasons.length > 0 || !row?.executable) {
        map.set(orderId, {
          status: 'FAILED',
          errorMessage:
            blockedReasons.length > 0
              ? blockedReasons.join(' | ')
              : '실행 가능한 상태가 아닙니다.',
        });
        continue;
      }

      const rowLogs = logs.filter(
        (item: any) => this.normalizeOptionalUuid(item?.order_id) === orderId,
      );
      const failedLog = rowLogs.find((item: any) => item?.status === 'FAILED');

      if (failedLog) {
        map.set(orderId, {
          status: 'FAILED',
          errorMessage:
            this.normalizeOptionalText(failedLog?.error_message) ||
            this.normalizeOptionalText(failedLog?.error_code) ||
            '알 수 없는 전이 오류',
        });
        continue;
      }

      if (rowLogs.length === 0) {
        map.set(orderId, {
          status: 'SKIPPED',
          errorMessage: '전이 로그가 생성되지 않았습니다.',
        });
        continue;
      }

      map.set(orderId, {
        status: 'SUCCEEDED',
        errorMessage: null,
      });
    }

    return map;
  }

  private hasFailedOrderTransition(
    statusMap: Map<string, BatchTransitionOrderStatus>,
  ): boolean {
    for (const status of statusMap.values()) {
      if (status.status === 'FAILED') {
        return true;
      }
    }
    return false;
  }

  private async buildProductionAggregates(orderIds: string[]): Promise<any[]> {
    if (orderIds.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select(
        'order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot, quantity, line_type, line_status',
      )
      .in('order_id', orderIds);

    if (error) {
      throw new ApiException(
        '제작 배치 집계 조회 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_AGG_FETCH_FAILED',
      );
    }

    const aggregateMap = new Map<
      string,
      {
        product_id: string | null;
        variant_id: string | null;
        product_name: string;
        variant_name: string | null;
        quantity_total: number;
        order_id_set: Set<string>;
      }
    >();

    for (const row of data || []) {
      const lineStatus = String(row.line_status || '').toUpperCase();
      if (lineStatus === 'CANCELED' || lineStatus === 'REFUNDED') {
        continue;
      }
      if (String(row.line_type || '').toUpperCase() === 'BUNDLE_PARENT') {
        continue;
      }

      const orderId = this.normalizeOptionalUuid(row.order_id);
      if (!orderId) {
        continue;
      }

      const variantId = this.normalizeOptionalUuid(row.variant_id);
      const productId = this.normalizeOptionalUuid(row.product_id);
      const key = variantId || `product:${productId || 'unknown'}:${String(row.product_name_snapshot || '')}`;

      const existing = aggregateMap.get(key) || {
        product_id: productId,
        variant_id: variantId,
        product_name:
          this.normalizeOptionalText(row.product_name_snapshot) || '이름 없는 상품',
        variant_name: this.normalizeOptionalText(row.variant_name_snapshot),
        quantity_total: 0,
        order_id_set: new Set<string>(),
      };

      existing.quantity_total += Number(row.quantity || 0);
      existing.order_id_set.add(orderId);
      aggregateMap.set(key, existing);
    }

    return Array.from(aggregateMap.values())
      .map((row) => ({
        product_id: row.product_id,
        variant_id: row.variant_id,
        product_name: row.product_name,
        variant_name: row.variant_name,
        quantity_total: row.quantity_total,
        order_count: row.order_id_set.size,
      }))
      .sort((a, b) => b.quantity_total - a.quantity_total);
  }

  private async generateProductionSnapshotTitle(): Promise<string> {
    const now = new Date();
    const datePart = this.formatSnapshotDatePart(now);
    const [dayStartIso, nextDayIso] = this.getSnapshotDayRangeIso(now);

    const { data, error } = await this.supabase
      .from('v2_admin_production_batches')
      .select('title')
      .gte('created_at', dayStartIso)
      .lt('created_at', nextDayIso)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        '제작 스냅샷 번호 생성 실패',
        500,
        'V2_ADMIN_PRODUCTION_BATCH_TITLE_GENERATE_FAILED',
      );
    }

    const usedSequences = new Set<number>();
    for (const row of data || []) {
      const title = this.normalizeOptionalText(row?.title);
      const match = title?.match(/^(\d{6})(\d{2,})$/);
      if (!match || match[1] !== datePart) {
        continue;
      }
      const seq = Number.parseInt(match[2], 10);
      if (Number.isInteger(seq) && seq > 0) {
        usedSequences.add(seq);
      }
    }

    let nextSequence = 1;
    while (usedSequences.has(nextSequence)) {
      nextSequence += 1;
    }

    return `${datePart}${String(nextSequence).padStart(2, '0')}`;
  }

  private async buildProductionProjectSummary(orderIds: string[]): Promise<string> {
    const scopeByOrderId = await this.fetchOrderScopeByOrderIds(orderIds);
    const projectNames: string[] = [];

    for (const scope of scopeByOrderId.values()) {
      const projectName = this.normalizeOptionalText(scope.project_name);
      if (projectName) {
        projectNames.push(projectName);
      }
    }

    const uniqueProjectNames = Array.from(new Set(projectNames));
    if (uniqueProjectNames.length === 0) {
      return '프로젝트 미지정';
    }
    if (uniqueProjectNames.length === 1) {
      return uniqueProjectNames[0];
    }
    return `${uniqueProjectNames[0]} 외 ${uniqueProjectNames.length - 1}`;
  }

  private async fetchQueueRows(limit: number): Promise<QueueRow[]> {
    const { data, error } = await this.supabase
      .from('v2_admin_order_queue_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new ApiException(
        'order queue 조회 실패',
        500,
        'V2_ADMIN_BATCH_ORDER_QUEUE_FETCH_FAILED',
      );
    }

    const rows = (data || []) as QueueRow[];
    const orderIds = rows
      .map((row) => this.normalizeOptionalUuid(row.order_id))
      .filter((orderId: string | null): orderId is string => Boolean(orderId));

    const depositorNameByOrderId = await this.fetchOrderDepositorNameByOrderIds(
      orderIds,
    );

    return rows.map((row) => {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      return {
        ...row,
        depositor_name: orderId ? depositorNameByOrderId.get(orderId) || null : null,
      };
    });
  }

  private async fetchQueueMapByOrderIds(orderIds: string[]): Promise<Map<string, QueueRow>> {
    if (orderIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_admin_order_queue_view')
      .select('*')
      .in('order_id', orderIds);

    if (error) {
      throw new ApiException(
        '배치용 order queue 조회 실패',
        500,
        'V2_ADMIN_BATCH_QUEUE_BY_IDS_FETCH_FAILED',
      );
    }

    const rows = (data || []) as QueueRow[];
    const depositorNameByOrderId = await this.fetchOrderDepositorNameByOrderIds(orderIds);

    const map = new Map<string, QueueRow>();
    for (const row of rows) {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      if (!orderId) {
        continue;
      }
      map.set(orderId, {
        ...row,
        depositor_name: depositorNameByOrderId.get(orderId) || null,
      });
    }

    return map;
  }

  private async fetchOrdersMapByIds(orderIds: string[]): Promise<Map<string, any>> {
    if (orderIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_orders')
      .select('*')
      .in('id', orderIds);

    if (error) {
      throw new ApiException(
        'v2_orders 조회 실패',
        500,
        'V2_ADMIN_BATCH_ORDERS_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalUuid(row.id);
      if (!orderId) {
        continue;
      }
      map.set(orderId, row);
    }

    return map;
  }

  private async fetchOrderItemsMapByOrderIds(orderIds: string[]): Promise<Map<string, any[]>> {
    if (orderIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select('*')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'v2_order_items 조회 실패',
        500,
        'V2_ADMIN_BATCH_ORDER_ITEMS_FETCH_FAILED',
      );
    }

    const map = new Map<string, any[]>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      if (!orderId) {
        continue;
      }
      const list = map.get(orderId) || [];
      list.push(row);
      map.set(orderId, list);
    }

    return map;
  }

  private async fetchOrdersSnapshot(orderIds: string[]): Promise<{
    queueMap: Map<string, QueueRow>;
    orderMap: Map<string, any>;
    itemsMap: Map<string, any[]>;
  }> {
    const [queueMap, orderMap, itemsMap] = await Promise.all([
      this.fetchQueueMapByOrderIds(orderIds),
      this.fetchOrdersMapByIds(orderIds),
      this.fetchOrderItemsMapByOrderIds(orderIds),
    ]);

    return {
      queueMap,
      orderMap,
      itemsMap,
    };
  }

  private async fetchOrderScopeByOrderIds(
    orderIds: string[],
  ): Promise<Map<string, OrderScopeContext>> {
    const normalizedOrderIds = Array.from(
      new Set(
        (orderIds || [])
          .map((orderId) => this.normalizeOptionalUuid(orderId))
          .filter((orderId): orderId is string => Boolean(orderId)),
      ),
    );

    if (normalizedOrderIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_order_items')
      .select(
        [
          'order_id',
          'project_id_snapshot',
          'project_name_snapshot',
          'campaign_id_snapshot',
          'campaign_name_snapshot',
          'display_snapshot',
          'line_status',
          'created_at',
        ].join(', '),
      )
      .in('order_id', normalizedOrderIds)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        '주문 프로젝트/캠페인 정보 조회 실패',
        500,
        'V2_ADMIN_BATCH_ORDER_SCOPE_FETCH_FAILED',
      );
    }

    const activeRows = (data || []).filter((row: any) => {
      const lineStatus = String(row.line_status || '').toUpperCase();
      return lineStatus !== 'CANCELED' && lineStatus !== 'REFUNDED';
    });

    const projectIdValues = activeRows
      .map((row: any) => this.normalizeOptionalUuid(row.project_id_snapshot))
      .filter((value: string | null): value is string => Boolean(value));
    const campaignIdValues = activeRows
      .map((row: any) => this.normalizeOptionalUuid(row.campaign_id_snapshot))
      .filter((value: string | null): value is string => Boolean(value));
    const priceListIdValues = activeRows
      .map((row: any) => this.extractSelectedPriceListId(row.display_snapshot))
      .filter((value: string | null): value is string => Boolean(value));

    const projectIds = Array.from(new Set<string>(projectIdValues));
    const campaignIds = Array.from(new Set<string>(campaignIdValues));
    const priceListIds = Array.from(new Set<string>(priceListIdValues));

    const [projectNameById, campaignIdByPriceListId] = await Promise.all([
      this.fetchProjectNameByIds(projectIds),
      this.fetchCampaignIdByPriceListIds(priceListIds),
    ]);

    const resolvedCampaignIds = Array.from(
      new Set<string>([
        ...campaignIds,
        ...Array.from(campaignIdByPriceListId.values()),
      ]),
    );
    const campaignNameById = await this.fetchCampaignNameByIds(resolvedCampaignIds);

    const scopeByOrderId = new Map<string, OrderScopeContext>();

    for (const row of activeRows) {
      const orderId = this.normalizeOptionalUuid(row.order_id);
      if (!orderId) {
        continue;
      }

      const projectId = this.normalizeOptionalUuid(row.project_id_snapshot);
      const projectName =
        this.normalizeOptionalText(row.project_name_snapshot) ||
        (projectId ? projectNameById.get(projectId) || null : null);
      const selectedPriceListId = this.extractSelectedPriceListId(
        row.display_snapshot,
      );
      const campaignIdFromPriceList = selectedPriceListId
        ? campaignIdByPriceListId.get(selectedPriceListId) || null
        : null;
      const campaignId =
        this.normalizeOptionalUuid(row.campaign_id_snapshot) ||
        campaignIdFromPriceList;
      const campaignName =
        this.normalizeOptionalText(row.campaign_name_snapshot) ||
        (campaignId ? campaignNameById.get(campaignId) || null : null);

      const existing = scopeByOrderId.get(orderId) || {
        project_id: null,
        project_name: null,
        campaign_id: null,
        campaign_name: null,
        project_ids: [],
        campaign_ids: [],
      };

      if (projectId && !existing.project_ids.includes(projectId)) {
        existing.project_ids.push(projectId);
      }
      if (campaignId && !existing.campaign_ids.includes(campaignId)) {
        existing.campaign_ids.push(campaignId);
      }

      if (!existing.project_id && projectId) {
        existing.project_id = projectId;
      }
      if (!existing.project_name && projectName) {
        existing.project_name = projectName;
      }
      if (!existing.campaign_id && campaignId) {
        existing.campaign_id = campaignId;
      }
      if (!existing.campaign_name && campaignName) {
        existing.campaign_name = campaignName;
      }

      scopeByOrderId.set(orderId, existing);
    }

    return scopeByOrderId;
  }

  private async fetchProjectNameByIds(projectIds: string[]): Promise<Map<string, string>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_projects')
      .select('id, name')
      .in('id', projectIds);

    if (error) {
      throw new ApiException(
        '프로젝트 이름 조회 실패',
        500,
        'V2_ADMIN_BATCH_PROJECT_NAME_FETCH_FAILED',
      );
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      const projectId = this.normalizeOptionalUuid(row.id);
      const projectName = this.normalizeOptionalText(row.name);
      if (!projectId || !projectName) {
        continue;
      }
      map.set(projectId, projectName);
    }
    return map;
  }

  private async fetchCampaignNameByIds(campaignIds: string[]): Promise<Map<string, string>> {
    if (campaignIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .select('id, name')
      .in('id', campaignIds);

    if (error) {
      throw new ApiException(
        '캠페인 이름 조회 실패',
        500,
        'V2_ADMIN_BATCH_CAMPAIGN_NAME_FETCH_FAILED',
      );
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      const campaignId = this.normalizeOptionalUuid(row.id);
      const campaignName = this.normalizeOptionalText(row.name);
      if (!campaignId || !campaignName) {
        continue;
      }
      map.set(campaignId, campaignName);
    }
    return map;
  }

  private async fetchCampaignIdByPriceListIds(
    priceListIds: string[],
  ): Promise<Map<string, string>> {
    if (priceListIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_price_lists')
      .select('id, campaign_id')
      .in('id', priceListIds);

    if (error) {
      throw new ApiException(
        '가격표 캠페인 정보 조회 실패',
        500,
        'V2_ADMIN_BATCH_PRICE_LIST_CAMPAIGN_FETCH_FAILED',
      );
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      const priceListId = this.normalizeOptionalUuid(row.id);
      const campaignId = this.normalizeOptionalUuid(row.campaign_id);
      if (!priceListId || !campaignId) {
        continue;
      }
      map.set(priceListId, campaignId);
    }
    return map;
  }

  private async fetchOrderDepositorNameByOrderIds(
    orderIds: string[],
  ): Promise<Map<string, string>> {
    const normalizedOrderIds = Array.from(
      new Set(
        (orderIds || [])
          .map((orderId) => this.normalizeOptionalUuid(orderId))
          .filter((orderId): orderId is string => Boolean(orderId)),
      ),
    );
    if (normalizedOrderIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('v2_orders')
      .select('id, customer_snapshot, shipping_address_snapshot')
      .in('id', normalizedOrderIds);

    if (error) {
      throw new ApiException(
        '입금자명 조회 실패',
        500,
        'V2_ADMIN_BATCH_DEPOSITOR_FETCH_FAILED',
      );
    }

    const depositorNameByOrderId = new Map<string, string>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalUuid(row.id);
      if (!orderId) {
        continue;
      }

      const customerSnapshot = this.normalizeOptionalJsonObject(
        row.customer_snapshot,
      );
      const shippingSnapshot = this.normalizeOptionalJsonObject(
        row.shipping_address_snapshot,
      );

      const candidateName =
        this.readSnapshotText(customerSnapshot, 'depositor_name') ||
        this.readSnapshotText(customerSnapshot, 'depositorName') ||
        this.readSnapshotText(customerSnapshot, 'name') ||
        this.readSnapshotText(customerSnapshot, 'customer_name') ||
        this.readSnapshotText(shippingSnapshot, 'name') ||
        this.readSnapshotText(shippingSnapshot, 'receiver_name');

      if (candidateName) {
        depositorNameByOrderId.set(orderId, candidateName);
      }
    }

    return depositorNameByOrderId;
  }

  private resolveStageFromQueueRow(row: Partial<QueueRow>): QueueLinearStage {
    const orderStatus = String(row.order_status || '').toUpperCase();
    const paymentStatus = String(row.payment_status || '').toUpperCase();
    const fulfillmentStatus = String(row.fulfillment_status || '').toUpperCase();

    if (paymentStatus === 'AUTHORIZED') {
      return 'PAYMENT_CONFIRMED';
    }

    const paymentCapturedStatuses = ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
    const isPaymentCaptured = paymentCapturedStatuses.includes(paymentStatus);
    if (!isPaymentCaptured) {
      return 'PAYMENT_PENDING';
    }

    const hasPhysical = Boolean(row.has_physical);
    const hasDigital = Boolean(row.has_digital);

    if (hasPhysical) {
      const waiting = Number(row.waiting_shipment_count || 0);
      const inTransit = Number(row.in_transit_shipment_count || 0);
      const delivered = Number(row.delivered_shipment_count || 0);

      if (inTransit > 0) {
        return 'IN_TRANSIT';
      }
      if (waiting > 0) {
        return 'READY_TO_SHIP';
      }
      if (delivered > 0 && waiting === 0 && inTransit === 0) {
        const isOrderOrFulfillmentCompleted =
          orderStatus === 'COMPLETED' || fulfillmentStatus === 'FULFILLED';
        if (hasDigital && !isOrderOrFulfillmentCompleted) {
          return 'IN_TRANSIT';
        }
        return 'DELIVERED';
      }
      if (orderStatus === 'COMPLETED' || fulfillmentStatus === 'FULFILLED') {
        return 'DELIVERED';
      }
      return 'PRODUCTION';
    }

    if (hasDigital) {
      if (orderStatus === 'COMPLETED' || fulfillmentStatus === 'FULFILLED') {
        return 'DELIVERED';
      }
      return 'PRODUCTION';
    }

    if (orderStatus === 'COMPLETED') {
      return 'DELIVERED';
    }

    return 'PRODUCTION';
  }

  private buildAddressSummary(snapshot: Record<string, unknown> | null): string | null {
    if (!snapshot) {
      return null;
    }

    const candidateKeys = [
      'address',
      'address1',
      'address_1',
      'line1',
      'road_address',
      'detail_address',
      'detailAddress',
      'zip_code',
      'postal_code',
    ];

    const values = candidateKeys
      .map((key) => this.readSnapshotText(snapshot, key))
      .filter((value): value is string => Boolean(value));

    if (values.length === 0) {
      return null;
    }

    return values.join(' ');
  }

  private readSnapshotText(
    snapshot: Record<string, unknown> | null,
    key: string,
  ): string | null {
    if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, key)) {
      return null;
    }

    const value = snapshot[key];
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private generateBatchNo(prefix: 'PB' | 'SB'): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${prefix}-${yyyy}${mm}${dd}-${hh}${min}${sec}-${rand}`;
  }

  private formatSnapshotDatePart(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '';
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = parts.find((part) => part.type === 'day')?.value || '';
    return `${year}${month}${day}`;
  }

  private getSnapshotDayRangeIso(baseDate: Date): [string, string] {
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const snapshotDate = dateFormatter.format(baseDate);
    const [year, month, day] = snapshotDate.split('-').map((value) => Number.parseInt(value, 10));

    const utcStartMillis = Date.UTC(year, month - 1, day, -9, 0, 0, 0);
    const utcEndMillis = utcStartMillis + 24 * 60 * 60 * 1000;

    return [new Date(utcStartMillis).toISOString(), new Date(utcEndMillis).toISOString()];
  }

  private generateRequestId(prefix: string): string {
    const now = Date.now();
    const rand = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');
    return `${prefix}-${now}-${rand}`;
  }

  private normalizeActor(actor?: V2AdminActionActor): V2AdminActionActor {
    return {
      id: this.normalizeOptionalUuid(actor?.id),
      email: this.normalizeOptionalText(actor?.email),
      isLocalBypass: Boolean(actor?.isLocalBypass),
    };
  }

  private normalizeLimit(
    value: string | number | undefined,
    defaultValue: number,
    max: number,
  ): number {
    const numeric =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value || ''), 10);

    if (!Number.isInteger(numeric) || numeric <= 0) {
      return defaultValue;
    }
    return Math.min(numeric, max);
  }

  private normalizeOptionalDate(
    value: unknown,
    fieldName: 'date_from' | 'date_to',
  ): Date | null {
    const text = this.normalizeOptionalText(value);
    if (!text) {
      return null;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiException(
        `${fieldName} 형식이 올바르지 않습니다.`,
        400,
        'V2_ADMIN_BATCH_DATE_INVALID',
      );
    }

    return parsed;
  }

  private matchesDateRange(
    value: string | null | undefined,
    dateFrom: Date | null,
    dateTo: Date | null,
  ): boolean {
    if (!dateFrom && !dateTo) {
      return true;
    }

    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return false;
    }

    if (dateFrom && parsed < dateFrom) {
      return false;
    }
    if (dateTo && parsed > dateTo) {
      return false;
    }
    return true;
  }

  private normalizeOrderIds(orderIds?: string[]): string[] {
    const normalized = Array.from(
      new Set(
        (orderIds || [])
          .map((orderId) => this.normalizeOptionalUuid(orderId))
          .filter((orderId): orderId is string => Boolean(orderId)),
      ),
    );

    if (normalized.length === 0) {
      throw new ApiException(
        'order_ids는 1개 이상 필요합니다.',
        400,
        'V2_ADMIN_BATCH_ORDER_IDS_REQUIRED',
      );
    }

    if (normalized.length > 500) {
      throw new ApiException(
        'order_ids는 최대 500개까지 허용됩니다.',
        400,
        'V2_ADMIN_BATCH_ORDER_IDS_TOO_MANY',
      );
    }

    return normalized;
  }

  private extractSelectedPriceListId(snapshot: unknown): string | null {
    const displaySnapshot = this.normalizeOptionalJsonObject(snapshot);
    const pricingSnapshot = this.normalizeOptionalJsonObject(
      displaySnapshot?.pricing,
    );
    return this.normalizeOptionalUuid(
      pricingSnapshot?.selected_price_list_id,
    );
  }

  private normalizeOptionalUuid(value: unknown): string | null {
    const text = this.normalizeOptionalText(value);
    if (!text) {
      return null;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(text)) {
      return null;
    }

    return text.toLowerCase();
  }

  private normalizeRequiredUuid(value: unknown, message: string): string {
    const normalized = this.normalizeOptionalUuid(value);
    if (!normalized) {
      throw new ApiException(message, 400, 'V2_ADMIN_BATCH_UUID_INVALID');
    }
    return normalized;
  }

  private normalizeRequiredText(value: unknown, message: string): string {
    const text = this.normalizeOptionalText(value);
    if (!text) {
      throw new ApiException(message, 400, 'V2_ADMIN_BATCH_REQUIRED_TEXT');
    }
    return text;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalJsonObject(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
