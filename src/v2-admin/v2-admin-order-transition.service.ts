import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { V2CheckoutService } from '../v2-checkout/v2-checkout.service';
import { V2FulfillmentService } from '../v2-fulfillment/v2-fulfillment.service';
import {
  V2AdminActionActor,
  V2AdminActionExecutorService,
} from './v2-admin-action-executor.service';

type V2OrderLinearStage =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'PRODUCTION'
  | 'READY_TO_SHIP'
  | 'IN_TRANSIT'
  | 'DELIVERED';

type V2OrderTransitionScope = 'FULL' | 'ORDER_QUEUE';

type V2OrderTransitionActionKey =
  | 'ORDER_PAYMENT_MARK_AUTHORIZED'
  | 'ORDER_PAYMENT_MARK_CAPTURED'
  | 'ORDER_PAYMENT_MARK_PENDING'
  | 'FULFILLMENT_ENTITLEMENT_ENSURE'
  | 'FULFILLMENT_SHIPMENT_FORCE_STATUS'
  | 'FULFILLMENT_ENTITLEMENT_FORCE_STATUS'
  | 'FULFILLMENT_SHIPMENT_DISPATCH'
  | 'FULFILLMENT_SHIPMENT_DELIVER'
  | 'FULFILLMENT_ENTITLEMENT_REISSUE';

interface OrderLinearTransitionAction {
  sequence: number;
  action_key: V2OrderTransitionActionKey;
  resource_type: 'ORDER' | 'SHIPMENT' | 'DIGITAL_ENTITLEMENT';
  resource_id: string;
  from_state: string | null;
  to_state: string | null;
  requires_approval: boolean;
  note: string | null;
}

interface OrderLinearTransitionRow {
  order_id: string;
  order_no: string | null;
  exists: boolean;
  current_stage: V2OrderLinearStage | null;
  target_stage: V2OrderLinearStage;
  executable: boolean;
  statuses: {
    order_status: string;
    payment_status: string;
    fulfillment_status: string;
  } | null;
  composition: {
    has_bundle: boolean;
    has_physical: boolean;
    has_digital: boolean;
  };
  action_count: number;
  actions: OrderLinearTransitionAction[];
  blocked_reasons: string[];
  warning_reasons: string[];
}

interface OrderLinearTransitionSummary {
  requested_order_count: number;
  found_order_count: number;
  executable_order_count: number;
  blocked_order_count: number;
  total_action_count: number;
}

interface EntitlementRow {
  id: string;
  order_id: string;
  status: string;
  download_count: number;
}

interface ShipmentRow {
  shipment_id: string;
  shipment_status: string | null;
}

const LINEAR_STAGE_ORDER: V2OrderLinearStage[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PRODUCTION',
  'READY_TO_SHIP',
  'IN_TRANSIT',
  'DELIVERED',
];

const PAYMENT_CAPTURED_STATUSES = new Set([
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);
const MAX_ACTION_REQUEST_ID_LENGTH = 120;
const ORDER_QUEUE_ALLOWED_STAGES = new Set<V2OrderLinearStage>([
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
]);

@Injectable()
export class V2AdminOrderTransitionService {
  constructor(
    private readonly v2AdminActionExecutorService: V2AdminActionExecutorService,
    @Inject(forwardRef(() => V2FulfillmentService))
    private readonly v2FulfillmentService: V2FulfillmentService,
    @Inject(forwardRef(() => V2CheckoutService))
    private readonly v2CheckoutService: V2CheckoutService,
  ) {}

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async preview(input: {
    orderIds?: string[];
    targetStage?: string;
    scope?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    return this.runTransition({
      mode: 'PREVIEW',
      ...input,
    });
  }

  async execute(input: {
    orderIds?: string[];
    targetStage?: string;
    scope?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    return this.runTransition({
      mode: 'EXECUTE',
      ...input,
    });
  }

  private async runTransition(input: {
    mode: 'PREVIEW' | 'EXECUTE';
    orderIds?: string[];
    targetStage?: string;
    scope?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const targetStage = this.normalizeTargetStage(input.targetStage);
    const scope = this.normalizeTransitionScope(input.scope);
    const orderIds = this.normalizeOrderIds(input.orderIds);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId = this.normalizeOptionalText(input.requestId);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const actor = this.normalizeActor(input.actor);
    const requestedAt = new Date().toISOString();

    const ordersById = await this.fetchOrdersById(orderIds);
    let queueByOrderId = await this.fetchOrderQueueByOrderId(orderIds);
    let shipmentsByOrderId = await this.fetchShipmentsByOrderId(orderIds);
    const entitlementsByOrderId =
      await this.fetchEntitlementsByOrderId(orderIds);
    let shipmentBootstrapErrors = new Map<string, string>();

    if (
      input.mode === 'EXECUTE' &&
      this.requiresShipmentBootstrap(targetStage)
    ) {
      shipmentBootstrapErrors = await this.bootstrapPhysicalShipments({
        orderIds,
        ordersById,
        queueByOrderId,
        targetStage,
        metadata,
      });
      queueByOrderId = await this.fetchOrderQueueByOrderId(orderIds);
      shipmentsByOrderId = await this.fetchShipmentsByOrderId(orderIds);
    }

    const rows = orderIds.map((orderId) => {
      const order = ordersById.get(orderId) || null;
      const queue = queueByOrderId.get(orderId) || null;
      const shipments = shipmentsByOrderId.get(orderId) || [];
      const entitlements = entitlementsByOrderId.get(orderId) || [];
      return this.buildTransitionRow({
        orderId,
        order,
        queue,
        shipments,
        entitlements,
        targetStage,
        scope,
        bootstrapError: shipmentBootstrapErrors.get(orderId) || null,
      });
    });

    const summary = this.buildSummary(orderIds, rows);

    if (input.mode === 'PREVIEW') {
      return {
        mode: 'PREVIEW',
        requested_at: requestedAt,
        target_stage: targetStage,
        summary,
        rows,
      };
    }

    const executionLogs: any[] = [];
    for (const row of rows) {
      if (!row.exists || !row.executable || row.actions.length === 0) {
        continue;
      }

      const rowLogs: any[] = [];
      for (let index = 0; index < row.actions.length; index += 1) {
        const action = row.actions[index];
        const log = await this.executeAction({
          row,
          action,
          actionIndex: index,
          actor,
          targetStage,
          reason,
          requestId,
          metadata,
        });
        rowLogs.push(log);
        executionLogs.push(log);

        if (log.status === 'FAILED') {
          break;
        }
      }

      const hasFailed = rowLogs.some((log) => log.status === 'FAILED');
      const hasPendingApproval = rowLogs.some(
        (log) => log.status === 'PENDING_APPROVAL',
      );
      if (!hasFailed && !hasPendingApproval && targetStage === 'DELIVERED') {
        const syncLog = await this.syncOrderDeliveredState({
          row,
          reason,
          metadata,
        });
        if (syncLog) {
          executionLogs.push(syncLog);
        }
      }
    }

    const executeSummary = {
      attempted_action_count: executionLogs.length,
      succeeded_count: executionLogs.filter(
        (item) => item.status === 'SUCCEEDED',
      ).length,
      pending_approval_count: executionLogs.filter(
        (item) => item.status === 'PENDING_APPROVAL',
      ).length,
      failed_count: executionLogs.filter((item) => item.status === 'FAILED')
        .length,
    };

    return {
      mode: 'EXECUTE',
      requested_at: requestedAt,
      target_stage: targetStage,
      summary,
      rows,
      execute: {
        ...executeSummary,
        logs: executionLogs,
      },
    };
  }

  private buildSummary(
    orderIds: string[],
    rows: OrderLinearTransitionRow[],
  ): OrderLinearTransitionSummary {
    return {
      requested_order_count: orderIds.length,
      found_order_count: rows.filter((row) => row.exists).length,
      executable_order_count: rows.filter((row) => row.executable).length,
      blocked_order_count: rows.filter((row) => row.blocked_reasons.length > 0)
        .length,
      total_action_count: rows.reduce(
        (sum, row) => sum + Number(row.action_count || 0),
        0,
      ),
    };
  }

  private buildTransitionRow(input: {
    orderId: string;
    order: any | null;
    queue: any | null;
    shipments: ShipmentRow[];
    entitlements: EntitlementRow[];
    targetStage: V2OrderLinearStage;
    scope: V2OrderTransitionScope;
    bootstrapError?: string | null;
  }): OrderLinearTransitionRow {
    if (!input.order) {
      return {
        order_id: input.orderId,
        order_no: null,
        exists: false,
        current_stage: null,
        target_stage: input.targetStage,
        executable: false,
        statuses: null,
        composition: {
          has_bundle: false,
          has_physical: false,
          has_digital: false,
        },
        action_count: 0,
        actions: [],
        blocked_reasons: ['주문이 존재하지 않습니다.'],
        warning_reasons: [],
      };
    }

    const composition = {
      has_bundle: Boolean(input.queue?.has_bundle),
      has_physical:
        Boolean(input.queue?.has_physical) || input.shipments.length > 0,
      has_digital:
        Boolean(input.queue?.has_digital) || input.entitlements.length > 0,
    };
    const isDigitalOnlyOrder =
      composition.has_digital && !composition.has_physical;

    const statuses = {
      order_status: String(input.order.order_status || ''),
      payment_status: String(input.order.payment_status || ''),
      fulfillment_status: String(input.order.fulfillment_status || ''),
    };

    const currentStage = this.resolveCurrentStage({
      paymentStatus: statuses.payment_status,
      composition,
      shipments: input.shipments,
      entitlements: input.entitlements,
    });

    const warningReasons: string[] = [];
    const blockedReasons: string[] = [];
    if (input.bootstrapError) {
      blockedReasons.push(input.bootstrapError);
    }
    const currentStageIndex = LINEAR_STAGE_ORDER.indexOf(currentStage);
    const targetStageIndex = LINEAR_STAGE_ORDER.indexOf(input.targetStage);
    const isBackwardTransition = targetStageIndex < currentStageIndex;

    if (
      input.scope === 'ORDER_QUEUE' &&
      !ORDER_QUEUE_ALLOWED_STAGES.has(currentStage)
    ) {
      blockedReasons.push(
        '주문 관리 탭에서는 입금 대기/입금 확인 단계 주문만 전환할 수 있습니다.',
      );
    }

    if (
      input.scope === 'ORDER_QUEUE' &&
      !ORDER_QUEUE_ALLOWED_STAGES.has(input.targetStage)
    ) {
      blockedReasons.push(
        '주문 관리 탭에서는 입금 대기/입금 확인 단계로만 전환할 수 있습니다.',
      );
    }

    if (
      input.scope === 'ORDER_QUEUE' &&
      currentStageIndex >= 0 &&
      targetStageIndex >= 0 &&
      Math.abs(targetStageIndex - currentStageIndex) !== 1
    ) {
      blockedReasons.push(
        `주문 관리 탭에서는 한 단계씩만 전환할 수 있습니다. (현재: ${this.linearStageLabel(
          currentStage,
        )} → 목표: ${this.linearStageLabel(input.targetStage)})`,
      );
    }

    const actions: OrderLinearTransitionAction[] = [];
    let sequence = 1;

    const paymentStatus = String(statuses.payment_status || '').toUpperCase();
    const paymentNeedsAuthorize =
      paymentStatus === 'PENDING' || paymentStatus === 'FAILED';
    const paymentNeedsCapture = !PAYMENT_CAPTURED_STATUSES.has(paymentStatus);

    const addAction = (
      action: Omit<OrderLinearTransitionAction, 'sequence'>,
    ) => {
      actions.push({
        sequence,
        ...action,
      });
      sequence += 1;
    };

    const addEntitlementEnsureAction = (note?: string) => {
      addAction({
        action_key: 'FULFILLMENT_ENTITLEMENT_ENSURE',
        resource_type: 'ORDER',
        resource_id: input.order.id,
        from_state:
          input.entitlements.length > 0
            ? 'EXISTING_ENTITLEMENTS'
            : 'MISSING_ENTITLEMENTS',
        to_state: 'GRANTED',
        requires_approval: false,
        note: note || '디지털 entitlement 발급/지급 보장',
      });
    };

    const addPaymentActionsUpToCaptured = () => {
      if (paymentNeedsAuthorize) {
        addAction({
          action_key: 'ORDER_PAYMENT_MARK_AUTHORIZED',
          resource_type: 'ORDER',
          resource_id: input.order.id,
          from_state: statuses.payment_status,
          to_state: 'AUTHORIZED',
          requires_approval: false,
          note: '입금 확인(결제 AUTHORIZED) 처리',
        });
      }

      if (paymentNeedsCapture) {
        addAction({
          action_key: 'ORDER_PAYMENT_MARK_CAPTURED',
          resource_type: 'ORDER',
          resource_id: input.order.id,
          from_state: paymentNeedsAuthorize
            ? 'AUTHORIZED'
            : statuses.payment_status,
          to_state: 'CAPTURED',
          requires_approval: false,
          note: '결제 확정(CAPTURED) 처리',
        });
      }
    };

    const shipmentStatus = (shipment: ShipmentRow) =>
      String(shipment.shipment_status || '').toUpperCase();
    const entitlementStatus = (entitlement: EntitlementRow) =>
      String(entitlement.status || '').toUpperCase();
    const addDigitalCompletionActions = () => {
      if (!composition.has_digital) {
        return;
      }

      if (input.entitlements.length === 0) {
        blockedReasons.push(
          '디지털 entitlement가 없어 디지털 완료 전환을 수행할 수 없습니다.',
        );
        return;
      }

      for (const entitlement of input.entitlements) {
        const status = entitlementStatus(entitlement);
        if (status === 'PENDING' || status === 'EXPIRED') {
          addAction({
            action_key: 'FULFILLMENT_ENTITLEMENT_REISSUE',
            resource_type: 'DIGITAL_ENTITLEMENT',
            resource_id: entitlement.id,
            from_state: status,
            to_state: 'GRANTED',
            requires_approval: false,
            note: '디지털 권한 지급(재발급) 처리',
          });
        } else if (status === 'FAILED' || status === 'REVOKED') {
          blockedReasons.push(
            `entitlement(${entitlement.id}) 상태가 ${status}라 자동 지급 처리할 수 없습니다.`,
          );
        }
      }
    };

    const addForceRollbackActions = () => {
      if (input.targetStage === 'PAYMENT_PENDING') {
        if (paymentStatus !== 'PENDING') {
          addAction({
            action_key: 'ORDER_PAYMENT_MARK_PENDING',
            resource_type: 'ORDER',
            resource_id: input.order.id,
            from_state: statuses.payment_status,
            to_state: 'PENDING',
            requires_approval: false,
            note: '강제 롤백: 결제 상태를 PENDING으로 되돌립니다.',
          });
        }
      } else if (input.targetStage === 'PAYMENT_CONFIRMED') {
        if (paymentStatus !== 'AUTHORIZED') {
          addAction({
            action_key: 'ORDER_PAYMENT_MARK_AUTHORIZED',
            resource_type: 'ORDER',
            resource_id: input.order.id,
            from_state: statuses.payment_status,
            to_state: 'AUTHORIZED',
            requires_approval: false,
            note: '강제 롤백: 결제 상태를 AUTHORIZED로 되돌립니다.',
          });
        }
      } else if (paymentNeedsCapture) {
        addPaymentActionsUpToCaptured();
      }

      if (composition.has_physical) {
        if (input.shipments.length === 0) {
          warningReasons.push(
            '실물 shipment가 없어 배송 상태 롤백은 적용되지 않습니다.',
          );
        } else {
          const desiredShipmentStatus =
            input.targetStage === 'DELIVERED'
              ? 'DELIVERED'
              : input.targetStage === 'IN_TRANSIT'
                ? 'IN_TRANSIT'
                : input.targetStage === 'PRODUCTION'
                  ? 'CANCELED'
                  : 'READY_TO_PACK';

          for (const shipment of input.shipments) {
            const status = shipmentStatus(shipment);
            if (status === desiredShipmentStatus) {
              continue;
            }
            addAction({
              action_key: 'FULFILLMENT_SHIPMENT_FORCE_STATUS',
              resource_type: 'SHIPMENT',
              resource_id: shipment.shipment_id,
              from_state: status,
              to_state: desiredShipmentStatus,
              requires_approval: false,
              note: `강제 롤백: shipment 상태를 ${desiredShipmentStatus}로 조정합니다.`,
            });
          }
        }
      }

      if (composition.has_digital) {
        if (input.entitlements.length === 0) {
          warningReasons.push(
            '디지털 entitlement가 없어 권한 상태 롤백은 적용되지 않습니다.',
          );
        } else {
          const desiredEntitlementStatus =
            input.targetStage === 'DELIVERED' ||
            input.targetStage === 'IN_TRANSIT'
              ? 'GRANTED'
              : 'PENDING';

          for (const entitlement of input.entitlements) {
            const status = entitlementStatus(entitlement);
            if (status === desiredEntitlementStatus) {
              continue;
            }
            addAction({
              action_key: 'FULFILLMENT_ENTITLEMENT_FORCE_STATUS',
              resource_type: 'DIGITAL_ENTITLEMENT',
              resource_id: entitlement.id,
              from_state: status,
              to_state: desiredEntitlementStatus,
              requires_approval: false,
              note: `강제 롤백: entitlement 상태를 ${desiredEntitlementStatus}로 조정합니다.`,
            });
          }
        }
      }
    };

    if (isBackwardTransition) {
      const deliveredShipmentCount = input.shipments.filter(
        (shipment) => shipmentStatus(shipment) === 'DELIVERED',
      ).length;
      if (deliveredShipmentCount > 0) {
        warningReasons.push(
          `배송완료 이력이 있는 shipment ${deliveredShipmentCount}건이 롤백 대상입니다.`,
        );
      }

      const downloadedEntitlementCount = input.entitlements.filter(
        (entitlement) => Number(entitlement.download_count || 0) > 0,
      ).length;
      if (downloadedEntitlementCount > 0) {
        warningReasons.push(
          `다운로드 이력이 있는 entitlement ${downloadedEntitlementCount}건이 롤백 대상입니다.`,
        );
      }

      addForceRollbackActions();
    } else {
      if (
        paymentStatus === 'CANCELED' &&
        input.targetStage !== 'PAYMENT_PENDING'
      ) {
        blockedReasons.push(
          '결제 상태가 CANCELED인 주문은 선형 단계 전환을 자동 실행할 수 없습니다.',
        );
      }

      if (input.targetStage === 'PAYMENT_CONFIRMED') {
        if (isDigitalOnlyOrder) {
          let canProceedPaymentConfirmed = true;
          let paymentConfirmationActionPlanned = false;

          if (paymentNeedsCapture) {
            addPaymentActionsUpToCaptured();
            paymentConfirmationActionPlanned = true;
          } else if (
            paymentStatus !== 'AUTHORIZED' &&
            !PAYMENT_CAPTURED_STATUSES.has(paymentStatus)
          ) {
            blockedReasons.push(
              `현재 결제 상태(${paymentStatus})에서는 입금 확인 단계로 전환할 수 없습니다.`,
            );
            canProceedPaymentConfirmed = false;
          }

          if (
            canProceedPaymentConfirmed &&
            !paymentConfirmationActionPlanned &&
            input.entitlements.length > 0
          ) {
            addDigitalCompletionActions();
          }

          if (
            canProceedPaymentConfirmed &&
            !paymentConfirmationActionPlanned &&
            input.entitlements.length === 0
          ) {
            addEntitlementEnsureAction(
              '입금 확인 단계 진입을 위한 디지털 entitlement 발급/지급 보장',
            );
          }
        } else {
          let canProceedPaymentConfirmed = false;
          let paymentConfirmationActionPlanned = false;
          if (paymentNeedsAuthorize) {
            addAction({
              action_key: 'ORDER_PAYMENT_MARK_AUTHORIZED',
              resource_type: 'ORDER',
              resource_id: input.order.id,
              from_state: statuses.payment_status,
              to_state: 'AUTHORIZED',
              requires_approval: false,
              note: '입금 확인(결제 AUTHORIZED) 처리',
            });
            canProceedPaymentConfirmed = true;
            paymentConfirmationActionPlanned = true;
          } else if (paymentStatus === 'AUTHORIZED') {
            canProceedPaymentConfirmed = true;
          } else {
            blockedReasons.push(
              `현재 결제 상태(${paymentStatus})에서는 입금 확인 단계로 전환할 수 없습니다.`,
            );
          }

          const needsEntitlementEnsure =
            composition.has_digital &&
            input.entitlements.some((entitlement) => {
              const status = entitlementStatus(entitlement);
              return status !== 'GRANTED';
            });

          if (
            canProceedPaymentConfirmed &&
            composition.has_digital &&
            !paymentConfirmationActionPlanned &&
            (input.entitlements.length === 0 || needsEntitlementEnsure)
          ) {
            addEntitlementEnsureAction(
              '입금 확인 단계 진입을 위한 디지털 entitlement 발급/지급 보장',
            );
          }
        }
      }

      if (input.targetStage === 'PRODUCTION') {
        if (paymentNeedsCapture) {
          addPaymentActionsUpToCaptured();
        }
      }

      if (input.targetStage === 'READY_TO_SHIP') {
        if (!composition.has_physical) {
          blockedReasons.push(
            '실물 이행이 없는 주문은 배송 대기 단계로 전환할 수 없습니다.',
          );
        } else if (input.shipments.length === 0) {
          blockedReasons.push(
            '실물 shipment가 없어 배송 대기 전환을 수행할 수 없습니다.',
          );
        } else {
          if (paymentNeedsCapture) {
            addPaymentActionsUpToCaptured();
          }

          for (const shipment of input.shipments) {
            const status = shipmentStatus(shipment);
            if (status === 'PENDING') {
              blockedReasons.push(
                `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 배송대기 전환이 불가합니다.`,
              );
            }
          }
        }
      }

      if (input.targetStage === 'IN_TRANSIT') {
        if (!composition.has_physical) {
          blockedReasons.push(
            '실물 이행이 없는 주문은 배송 중 단계로 전환할 수 없습니다.',
          );
        } else if (input.shipments.length === 0) {
          blockedReasons.push(
            '실물 shipment가 없어 배송 중 전환을 수행할 수 없습니다.',
          );
        } else {
          if (paymentNeedsCapture) {
            addPaymentActionsUpToCaptured();
          }

          for (const shipment of input.shipments) {
            const status = shipmentStatus(shipment);
            if (status === 'READY_TO_PACK' || status === 'PACKING') {
              addAction({
                action_key: 'FULFILLMENT_SHIPMENT_DISPATCH',
                resource_type: 'SHIPMENT',
                resource_id: shipment.shipment_id,
                from_state: status,
                to_state: 'SHIPPED',
                requires_approval: false,
                note: '배송 중 전환을 위한 출고 처리',
              });
            } else if (status === 'PENDING') {
              blockedReasons.push(
                `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 출고가 불가합니다.`,
              );
            }
          }
        }
      }

      if (input.targetStage === 'DELIVERED') {
        const paymentCompletionActionPlanned = paymentNeedsCapture;
        if (paymentNeedsCapture) {
          addPaymentActionsUpToCaptured();
        }

        if (composition.has_physical) {
          if (input.shipments.length === 0) {
            blockedReasons.push(
              '실물 shipment가 없어 배송 완료 전환을 수행할 수 없습니다.',
            );
          } else {
            for (const shipment of input.shipments) {
              const status = shipmentStatus(shipment);
              if (status === 'READY_TO_PACK' || status === 'PACKING') {
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DISPATCH',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: status,
                  to_state: 'SHIPPED',
                  requires_approval: false,
                  note: '배송 완료 전환을 위한 출고 처리',
                });
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DELIVER',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: 'SHIPPED',
                  to_state: 'DELIVERED',
                  requires_approval: false,
                  note: '배송 완료 처리',
                });
              } else if (status === 'SHIPPED' || status === 'IN_TRANSIT') {
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DELIVER',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: status,
                  to_state: 'DELIVERED',
                  requires_approval: false,
                  note: '배송 완료 처리',
                });
              } else if (status === 'PENDING') {
                blockedReasons.push(
                  `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 배송완료 전환이 불가합니다.`,
                );
              }
            }
          }
        }

        if (composition.has_digital) {
          const hasHardBlockedEntitlement = input.entitlements.some(
            (entitlement) => {
              const status = entitlementStatus(entitlement);
              return status === 'FAILED' || status === 'REVOKED';
            },
          );
          const needsEntitlementEnsure =
            paymentCompletionActionPlanned ||
            input.entitlements.length === 0 ||
            input.entitlements.some((entitlement) => {
              const status = entitlementStatus(entitlement);
              return status !== 'GRANTED';
            });

          if (hasHardBlockedEntitlement) {
            addDigitalCompletionActions();
          } else if (needsEntitlementEnsure) {
            addEntitlementEnsureAction(
              '배송 완료 단계 진입을 위한 디지털 entitlement 발급/지급 보장',
            );
          } else {
            addDigitalCompletionActions();
          }
        }
      }
    }

    if (
      blockedReasons.length === 0 &&
      actions.length === 0 &&
      currentStage !== input.targetStage
    ) {
      blockedReasons.push(
        `현재 단계(${this.linearStageLabel(
          currentStage,
        )})에서 ${this.linearStageLabel(
          input.targetStage,
        )} 전환에 필요한 실행 액션을 생성하지 못했습니다.`,
      );
    }

    return {
      order_id: input.orderId,
      order_no: String(input.order.order_no || ''),
      exists: true,
      current_stage: currentStage,
      target_stage: input.targetStage,
      executable: blockedReasons.length === 0,
      statuses,
      composition,
      action_count: actions.length,
      actions,
      blocked_reasons: blockedReasons,
      warning_reasons: warningReasons,
    };
  }

  private resolveCurrentStage(input: {
    paymentStatus: string;
    composition: {
      has_bundle: boolean;
      has_physical: boolean;
      has_digital: boolean;
    };
    shipments: ShipmentRow[];
    entitlements: EntitlementRow[];
  }): V2OrderLinearStage {
    const paymentStatus = String(input.paymentStatus || '').toUpperCase();
    if (paymentStatus === 'AUTHORIZED') {
      return 'PAYMENT_CONFIRMED';
    }
    if (!PAYMENT_CAPTURED_STATUSES.has(paymentStatus)) {
      return 'PAYMENT_PENDING';
    }

    if (input.composition.has_physical) {
      const shipmentStatuses = input.shipments.map((shipment) =>
        String(shipment.shipment_status || '').toUpperCase(),
      );
      const hasInTransit = shipmentStatuses.some(
        (status) => status === 'SHIPPED' || status === 'IN_TRANSIT',
      );
      const hasWaiting = shipmentStatuses.some(
        (status) => status === 'READY_TO_PACK' || status === 'PACKING',
      );
      const allDelivered =
        shipmentStatuses.length > 0 &&
        shipmentStatuses.every((status) => status === 'DELIVERED');

      if (allDelivered) {
        if (input.composition.has_digital) {
          if (input.entitlements.length === 0) {
            return 'IN_TRANSIT';
          }
          const hasPendingDigital = input.entitlements.some((entitlement) => {
            const status = String(entitlement.status || '').toUpperCase();
            return status !== 'GRANTED';
          });
          if (hasPendingDigital) {
            return 'IN_TRANSIT';
          }
        }
        return 'DELIVERED';
      }
      if (hasInTransit) {
        return 'IN_TRANSIT';
      }
      if (hasWaiting) {
        return 'READY_TO_SHIP';
      }
      return 'PRODUCTION';
    }

    if (input.composition.has_digital) {
      if (input.entitlements.length === 0) {
        return 'PRODUCTION';
      }
      const allGranted = input.entitlements.every((entitlement) => {
        const status = String(entitlement.status || '').toUpperCase();
        return status === 'GRANTED';
      });
      return allGranted ? 'DELIVERED' : 'PRODUCTION';
    }

    return 'PRODUCTION';
  }

  private async executeAction(input: {
    row: OrderLinearTransitionRow;
    action: OrderLinearTransitionAction;
    actionIndex: number;
    actor: V2AdminActionActor;
    targetStage: V2OrderLinearStage;
    reason: string | null;
    requestId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<any> {
    const actionRequestId = this.buildActionRequestId({
      requestId: input.requestId,
      row: input.row,
      action: input.action,
      actionIndex: input.actionIndex,
    });

    try {
      if (input.action.action_key === 'ORDER_PAYMENT_MARK_AUTHORIZED') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'ORDER_PAYMENT_MARK_AUTHORIZED',
          domain: 'ORDER',
          actor: input.actor,
          resourceType: 'ORDER',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_PAYMENT_AUTHORIZE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2CheckoutService.applyPaymentCallback(input.row.order_id, {
              external_reference: `ADMIN-LINEAR-${Date.now()}-${input.row.order_id}`,
              status: 'AUTHORIZED',
              provider: 'MANUAL',
              method: 'MANUAL',
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                reason: input.reason,
                order_no: input.row.order_no,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'ORDER_PAYMENT_MARK_CAPTURED') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'ORDER_PAYMENT_MARK_CAPTURED',
          domain: 'ORDER',
          actor: input.actor,
          resourceType: 'ORDER',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_PAYMENT_CAPTURE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2CheckoutService.applyPaymentCallback(input.row.order_id, {
              external_reference: `ADMIN-LINEAR-${Date.now()}-${input.row.order_id}`,
              status: 'CAPTURED',
              provider: 'MANUAL',
              method: 'MANUAL',
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                reason: input.reason,
                order_no: input.row.order_no,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'ORDER_PAYMENT_MARK_PENDING') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'ORDER_PAYMENT_MARK_PENDING',
          domain: 'ORDER',
          actor: input.actor,
          resourceType: 'ORDER',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_PAYMENT_ROLLBACK_PENDING',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.forceSetOrderPaymentPending({
              orderId: input.row.order_id,
              reason: input.reason,
              targetStage: input.targetStage,
              metadata: input.metadata,
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_SHIPMENT_FORCE_STATUS') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_SHIPMENT_FORCE_STATUS',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'FULFILLMENT_EXECUTE',
          resourceType: 'SHIPMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'SHIPMENT_FORCE_STATUS',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.forceSetShipmentStatus({
              shipmentId: input.action.resource_id,
              nextStatus: input.action.to_state,
              reason: input.reason,
              targetStage: input.targetStage,
              metadata: input.metadata,
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_ENTITLEMENT_FORCE_STATUS') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_ENTITLEMENT_FORCE_STATUS',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'ENTITLEMENT_REISSUE',
          resourceType: 'DIGITAL_ENTITLEMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ENTITLEMENT_FORCE_STATUS',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.forceSetEntitlementStatus({
              entitlementId: input.action.resource_id,
              nextStatus: input.action.to_state,
              reason: input.reason,
              targetStage: input.targetStage,
              metadata: input.metadata,
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_SHIPMENT_DISPATCH') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_SHIPMENT_DISPATCH',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'FULFILLMENT_EXECUTE',
          resourceType: 'SHIPMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'SHIPMENT_DISPATCH',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.dispatchShipment(
              input.action.resource_id,
              {
                metadata: {
                  source: 'ORDER_LINEAR_STAGE_TRANSITION',
                  target_stage: input.targetStage,
                  order_id: input.row.order_id,
                  order_no: input.row.order_no,
                  reason: input.reason,
                },
              },
            ),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_SHIPMENT_DELIVER') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_SHIPMENT_DELIVER',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'FULFILLMENT_EXECUTE',
          resourceType: 'SHIPMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'SHIPMENT_DELIVER',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.deliverShipment(
              input.action.resource_id,
              {
                metadata: {
                  source: 'ORDER_LINEAR_STAGE_TRANSITION',
                  target_stage: input.targetStage,
                  order_id: input.row.order_id,
                  order_no: input.row.order_no,
                  reason: input.reason,
                },
              },
            ),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_ENTITLEMENT_REISSUE') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_ENTITLEMENT_REISSUE',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'ENTITLEMENT_REISSUE',
          resourceType: 'DIGITAL_ENTITLEMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ENTITLEMENT_REISSUE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.reissueEntitlement(
              input.action.resource_id,
              {
                metadata: {
                  source: 'ORDER_LINEAR_STAGE_TRANSITION',
                  target_stage: input.targetStage,
                  order_id: input.row.order_id,
                  order_no: input.row.order_no,
                  reason: input.reason,
                },
              },
            ),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_ENTITLEMENT_ENSURE') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_ENTITLEMENT_ENSURE',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'ENTITLEMENT_REISSUE',
          resourceType: 'ORDER',
          resourceId: input.row.order_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_DIGITAL_ENTITLEMENT_ENSURE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.ensureDigitalEntitlementsForOrder({
              order_id: input.row.order_id,
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                order_id: input.row.order_id,
                order_no: input.row.order_no,
                reason: input.reason,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      throw new ApiException(
        `지원하지 않는 전환 액션입니다: ${input.action.action_key}`,
        400,
        'V2_ADMIN_ORDER_LINEAR_ACTION_UNSUPPORTED',
      );
    } catch (error) {
      const parsed = this.parseActionError(error);
      const actionLogId =
        await this.findActionLogIdByRequestId(actionRequestId);
      const pendingApproval =
        parsed.error_code === 'V2_ADMIN_APPROVAL_REQUIRED';
      return {
        status: pendingApproval ? 'PENDING_APPROVAL' : 'FAILED',
        order_id: input.row.order_id,
        order_no: input.row.order_no,
        action_key: input.action.action_key,
        resource_type: input.action.resource_type,
        resource_id: input.action.resource_id,
        action_log_id: actionLogId,
        error_code: parsed.error_code,
        error_message: parsed.message,
      };
    }
  }

  private async forceSetOrderPaymentPending(input: {
    orderId: string;
    reason: string | null;
    targetStage: V2OrderLinearStage;
    metadata: Record<string, unknown>;
  }): Promise<{ order_id: string; payment_status: string }> {
    const { data: currentOrder, error: orderError } = await this.supabase
      .from('v2_orders')
      .select('id, metadata')
      .eq('id', input.orderId)
      .maybeSingle();

    if (orderError || !currentOrder?.id) {
      throw new ApiException(
        '롤백 대상 order 조회 실패',
        500,
        'V2_ADMIN_ORDER_ROLLBACK_FETCH_FAILED',
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await this.supabase
      .from('v2_orders')
      .update({
        payment_status: 'PENDING',
        order_status: 'PENDING',
        fulfillment_status: 'UNFULFILLED',
        confirmed_at: null,
        canceled_at: null,
        completed_at: null,
        metadata: this.mergeMetadata(currentOrder.metadata, {
          last_manual_stage_rollback: {
            at: now,
            target_stage: input.targetStage,
            reason: input.reason,
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            ...input.metadata,
          },
        }),
      })
      .eq('id', input.orderId);

    if (updateError) {
      throw new ApiException(
        'order 결제 상태 롤백 실패',
        500,
        'V2_ADMIN_ORDER_ROLLBACK_UPDATE_FAILED',
      );
    }

    return {
      order_id: input.orderId,
      payment_status: 'PENDING',
    };
  }

  private async forceSetShipmentStatus(input: {
    shipmentId: string;
    nextStatus: string | null;
    reason: string | null;
    targetStage: V2OrderLinearStage;
    metadata: Record<string, unknown>;
  }): Promise<{ shipment_id: string; status: string }> {
    const desiredStatus = this.normalizeRequiredText(
      input.nextStatus,
      'shipment next status가 필요합니다',
    ).toUpperCase();

    if (
      desiredStatus !== 'READY_TO_PACK' &&
      desiredStatus !== 'IN_TRANSIT' &&
      desiredStatus !== 'DELIVERED' &&
      desiredStatus !== 'CANCELED'
    ) {
      throw new ApiException(
        `지원하지 않는 shipment 강제 상태입니다: ${desiredStatus}`,
        400,
        'V2_ADMIN_SHIPMENT_FORCE_STATUS_INVALID',
      );
    }

    const { data: shipment, error: shipmentError } = await this.supabase
      .from('v2_shipments')
      .select(
        'id, status, packed_at, shipped_at, in_transit_at, delivered_at, returned_at, canceled_at, metadata',
      )
      .eq('id', input.shipmentId)
      .maybeSingle();

    if (shipmentError || !shipment?.id) {
      throw new ApiException(
        '롤백 대상 shipment 조회 실패',
        500,
        'V2_ADMIN_SHIPMENT_ROLLBACK_FETCH_FAILED',
      );
    }

    const now = new Date().toISOString();
    const statusPayload: Record<string, unknown> = {
      status: desiredStatus,
    };

    if (desiredStatus === 'READY_TO_PACK') {
      statusPayload.packed_at = null;
      statusPayload.shipped_at = null;
      statusPayload.in_transit_at = null;
      statusPayload.delivered_at = null;
      statusPayload.returned_at = null;
      statusPayload.canceled_at = null;
    } else if (desiredStatus === 'IN_TRANSIT') {
      statusPayload.packed_at = shipment.packed_at || now;
      statusPayload.shipped_at = shipment.shipped_at || now;
      statusPayload.in_transit_at = now;
      statusPayload.delivered_at = null;
      statusPayload.returned_at = null;
      statusPayload.canceled_at = null;
    } else if (desiredStatus === 'DELIVERED') {
      statusPayload.packed_at = shipment.packed_at || now;
      statusPayload.shipped_at = shipment.shipped_at || now;
      statusPayload.in_transit_at =
        shipment.in_transit_at || shipment.shipped_at || now;
      statusPayload.delivered_at = now;
      statusPayload.returned_at = null;
      statusPayload.canceled_at = null;
    } else if (desiredStatus === 'CANCELED') {
      statusPayload.packed_at = null;
      statusPayload.shipped_at = null;
      statusPayload.in_transit_at = null;
      statusPayload.delivered_at = null;
      statusPayload.returned_at = null;
      statusPayload.canceled_at = now;
    }

    const { error: updateError } = await this.supabase
      .from('v2_shipments')
      .update({
        ...statusPayload,
        metadata: this.mergeMetadata(shipment.metadata, {
          last_manual_stage_rollback: {
            at: now,
            target_stage: input.targetStage,
            reason: input.reason,
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            ...input.metadata,
          },
        }),
      })
      .eq('id', input.shipmentId);

    if (updateError) {
      throw new ApiException(
        'shipment 상태 롤백 실패',
        500,
        'V2_ADMIN_SHIPMENT_ROLLBACK_UPDATE_FAILED',
      );
    }

    return {
      shipment_id: input.shipmentId,
      status: desiredStatus,
    };
  }

  private async forceSetEntitlementStatus(input: {
    entitlementId: string;
    nextStatus: string | null;
    reason: string | null;
    targetStage: V2OrderLinearStage;
    metadata: Record<string, unknown>;
  }): Promise<{ entitlement_id: string; status: string }> {
    const desiredStatus = this.normalizeRequiredText(
      input.nextStatus,
      'entitlement next status가 필요합니다',
    ).toUpperCase();

    if (desiredStatus !== 'PENDING' && desiredStatus !== 'GRANTED') {
      throw new ApiException(
        `지원하지 않는 entitlement 강제 상태입니다: ${desiredStatus}`,
        400,
        'V2_ADMIN_ENTITLEMENT_FORCE_STATUS_INVALID',
      );
    }

    const { data: entitlement, error: entitlementError } = await this.supabase
      .from('v2_digital_entitlements')
      .select('id, status, metadata, granted_at')
      .eq('id', input.entitlementId)
      .maybeSingle();

    if (entitlementError || !entitlement?.id) {
      throw new ApiException(
        '롤백 대상 entitlement 조회 실패',
        500,
        'V2_ADMIN_ENTITLEMENT_ROLLBACK_FETCH_FAILED',
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await this.supabase
      .from('v2_digital_entitlements')
      .update({
        status: desiredStatus,
        granted_at:
          desiredStatus === 'GRANTED' ? entitlement.granted_at || now : null,
        revoked_at: null,
        revoke_reason: null,
        failed_at: null,
        metadata: this.mergeMetadata(entitlement.metadata, {
          last_manual_stage_rollback: {
            at: now,
            target_stage: input.targetStage,
            reason: input.reason,
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            ...input.metadata,
          },
        }),
      })
      .eq('id', input.entitlementId);

    if (updateError) {
      throw new ApiException(
        'entitlement 상태 롤백 실패',
        500,
        'V2_ADMIN_ENTITLEMENT_ROLLBACK_UPDATE_FAILED',
      );
    }

    return {
      entitlement_id: input.entitlementId,
      status: desiredStatus,
    };
  }

  private async syncOrderDeliveredState(input: {
    row: OrderLinearTransitionRow;
    reason: string | null;
    metadata: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    try {
      const orderId = input.row.order_id;
      const queueByOrderId = await this.fetchOrderQueueByOrderId([orderId]);
      const shipmentsByOrderId = await this.fetchShipmentsByOrderId([orderId]);
      const entitlementsByOrderId = await this.fetchEntitlementsByOrderId([
        orderId,
      ]);
      const queue = queueByOrderId.get(orderId) || null;
      const shipments = shipmentsByOrderId.get(orderId) || [];
      const entitlements = entitlementsByOrderId.get(orderId) || [];

      const composition = {
        has_physical: Boolean(queue?.has_physical) || shipments.length > 0,
        has_digital: Boolean(queue?.has_digital) || entitlements.length > 0,
      };
      const allPhysicalDelivered = !composition.has_physical
        ? true
        : shipments.length > 0 &&
          shipments.every(
            (shipment) =>
              String(shipment.shipment_status || '').toUpperCase() ===
              'DELIVERED',
          );
      const allDigitalGranted = !composition.has_digital
        ? true
        : entitlements.length > 0 &&
          entitlements.every(
            (entitlement) =>
              String(entitlement.status || '').toUpperCase() === 'GRANTED',
          );

      if (!allPhysicalDelivered || !allDigitalGranted) {
        return null;
      }

      const { data: currentOrder, error: orderError } = await this.supabase
        .from('v2_orders')
        .select(
          'id, order_status, fulfillment_status, confirmed_at, completed_at, metadata',
        )
        .eq('id', orderId)
        .maybeSingle();

      if (orderError || !currentOrder?.id) {
        throw new ApiException(
          '배송 완료 동기화 대상 order 조회 실패',
          500,
          'V2_ADMIN_ORDER_DELIVERED_SYNC_FETCH_FAILED',
        );
      }

      const now = new Date().toISOString();
      const { error: orderUpdateError } = await this.supabase
        .from('v2_orders')
        .update({
          order_status: 'COMPLETED',
          fulfillment_status: 'FULFILLED',
          confirmed_at: currentOrder.confirmed_at || now,
          completed_at: currentOrder.completed_at || now,
          metadata: this.mergeMetadata(currentOrder.metadata, {
            last_manual_stage_transition: {
              at: now,
              target_stage: 'DELIVERED',
              reason: input.reason,
              source: 'ORDER_LINEAR_STAGE_TRANSITION',
              ...input.metadata,
            },
          }),
        })
        .eq('id', orderId);

      if (orderUpdateError) {
        throw new ApiException(
          '배송 완료 동기화 order 상태 업데이트 실패',
          500,
          'V2_ADMIN_ORDER_DELIVERED_SYNC_UPDATE_FAILED',
        );
      }

      const { error: orderItemUpdateError } = await this.supabase
        .from('v2_order_items')
        .update({ line_status: 'FULFILLED' })
        .eq('order_id', orderId)
        .in('line_status', ['PENDING', 'CONFIRMED']);

      if (orderItemUpdateError) {
        throw new ApiException(
          '배송 완료 동기화 order item 상태 업데이트 실패',
          500,
          'V2_ADMIN_ORDER_ITEM_DELIVERED_SYNC_UPDATE_FAILED',
        );
      }

      return {
        status: 'SUCCEEDED',
        order_id: input.row.order_id,
        order_no: input.row.order_no,
        action_key: 'ORDER_DELIVERED_SYNC',
        resource_type: 'ORDER',
        resource_id: input.row.order_id,
      };
    } catch (error) {
      const parsed = this.parseActionError(error);
      return {
        status: 'FAILED',
        order_id: input.row.order_id,
        order_no: input.row.order_no,
        action_key: 'ORDER_DELIVERED_SYNC',
        resource_type: 'ORDER',
        resource_id: input.row.order_id,
        error_code: parsed.error_code,
        error_message: parsed.message,
      };
    }
  }

  private buildActionRequestId(input: {
    requestId: string | null;
    row: OrderLinearTransitionRow;
    action: OrderLinearTransitionAction;
    actionIndex: number;
  }): string {
    const base =
      this.normalizeOptionalText(input.requestId) ||
      `linear-stage-${Date.now()}-${input.row.order_id}`;
    const rawRequestId = `${base}:${input.action.action_key}:${input.action.resource_id}:${input.actionIndex}`;

    if (rawRequestId.length <= MAX_ACTION_REQUEST_ID_LENGTH) {
      return rawRequestId;
    }

    const digest = createHash('sha1')
      .update(rawRequestId)
      .digest('hex')
      .slice(0, 24);
    return `linear-stage:${input.action.action_key}:${input.actionIndex}:${digest}`.slice(
      0,
      MAX_ACTION_REQUEST_ID_LENGTH,
    );
  }

  private async findActionLogIdByRequestId(
    requestId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('v2_admin_action_logs')
      .select('id, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) {
      return null;
    }
    return data.id as string;
  }

  private parseActionError(error: unknown): {
    error_code: string;
    message: string;
  } {
    if (error instanceof ApiException) {
      const response = error.getResponse() as
        | string
        | { message?: string; errorCode?: string };
      if (typeof response === 'string') {
        return {
          error_code: 'API_EXCEPTION',
          message: response,
        };
      }
      return {
        error_code: response?.errorCode || 'API_EXCEPTION',
        message: response?.message || '전환 액션 실행 중 오류가 발생했습니다.',
      };
    }

    if (error instanceof Error) {
      return {
        error_code: 'UNEXPECTED_ERROR',
        message: error.message,
      };
    }

    return {
      error_code: 'UNEXPECTED_ERROR',
      message: '전환 액션 실행 중 알 수 없는 오류가 발생했습니다.',
    };
  }

  private normalizeTargetStage(raw?: string): V2OrderLinearStage {
    const normalized = this.normalizeRequiredText(
      raw,
      'target_stage가 필요합니다',
    ).toUpperCase() as V2OrderLinearStage;

    if (!LINEAR_STAGE_ORDER.includes(normalized)) {
      throw new ApiException(
        `지원하지 않는 target_stage 입니다: ${normalized}`,
        400,
        'V2_ADMIN_ORDER_LINEAR_STAGE_INVALID',
      );
    }
    return normalized;
  }

  private normalizeTransitionScope(raw?: string): V2OrderTransitionScope {
    const normalized = this.normalizeOptionalText(raw)?.toUpperCase();
    if (!normalized || normalized === 'FULL') {
      return 'FULL';
    }
    if (normalized === 'ORDER_QUEUE') {
      return 'ORDER_QUEUE';
    }
    throw new ApiException(
      `지원하지 않는 scope 입니다: ${normalized}`,
      400,
      'V2_ADMIN_ORDER_LINEAR_SCOPE_INVALID',
    );
  }

  private normalizeOrderIds(raw?: string[]): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ApiException(
        'order_ids 배열이 필요합니다',
        400,
        'V2_ADMIN_ORDER_LINEAR_IDS_REQUIRED',
      );
    }

    const deduped = Array.from(
      new Set(
        raw
          .map((value) => this.normalizeOptionalText(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (deduped.length === 0) {
      throw new ApiException(
        '유효한 order_id가 없습니다',
        400,
        'V2_ADMIN_ORDER_LINEAR_IDS_REQUIRED',
      );
    }
    if (deduped.length > 200) {
      throw new ApiException(
        'order_ids는 최대 200개까지 허용됩니다',
        400,
        'V2_ADMIN_ORDER_LINEAR_IDS_TOO_MANY',
      );
    }

    for (const orderId of deduped) {
      if (!this.isUuid(orderId)) {
        throw new ApiException(
          `order_id UUID 형식이 올바르지 않습니다: ${orderId}`,
          400,
          'V2_ADMIN_ORDER_LINEAR_ID_INVALID',
        );
      }
    }

    return deduped;
  }

  private normalizeActor(actor?: V2AdminActionActor): V2AdminActionActor {
    const actorId = this.normalizeOptionalText(actor?.id || null);
    return {
      id: actorId && this.isUuid(actorId) ? actorId : null,
      email: this.normalizeOptionalText(actor?.email || null),
      isLocalBypass: Boolean(actor?.isLocalBypass),
    };
  }

  private async fetchOrdersById(orderIds: string[]): Promise<Map<string, any>> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select(
        'id, order_no, order_status, payment_status, fulfillment_status, grand_total, metadata',
      )
      .in('id', orderIds);

    if (error) {
      throw new ApiException(
        '주문 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_ORDERS_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      if (row?.id) {
        map.set(String(row.id), row);
      }
    }
    return map;
  }

  private async fetchOrderQueueByOrderId(
    orderIds: string[],
  ): Promise<Map<string, any>> {
    const { data, error } = await this.supabase
      .from('v2_admin_order_queue_view')
      .select(
        'order_id, has_bundle, has_physical, has_digital, waiting_shipment_count, in_transit_shipment_count, delivered_shipment_count',
      )
      .in('order_id', orderIds);

    if (error) {
      throw new ApiException(
        'order queue 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_QUEUE_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      if (row?.order_id) {
        map.set(String(row.order_id), row);
      }
    }
    return map;
  }

  private async fetchShipmentsByOrderId(
    orderIds: string[],
  ): Promise<Map<string, ShipmentRow[]>> {
    const { data, error } = await this.supabase
      .from('v2_admin_fulfillment_queue_view')
      .select('order_id, shipment_id, shipment_status')
      .in('order_id', orderIds)
      .eq('fulfillment_kind', 'SHIPMENT')
      .not('shipment_id', 'is', null);

    if (error) {
      throw new ApiException(
        'shipment 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_SHIPMENT_FETCH_FAILED',
      );
    }

    const map = new Map<string, ShipmentRow[]>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalText(row.order_id);
      const shipmentId = this.normalizeOptionalText(row.shipment_id);
      if (!orderId || !shipmentId) {
        continue;
      }
      const list = map.get(orderId) || [];
      list.push({
        shipment_id: shipmentId,
        shipment_status: this.normalizeOptionalText(row.shipment_status),
      });
      map.set(orderId, list);
    }
    return map;
  }

  private async fetchEntitlementsByOrderId(
    orderIds: string[],
  ): Promise<Map<string, EntitlementRow[]>> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select('id, order_id, status, download_count')
      .in('order_id', orderIds)
      .in('status', ['PENDING', 'GRANTED', 'EXPIRED', 'FAILED', 'REVOKED']);

    if (error) {
      throw new ApiException(
        'entitlement 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_ENTITLEMENT_FETCH_FAILED',
      );
    }

    const map = new Map<string, EntitlementRow[]>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalText(row.order_id);
      const entitlementId = this.normalizeOptionalText(row.id);
      if (!orderId || !entitlementId) {
        continue;
      }
      const list = map.get(orderId) || [];
      list.push({
        id: entitlementId,
        order_id: orderId,
        status: this.normalizeOptionalText(row.status) || 'PENDING',
        download_count:
          typeof row.download_count === 'number' &&
          Number.isFinite(row.download_count)
            ? Math.max(0, Math.floor(row.download_count))
            : 0,
      });
      map.set(orderId, list);
    }
    return map;
  }

  private requiresShipmentBootstrap(stage: V2OrderLinearStage): boolean {
    return (
      stage === 'READY_TO_SHIP' ||
      stage === 'IN_TRANSIT' ||
      stage === 'DELIVERED'
    );
  }

  private async bootstrapPhysicalShipments(input: {
    orderIds: string[];
    ordersById: Map<string, any>;
    queueByOrderId: Map<string, any>;
    targetStage: V2OrderLinearStage;
    metadata: Record<string, unknown>;
  }): Promise<Map<string, string>> {
    const errors = new Map<string, string>();

    for (const orderId of input.orderIds) {
      const order = input.ordersById.get(orderId) || null;
      const queue = input.queueByOrderId.get(orderId) || null;
      if (!order || !queue || !Boolean(queue.has_physical)) {
        continue;
      }

      const shipmentCount =
        Number(queue.waiting_shipment_count || 0) +
        Number(queue.in_transit_shipment_count || 0) +
        Number(queue.delivered_shipment_count || 0);
      if (shipmentCount > 0) {
        continue;
      }

      try {
        await this.v2FulfillmentService.ensureShipmentInfrastructure({
          order_id: orderId,
          provider_type: 'MANUAL',
          metadata: {
            ...input.metadata,
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            target_stage: input.targetStage,
          },
        });
      } catch (error) {
        errors.set(orderId, this.resolveShipmentBootstrapErrorMessage(error));
      }
    }

    return errors;
  }

  private resolveShipmentBootstrapErrorMessage(error: unknown): string {
    if (error instanceof ApiException) {
      const payload = error.getResponse();
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const message = this.normalizeOptionalText(
          (payload as Record<string, unknown>).message as string | null,
        );
        if (message) {
          return `shipment 준비 실패: ${message}`;
        }
      }
      return `shipment 준비 실패: ${error.message}`;
    }

    if (error instanceof Error) {
      return `shipment 준비 실패: ${error.message}`;
    }

    return 'shipment 준비 실패: 알 수 없는 오류';
  }

  private linearStageLabel(stage: V2OrderLinearStage): string {
    if (stage === 'PAYMENT_PENDING') {
      return '입금 대기';
    }
    if (stage === 'PAYMENT_CONFIRMED') {
      return '입금 확인';
    }
    if (stage === 'PRODUCTION') {
      return '제작중';
    }
    if (stage === 'READY_TO_SHIP') {
      return '배송 대기';
    }
    if (stage === 'IN_TRANSIT') {
      return '배송 중';
    }
    return '배송 완료';
  }

  private mergeMetadata(
    base: unknown,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const safeBase =
      base && typeof base === 'object' && !Array.isArray(base)
        ? (base as Record<string, unknown>)
        : {};
    return {
      ...safeBase,
      ...patch,
    };
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    message: string,
  ): string {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new ApiException(message, 400, 'V2_ADMIN_REQUIRED_FIELD');
    }
    return normalized;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalJsonObject(
    value?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'metadata는 JSON object 형식이어야 합니다',
        400,
        'V2_ADMIN_JSON_INVALID',
      );
    }
    return value;
  }

  private isUuid(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
}
